import type { ObservabilityService } from './observabilityService.js'

export type RuntimeMode = 'normal' | 'degraded'
export type RuntimeRiskLevel = 'high' | 'low'
export type RuntimeSubsystemCriticality = 'critical' | 'degraded-allowed' | 'optional'

export type RuntimeGovernanceCapability =
  | 'orchestrator.command.execute'
  | 'public.interaction.respond'
  | 'public.interaction.action.execute'

export type RuntimeGovernanceDecision = {
  capability: RuntimeGovernanceCapability
  allowed: boolean
  reason: 'normal-mode' | 'degraded-high-risk-blocked'
  riskLevel: RuntimeRiskLevel
  evaluatedAt: string
}

export type RuntimeGovernanceResponseMetadata = {
  runtimeMode: RuntimeMode
  degradedReason?: string
  blockedCapabilities: RuntimeGovernanceCapability[]
  governanceDecision: RuntimeGovernanceDecision
}

export type RuntimeSubsystemStatus = {
  subsystem: string
  criticality: RuntimeSubsystemCriticality
  started: boolean
  healthy: boolean
  lastFailure?: {
    message: string
    observedAt: string
  }
}

export type RuntimeGovernanceStatus = {
  runtimeMode: RuntimeMode
  degradedReason?: string
  blockedCapabilities: RuntimeGovernanceCapability[]
  hardReadinessFailure?: {
    subsystem: string
    criticality: RuntimeSubsystemCriticality
    message: string
    observedAt: string
  }
  subsystemMatrix: RuntimeSubsystemStatus[]
  lastUpdatedAt: string
}

export type RuntimeStartupFailureDecision = {
  subsystem: string
  criticality: RuntimeSubsystemCriticality
  action: 'fail-startup' | 'enter-degraded-mode' | 'continue-optional'
  message: string
}

type RuntimeGovernanceServiceOptions = {
  observability?: ObservabilityService
}

const DEGRADED_BLOCKED_CAPABILITIES: RuntimeGovernanceCapability[] = [
  'orchestrator.command.execute',
  'public.interaction.action.execute',
]

const DEFAULT_SUBSYSTEM_MATRIX: Array<{ subsystem: string, criticality: RuntimeSubsystemCriticality }> = [
  { subsystem: 'market-signal-runtime', criticality: 'critical' },
  { subsystem: 'opportunity-runtime', criticality: 'critical' },
  { subsystem: 'opportunity-governance-runtime', criticality: 'critical' },
  { subsystem: 'sovereign-execution-runtime', criticality: 'critical' },
  { subsystem: 'revenue-attribution-runtime', criticality: 'critical' },
  { subsystem: 'economic-feedback-runtime', criticality: 'critical' },
  { subsystem: 'terminal-failure-detection-runtime', criticality: 'degraded-allowed' },
  { subsystem: 'negative-attribution-runtime', criticality: 'degraded-allowed' },
  { subsystem: 'adaptive-weight-snapshot-runtime', criticality: 'degraded-allowed' },
  { subsystem: 'adaptive-influence-gate-runtime', criticality: 'degraded-allowed' },
  { subsystem: 'shadow-proposal-confidence-runtime', criticality: 'optional' },
]

export class RuntimeGovernanceService {
  private readonly observability?: ObservabilityService
  private readonly subsystems = new Map<string, RuntimeSubsystemStatus>()
  private runtimeMode: RuntimeMode = 'normal'
  private degradedReason?: string
  private blockedCapabilities: RuntimeGovernanceCapability[] = []
  private hardReadinessFailure?: {
    subsystem: string
    criticality: RuntimeSubsystemCriticality
    message: string
    observedAt: string
  }
  private lastUpdatedAt = new Date().toISOString()

  constructor(options: RuntimeGovernanceServiceOptions = {}) {
    this.observability = options.observability

    for (const entry of DEFAULT_SUBSYSTEM_MATRIX) {
      this.subsystems.set(entry.subsystem, {
        subsystem: entry.subsystem,
        criticality: entry.criticality,
        started: false,
        healthy: false,
      })
    }
  }

  registerStartupSuccess(subsystem: string) {
    const existing = this.ensureSubsystem(subsystem)
    this.subsystems.set(subsystem, {
      ...existing,
      started: true,
      healthy: true,
    })
    this.touch()
  }

  registerStartupFailure(args: {
    subsystem: string
    criticality: RuntimeSubsystemCriticality
    message: string
    observedAt?: string
  }): RuntimeStartupFailureDecision {
    const observedAt = args.observedAt ?? new Date().toISOString()
    const existing = this.ensureSubsystem(args.subsystem, args.criticality)

    this.subsystems.set(args.subsystem, {
      ...existing,
      criticality: args.criticality,
      started: false,
      healthy: false,
      lastFailure: {
        message: args.message,
        observedAt,
      },
    })

    if (args.criticality === 'critical') {
      this.hardReadinessFailure = {
        subsystem: args.subsystem,
        criticality: args.criticality,
        message: args.message,
        observedAt,
      }
      this.emitStartupFailureMetric(args.subsystem, args.criticality)
      this.touch()
      return {
        subsystem: args.subsystem,
        criticality: args.criticality,
        action: 'fail-startup',
        message: args.message,
      }
    }

    if (args.criticality === 'degraded-allowed') {
      this.runtimeMode = 'degraded'
      this.degradedReason = `${args.subsystem}:${args.message}`
      this.blockedCapabilities = [...DEGRADED_BLOCKED_CAPABILITIES]
      this.emitStartupFailureMetric(args.subsystem, args.criticality)
      this.touch()
      return {
        subsystem: args.subsystem,
        criticality: args.criticality,
        action: 'enter-degraded-mode',
        message: args.message,
      }
    }

    this.emitStartupFailureMetric(args.subsystem, args.criticality)
    this.touch()
    return {
      subsystem: args.subsystem,
      criticality: args.criticality,
      action: 'continue-optional',
      message: args.message,
    }
  }

  evaluateCapability(args: {
    capability: RuntimeGovernanceCapability
    riskLevel: RuntimeRiskLevel
    now?: string
  }): RuntimeGovernanceResponseMetadata {
    const decision: RuntimeGovernanceDecision = {
      capability: args.capability,
      allowed: true,
      reason: 'normal-mode',
      riskLevel: args.riskLevel,
      evaluatedAt: args.now ?? new Date().toISOString(),
    }

    if (
      this.runtimeMode === 'degraded'
      && args.riskLevel === 'high'
      && this.blockedCapabilities.includes(args.capability)
    ) {
      decision.allowed = false
      decision.reason = 'degraded-high-risk-blocked'
    }

    return {
      runtimeMode: this.runtimeMode,
      degradedReason: this.degradedReason,
      blockedCapabilities: [...this.blockedCapabilities],
      governanceDecision: decision,
    }
  }

  getStatus(): RuntimeGovernanceStatus {
    return {
      runtimeMode: this.runtimeMode,
      degradedReason: this.degradedReason,
      blockedCapabilities: [...this.blockedCapabilities],
      hardReadinessFailure: this.hardReadinessFailure,
      subsystemMatrix: Array.from(this.subsystems.values()),
      lastUpdatedAt: this.lastUpdatedAt,
    }
  }

  private ensureSubsystem(subsystem: string, criticality: RuntimeSubsystemCriticality = 'optional') {
    const existing = this.subsystems.get(subsystem)
    if (existing) {
      return existing
    }

    const created: RuntimeSubsystemStatus = {
      subsystem,
      criticality,
      started: false,
      healthy: false,
    }
    this.subsystems.set(subsystem, created)
    return created
  }

  private emitStartupFailureMetric(subsystem: string, criticality: RuntimeSubsystemCriticality) {
    this.observability?.incrementMetric('runtime_governance_startup_failure_total', 1, {
      subsystem,
      criticality,
    })
  }

  private touch() {
    this.lastUpdatedAt = new Date().toISOString()
  }
}

export function createRuntimeGovernanceService(options: RuntimeGovernanceServiceOptions = {}) {
  return new RuntimeGovernanceService(options)
}
