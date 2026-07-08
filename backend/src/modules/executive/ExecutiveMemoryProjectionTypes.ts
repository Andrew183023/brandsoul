import type {
  DecisionCenterResult,
  ExecutiveDecisionImpact,
  ExecutiveDecisionPriority,
  ExecutiveDecisionType,
} from './DecisionCenterTypes.js'
import type { ExecutiveTimelineCategory, ExecutiveTimelineTemporalKind } from './ExecutiveTimelineTypes.js'
import type { OfficeHealth, OfficeHealthDriver } from './OfficeHealthTypes.js'

export const EXECUTIVE_MEMORY_PROJECTION_VERSION = 1 as const

export interface ExecutiveMemoryProjectionInput {
  tenantId: number
  officeId: string
  officeHealth: OfficeHealth
  decisionCenter: DecisionCenterResult
  executiveTimeline: {
    items: Array<{
      id: string
      category: ExecutiveTimelineCategory
      importance: 'critical' | 'high' | 'medium' | 'low'
      temporalKind: ExecutiveTimelineTemporalKind
      title: string
      summary: string
      evidence: Array<{
        key: string
        value?: string | number | boolean | null
        description: string
      }>
      suggestedAction?: string
      occurredAt?: string
      source: 'growth' | 'operational' | 'office_health' | 'decision_center'
      sourceKey: string
    }>
    totalDetected: number
    totalPublished: number
    generatedAt: string
  }
  sourceGrowthGeneratedAt: string
  sourceOperationalGeneratedAt: string
  capturedAt: string
}

export interface ExecutiveMemoryDriverProjection {
  key: OfficeHealthDriver['key']
  title: OfficeHealthDriver['title']
  impact: OfficeHealthDriver['impact']
  weight: OfficeHealthDriver['weight']
  summary: OfficeHealthDriver['summary']
}

export interface ExecutiveMemoryOfficeHealthProjection {
  score: OfficeHealth['score']
  level: OfficeHealth['level']
  explanation: OfficeHealth['explanation']
  positives: ExecutiveMemoryDriverProjection[]
  warnings: ExecutiveMemoryDriverProjection[]
  opportunities: ExecutiveMemoryDriverProjection[]
  drivers: ExecutiveMemoryDriverProjection[]
}

export interface ExecutiveMemoryDecisionEvidenceProjection {
  key: string
  label: string
  value?: string | number | boolean | null
  summary: string
}

export interface ExecutiveMemoryDecisionProjection {
  id: string
  type: ExecutiveDecisionType
  title: string
  priority: ExecutiveDecisionPriority
  impact: ExecutiveDecisionImpact
  confidence: number
  explanation: string
  evidence: ExecutiveMemoryDecisionEvidenceProjection[]
  recommendedActions: string[]
  blockingFactors: string[]
}

export interface ExecutiveMemoryDecisionCenterProjection {
  decisions: ExecutiveMemoryDecisionProjection[]
}

export interface ExecutiveMemoryTimelineEvidenceProjection {
  key: string
  value?: string | number | boolean | null
  description: string
}

export interface ExecutiveMemoryTimelineItemProjection {
  id: string
  category: ExecutiveTimelineCategory
  importance: 'critical' | 'high' | 'medium' | 'low'
  temporalKind: ExecutiveTimelineTemporalKind
  title: string
  summary: string
  evidence: ExecutiveMemoryTimelineEvidenceProjection[]
  suggestedAction?: string
  occurredAt?: string
  source: 'growth' | 'operational' | 'office_health' | 'decision_center'
  sourceKey: string
}

export interface ExecutiveMemoryTimelineProjection {
  items: ExecutiveMemoryTimelineItemProjection[]
  totalDetected: number
  totalPublished: number
  generatedAt: string
}

export interface ExecutiveMemoryProjection {
  projectionVersion: typeof EXECUTIVE_MEMORY_PROJECTION_VERSION
  tenantId: number
  officeId: string
  capturedAt: string
  sourceGrowthGeneratedAt: string
  sourceOperationalGeneratedAt: string
  officeHealth: ExecutiveMemoryOfficeHealthProjection
  decisionCenter: ExecutiveMemoryDecisionCenterProjection
  executiveTimeline: ExecutiveMemoryTimelineProjection
  contentFingerprint: string
  sourceFingerprint: string
}
