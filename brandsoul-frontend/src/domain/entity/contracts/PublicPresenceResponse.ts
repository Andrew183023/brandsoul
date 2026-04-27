type PresenceHealthSummary = {
  trend: string
  intensity: string
  summary: string
  recentSignals: Array<{
    label: string
    value?: string | number | boolean
  }>
}

type RelationalProjectionSummary = {
  summary?: string
  status?: string
  level?: string
}

type DashboardDeprecatedFallback = {
  reason: string
  summary?: string
}

type DashboardPublicFlowMindPartialAutomationMode = 'manual' | 'assisted' | 'automatic'

type FrameRenderSpec = Record<string, unknown>

export type PublicFlowMindPartialConfig = {
  readinessState: 'not-ready' | 'forming' | 'ready'
  readinessScore?: number
  rolloutPercentage: number
  latencyBudgetMs: number
  criticalDivergenceThreshold: number
  killSwitchEnabled: boolean
  automationMode?: DashboardPublicFlowMindPartialAutomationMode
  enabled: boolean
  activationReason: string
}

export type PublicPresenceCTA = {
  type: 'explore' | 'follow' | 'interact' | 'share' | 'return'
  label: string
}

export type PublicPresenceResponse = {
  entity: {
    id: string
    name: string
    tagline?: string
    avatarExportRef?: string
    species?: string
  }
  visual: {
    frameRenderSpec?: FrameRenderSpec
    intensity: number
    presenceHealth: PresenceHealthSummary
  }
  relational: {
    relationshipLabel: string
    tier?: string
    relationalProjection?: RelationalProjectionSummary
  }
  trajectory: Array<{
    summary: string
    occurredAt: string
  }>
  exports: Array<{
    id: string
    summary?: string
    origin?: string
    impact?: string
    fileUrl?: string
    occurredAt: string
  }>
  cta: PublicPresenceCTA
  deprecatedFallbacks: DashboardDeprecatedFallback[]
  publicFlowMindPartial?: PublicFlowMindPartialConfig
}
