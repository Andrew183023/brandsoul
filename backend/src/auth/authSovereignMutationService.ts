import { randomUUID } from 'node:crypto'

import type { FastifyBaseLogger } from 'fastify'

import type { BackendDatabase } from '../db/index.js'
import type { ObservabilityService } from '../services/observabilityService.js'
import {
  getInstitutionalSovereignMutationGate,
  InstitutionalSovereignMutationBlockedError,
  type SovereignMutationAttestation,
  type SovereignMutationContext,
} from '../sovereignty/institutionalSovereignMutationGate.js'
import { buildAuthAuthorityGraph } from './authAuthorityGraph.js'

export type AuthSovereignMutationScope =
  | 'auth.session.create'
  | 'auth.session.invalidate'
  | 'auth.refresh.rotate'
  | 'auth.password_reset.issue'
  | 'auth.password_reset.consume'
  | 'auth.membership.write'
  | 'auth.tenant.write'
  | 'auth.user.write'
  | 'auth.role.write'
  | 'auth.authority.transition'
  | 'auth.token.issue'
  | 'auth.token.revoke'

export type AuthSovereignMutationAttestation = {
  mutationId: string
  authScope: string
  governanceDecision: 'allowed' | 'blocked'
  continuityMode: string
  runtimeMode: string
  replayVerificationState: string
  attestationIntegrity: string
  actor: string
  targetUserId?: string
  targetTenantId?: string
  targetSessionId?: string
  lineageHash: string
  persisted: boolean
  executed: boolean
  createdAt: string
}

type ExecuteAuthMutationArgs<T> = {
  scope: AuthSovereignMutationScope
  actor: SovereignMutationContext['actor']
  traceId?: string
  targetUserId?: number | string
  targetTenantId?: number | string
  targetSessionId?: string
  requestedCapability?: string
  mutationType?: string
  work: () => Promise<T>
}

type AuthSovereignMutationServiceOptions = {
  db: BackendDatabase
  observability?: ObservabilityService
  logger?: FastifyBaseLogger
}

export class AuthSovereignMutationService {
  constructor(private readonly options: AuthSovereignMutationServiceOptions) {}

  async execute<T>(args: ExecuteAuthMutationArgs<T>): Promise<T> {
    this.options.observability?.incrementMetric('auth_sovereign_mutation_total')

    const mutationId = randomUUID()
    const traceId = args.traceId ?? `auth-${mutationId}`
    const context: SovereignMutationContext = {
      mutationType: args.mutationType ?? args.scope,
      mutationScope: 'auth',
      requestedCapability: args.requestedCapability ?? args.scope,
      runtimeMode: 'normal',
      continuityMode: 'trusted',
      replayVerificationState: 'verified',
      attestationIntegrity: 'verified',
      recoveryRequired: false,
      actor: args.actor,
      traceId,
    }

    try {
      const result = await getInstitutionalSovereignMutationGate().evaluateAndExecute({
        mutationId,
        context,
        authoritySource: `auth-sovereign:${args.scope}`,
        work: args.work,
        onAttested: async (attestation) => {
          await this.persistAttestation(args, attestation)
        },
      })
      this.options.observability?.incrementMetric('auth_sovereign_mutation_allowed_total')
      return result
    } catch (error) {
      if (error instanceof InstitutionalSovereignMutationBlockedError) {
        this.options.observability?.incrementMetric('auth_sovereign_mutation_blocked_total')
        this.recordBlockedMetrics(error.attestation)
        this.options.logger?.warn({
          event: 'auth-sovereignty.blocked',
          authScope: args.scope,
          mutationId,
          traceId,
          actor: args.actor,
        }, 'Auth mutation blocked')
      }
      throw error
    }
  }

  async getStatus() {
    const graph = await buildAuthAuthorityGraph()
    const sovereignGateStatus = await getInstitutionalSovereignMutationGate().getStatus()

    return {
      authSovereigntyState: graph.ungatedAuthPaths.length === 0 ? 'centralized' : 'partial',
      centralizedAuthCoverage: graph.centralizedAuthCoverage,
      ungatedAuthPaths: graph.ungatedAuthPaths,
      replayVerificationState: sovereignGateStatus.replayRequirements.replayVerificationState,
      continuityMode: sovereignGateStatus.continuityRequirements.continuityMode,
      attestationIntegrity: sovereignGateStatus.attestationIntegrity,
      blockedCapabilities: sovereignGateStatus.blockedCapabilities,
      authAuthorityGraph: graph.nodes,
    }
  }

  private async persistAttestation(
    args: Omit<ExecuteAuthMutationArgs<unknown>, 'work'>,
    attestation: SovereignMutationAttestation,
  ) {
    const createdAt = new Date().toISOString()
    await this.options.db.run(
      `
        INSERT INTO flowmind_auth_sovereign_attestation (
          mutation_id,
          auth_scope,
          governance_decision,
          continuity_mode,
          runtime_mode,
          replay_verification_state,
          attestation_integrity,
          actor,
          target_user_id,
          target_tenant_id,
          target_session_id,
          lineage_hash,
          persisted,
          executed,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      attestation.mutationId,
      args.scope,
      attestation.governanceDecision === 'blocked' ? 'blocked' : 'allowed',
      attestation.continuityMode,
      attestation.runtimeMode,
      attestation.replayVerificationState,
      attestation.attestationIntegrity,
      args.actor,
      args.targetUserId !== undefined ? String(args.targetUserId) : null,
      args.targetTenantId !== undefined ? String(args.targetTenantId) : null,
      args.targetSessionId ?? null,
      attestation.lineageHash,
      attestation.persisted ? 1 : 0,
      attestation.executed ? 1 : 0,
      createdAt,
    )
  }

  private recordBlockedMetrics(attestation: SovereignMutationAttestation) {
    if (attestation.replayVerificationState !== 'verified') {
      this.options.observability?.incrementMetric('auth_replay_violation_total')
      this.options.logger?.warn({
        event: 'auth-sovereignty.replay-denied',
        mutationId: attestation.mutationId,
      }, 'Auth replay integrity denied')
    }

    if (attestation.continuityMode === 'continuity_untrusted' || attestation.continuityMode === 'recovery_required') {
      this.options.observability?.incrementMetric('auth_continuity_block_total')
      this.options.logger?.warn({
        event: 'auth-sovereignty.continuity-denied',
        mutationId: attestation.mutationId,
      }, 'Auth continuity violation')
    }

    if (attestation.attestationIntegrity !== 'verified') {
      this.options.observability?.incrementMetric('auth_authority_divergence_total')
    }
  }
}

export function createAuthSovereignMutationService(options: AuthSovereignMutationServiceOptions) {
  return new AuthSovereignMutationService(options)
}
