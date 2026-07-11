import type {
  ExecutiveMemoryOperationalInvocationAuthorizationDecision,
  ExecutiveMemoryOperationalInvocationAuthorizationInput,
  ExecutiveMemoryOperationalInvocationAuthorizationPolicy,
} from './ExecutiveMemoryOperationalInvocationService.js'

export const EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_ALLOWED_ROLES = [
  'admin',
  'owner',
  'operator',
] as const

export type ExecutiveMemoryOperationalInvocationAllowedRole =
  typeof EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_ALLOWED_ROLES[number]

export interface ExecutiveMemoryOperationalInvocationPolicyDependencies {
  allowedRoles?: readonly ExecutiveMemoryOperationalInvocationAllowedRole[]
}

export const EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_DENY_REASONS = {
  actorRequired: 'actor_required',
  actorIdRequired: 'actor_id_required',
  tenantRequired: 'tenant_required',
  invalidTenant: 'invalid_tenant',
  rolesRequired: 'roles_required',
  roleNotAllowed: 'role_not_allowed',
} as const

function normalizeRole(role: string) {
  return role.trim().toLowerCase()
}

function buildAllowedRoles(
  allowedRoles: readonly ExecutiveMemoryOperationalInvocationAllowedRole[] | undefined,
) {
  return new Set((allowedRoles ?? EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_ALLOWED_ROLES).map(normalizeRole))
}

function deny(
  reason: typeof EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_DENY_REASONS[keyof typeof EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_DENY_REASONS],
): ExecutiveMemoryOperationalInvocationAuthorizationDecision {
  return {
    allowed: false,
    reason,
  }
}

export class ExecutiveMemoryOperationalInvocationPolicy
implements ExecutiveMemoryOperationalInvocationAuthorizationPolicy {
  private readonly allowedRoles

  constructor(
    dependencies: ExecutiveMemoryOperationalInvocationPolicyDependencies = {},
  ) {
    this.allowedRoles = buildAllowedRoles(dependencies.allowedRoles)
  }

  authorize(
    input: ExecutiveMemoryOperationalInvocationAuthorizationInput,
  ): ExecutiveMemoryOperationalInvocationAuthorizationDecision {
    if (!input.actor) {
      return deny(EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_DENY_REASONS.actorRequired)
    }

    if (!input.actor.actorId.trim()) {
      return deny(EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_DENY_REASONS.actorIdRequired)
    }

    if (typeof input.actor.tenantId !== 'number') {
      return deny(EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_DENY_REASONS.tenantRequired)
    }

    if (!Number.isInteger(input.actor.tenantId) || input.actor.tenantId <= 0) {
      return deny(EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_DENY_REASONS.invalidTenant)
    }

    if (!Array.isArray(input.actor.roles) || input.actor.roles.length === 0) {
      return deny(EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_DENY_REASONS.rolesRequired)
    }

    for (const role of input.actor.roles) {
      if (this.allowedRoles.has(normalizeRole(role))) {
        return { allowed: true }
      }
    }

    return deny(EXECUTIVE_MEMORY_OPERATIONAL_INVOCATION_DENY_REASONS.roleNotAllowed)
  }
}

export function createExecutiveMemoryOperationalInvocationPolicy(
  dependencies: ExecutiveMemoryOperationalInvocationPolicyDependencies = {},
) {
  return new ExecutiveMemoryOperationalInvocationPolicy(dependencies)
}
