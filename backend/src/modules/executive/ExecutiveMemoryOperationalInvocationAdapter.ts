import type { AuthContext } from '../../auth/authTypes.js'
import type {
  ExecutiveMemoryOperationalInvocationRequest,
  ExecutiveMemoryOperationalInvocationResult,
  ExecutiveMemoryOperationalInvocationService,
} from './ExecutiveMemoryOperationalInvocationService.js'

export interface ExecutiveMemoryOperationalInvocationAdapterRequest {
  principal: Pick<AuthContext, 'userId' | 'tenantId' | 'roles'>
  maxBatches?: number
  limit?: number
}

export interface ExecutiveMemoryOperationalInvocationAdapterDependencies {
  operationalInvocationService: Pick<ExecutiveMemoryOperationalInvocationService, 'invoke'>
}

function requirePositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Executive memory operational invocation adapter requires ${label}.`)
  }
}

function cloneRoles(roles: string[]) {
  return [...roles]
}

function buildInvocationRequest(
  request: ExecutiveMemoryOperationalInvocationAdapterRequest,
): ExecutiveMemoryOperationalInvocationRequest {
  requirePositiveInteger(request.principal.userId, 'principal.userId')
  requirePositiveInteger(request.principal.tenantId, 'principal.tenantId')

  if (!Array.isArray(request.principal.roles)) {
    throw new Error('Executive memory operational invocation adapter requires principal.roles.')
  }

  return {
    actor: {
      actorId: `user:${request.principal.userId}`,
      tenantId: request.principal.tenantId,
      roles: cloneRoles(request.principal.roles),
    },
    tenantId: request.principal.tenantId,
    maxBatches: request.maxBatches,
    limit: request.limit,
  }
}

function cloneTotals(
  totals: ExecutiveMemoryOperationalInvocationResult['totals'],
): ExecutiveMemoryOperationalInvocationResult['totals'] {
  return {
    processed: totals.processed,
    captured: totals.captured,
    created: totals.created,
    failed: totals.failed,
  }
}

function buildAdapterResult(
  result: ExecutiveMemoryOperationalInvocationResult,
): ExecutiveMemoryOperationalInvocationResult {
  return {
    status: result.status,
    batchesExecuted: result.batchesExecuted,
    captureCycleId: result.captureCycleId,
    cursor: result.cursor,
    totals: cloneTotals(result.totals),
  }
}

export class ExecutiveMemoryOperationalInvocationAdapter {
  constructor(
    private readonly dependencies: ExecutiveMemoryOperationalInvocationAdapterDependencies,
  ) {}

  async invoke(
    request: ExecutiveMemoryOperationalInvocationAdapterRequest,
  ): Promise<ExecutiveMemoryOperationalInvocationResult> {
    const result = await this.dependencies.operationalInvocationService.invoke(
      buildInvocationRequest(request),
    )

    return buildAdapterResult(result)
  }
}

export function createExecutiveMemoryOperationalInvocationAdapter(
  dependencies: ExecutiveMemoryOperationalInvocationAdapterDependencies,
) {
  return new ExecutiveMemoryOperationalInvocationAdapter(dependencies)
}
