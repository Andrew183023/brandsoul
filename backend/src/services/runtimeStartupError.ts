import type { RuntimeSubsystemCriticality } from './runtimeGovernanceService.js'

export class RuntimeStartupError extends Error {
  readonly subsystem: string
  readonly criticality: RuntimeSubsystemCriticality
  override readonly cause?: unknown

  constructor(args: {
    subsystem: string
    criticality: RuntimeSubsystemCriticality
    message: string
    cause?: unknown
  }) {
    super(args.message)
    this.name = 'RuntimeStartupError'
    this.subsystem = args.subsystem
    this.criticality = args.criticality
    this.cause = args.cause
  }
}
