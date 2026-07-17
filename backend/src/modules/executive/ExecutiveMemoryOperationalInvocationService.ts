import type {
  ExecutiveMemoryOperationalRunRequest,
  ExecutiveMemoryOperationalRunService,
  ExecutiveMemoryOperationalRunServiceResult,
} from './ExecutiveMemoryOperationalRunService.js'

export interface ExecutiveMemoryOperationalInvocationActor {
  actorId: string
  tenantId?: number
  roles?: string[]
}

export interface ExecutiveMemoryOperationalInvocationRequest {
  actor: ExecutiveMemoryOperationalInvocationActor
  tenantId: number
  maxBatches?: number
  limit?: number
}

export interface ExecutiveMemoryOperationalInvocationAuthorizationInput {
  actor: ExecutiveMemoryOperationalInvocationActor
  request: {
    maxBatches?: number
    limit?: number
  }
}

export type ExecutiveMemoryOperationalInvocationAuthorizationDecision =
  | { allowed: true }
  | { allowed: false; reason?: string }

export interface ExecutiveMemoryOperationalInvocationAuthorizationPolicy {
  authorize(
    input: ExecutiveMemoryOperationalInvocationAuthorizationInput,
  ):
    | ExecutiveMemoryOperationalInvocationAuthorizationDecision
    | Promise<ExecutiveMemoryOperationalInvocationAuthorizationDecision>
}

export interface ExecutiveMemoryOperationalInvocationServiceDependencies {
  authorizationPolicy: ExecutiveMemoryOperationalInvocationAuthorizationPolicy
  operationalRunService: Pick<ExecutiveMemoryOperationalRunService, 'run'>
}

export interface ExecutiveMemoryOperationalInvocationResult {
  status: ExecutiveMemoryOperationalRunServiceResult['status']
  batchesExecuted: number
  captureCycleId?: string
  cursor?: string
  totals: ExecutiveMemoryOperationalRunServiceResult['totals']
}

export class ExecutiveMemoryOperationalInvocationForbiddenError extends Error {
  readonly code = 'EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_FORBIDDEN'
  readonly statusCode = 403

  constructor(message = 'Executive memory operational invocation is forbidden.') {
    super(message)
    this.name = 'ExecutiveMemoryOperationalInvocationForbiddenError'
  }
}

function requireActorId(actorId: string) {
  if (!actorId.trim()) {
    throw new Error('Executive memory operational invocation requires actor.actorId.')
  }
}

function requirePositiveTenantId(tenantId: number) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error('Executive memory operational invocation requires tenantId.')
  }
}

function cloneActor(
  actor: ExecutiveMemoryOperationalInvocationActor,
): ExecutiveMemoryOperationalInvocationActor {
  return {
    actorId: actor.actorId,
    tenantId: actor.tenantId,
    roles: actor.roles ? [...actor.roles] : undefined,
  }
}

function cloneTotals(
  totals: ExecutiveMemoryOperationalRunServiceResult['totals'],
): ExecutiveMemoryOperationalInvocationResult['totals'] {
  return {
    processed: totals.processed,
    captured: totals.captured,
    created: totals.created,
    failed: totals.failed,
  }
}

function buildAuthorizationInput(
  request: ExecutiveMemoryOperationalInvocationRequest,
): ExecutiveMemoryOperationalInvocationAuthorizationInput {
  return {
    actor: cloneActor(request.actor),
    request: {
      maxBatches: request.maxBatches,
      limit: request.limit,
    },
  }
}

function buildInvocationResult(
  result: ExecutiveMemoryOperationalRunServiceResult,
): ExecutiveMemoryOperationalInvocationResult {
  return {
    status: result.status,
    batchesExecuted: result.batchesExecuted,
    captureCycleId: result.captureCycleId,
    cursor: result.cursor,
    totals: cloneTotals(result.totals),
  }
}

export class ExecutiveMemoryOperationalInvocationService {
  constructor(
    private readonly dependencies: ExecutiveMemoryOperationalInvocationServiceDependencies,
  ) {}

  async invoke(
    request: ExecutiveMemoryOperationalInvocationRequest,
  ): Promise<ExecutiveMemoryOperationalInvocationResult> {
    if (!request.actor) {
      throw new Error('Executive memory operational invocation requires actor.')
    }

    requireActorId(request.actor.actorId)
    requirePositiveTenantId(request.tenantId)

    const authorizationDecision = await this.dependencies.authorizationPolicy.authorize(
      buildAuthorizationInput(request),
    )

    if (!authorizationDecision.allowed) {
      throw new ExecutiveMemoryOperationalInvocationForbiddenError(authorizationDecision.reason)
    }

    const result = await this.dependencies.operationalRunService.run({
      tenantId: request.tenantId,
      maxBatches: request.maxBatches,
      limit: request.limit,
    } satisfies ExecutiveMemoryOperationalRunRequest)

    return buildInvocationResult(result)
  }
}

export function createExecutiveMemoryOperationalInvocationService(
  dependencies: ExecutiveMemoryOperationalInvocationServiceDependencies,
) {
  return new ExecutiveMemoryOperationalInvocationService(dependencies)
}
