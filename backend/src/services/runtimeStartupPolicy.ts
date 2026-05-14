import type { RuntimeSubsystemCriticality } from './runtimeGovernanceService.js'
import { RuntimeStartupError } from './runtimeStartupError.js'

type RuntimeGovernancePort = {
  registerStartupSuccess(subsystem: string): void
  registerStartupFailure(args: {
    subsystem: string
    criticality: RuntimeSubsystemCriticality
    message: string
  }): {
    action: 'fail-startup' | 'enter-degraded-mode' | 'continue-optional'
  }
  getStatus(): {
    runtimeMode: 'normal' | 'degraded'
    degradedReason?: string
    blockedCapabilities: string[]
  }
}

type RuntimeStartupLogger = {
  error(payload: Record<string, unknown>, message: string): void
  warn(payload: Record<string, unknown>, message: string): void
}

export async function startRuntimeWithGovernance(args: {
  subsystem: string
  criticality: RuntimeSubsystemCriticality
  start: () => Promise<unknown>
  runtimeGovernance: RuntimeGovernancePort
  logger: RuntimeStartupLogger
}) {
  try {
    await args.start()
    args.runtimeGovernance.registerStartupSuccess(args.subsystem)
    return
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error'
    const decision = args.runtimeGovernance.registerStartupFailure({
      subsystem: args.subsystem,
      criticality: args.criticality,
      message,
    })

    if (decision.action === 'fail-startup') {
      args.logger.error({
        event: 'runtime-governance.startup.blocked',
        subsystem: args.subsystem,
        criticality: args.criticality,
        runtimeMode: args.runtimeGovernance.getStatus().runtimeMode,
        degradedReason: args.runtimeGovernance.getStatus().degradedReason,
        error: message,
      }, 'Critical runtime failed to start. Startup blocked by runtime governance policy')

      throw new RuntimeStartupError({
        subsystem: args.subsystem,
        criticality: args.criticality,
        message,
        cause: error,
      })
    }

    if (decision.action === 'enter-degraded-mode') {
      args.logger.warn({
        event: 'runtime-governance.startup.degraded',
        subsystem: args.subsystem,
        criticality: args.criticality,
        runtimeMode: args.runtimeGovernance.getStatus().runtimeMode,
        degradedReason: args.runtimeGovernance.getStatus().degradedReason,
        blockedCapabilities: args.runtimeGovernance.getStatus().blockedCapabilities,
        error: message,
      }, 'Runtime degraded mode activated by startup governance policy')
      return
    }

    args.logger.warn({
      event: 'runtime-governance.startup.optional-failed',
      subsystem: args.subsystem,
      criticality: args.criticality,
      runtimeMode: args.runtimeGovernance.getStatus().runtimeMode,
      error: message,
    }, 'Optional runtime failed to start under runtime governance policy')
  }
}
