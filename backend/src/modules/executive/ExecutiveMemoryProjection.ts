import { hashFlowMindValue } from '../../orchestrator/flowMindHashing.js'
import type { OfficeHealthDriver } from './OfficeHealthTypes.js'
import type {
  ExecutiveMemoryDecisionCenterProjection,
  ExecutiveMemoryDecisionEvidenceProjection,
  ExecutiveMemoryDecisionProjection,
  ExecutiveMemoryDriverProjection,
  ExecutiveMemoryOfficeHealthProjection,
  ExecutiveMemoryProjection,
  ExecutiveMemoryProjectionInput,
  ExecutiveMemoryTimelineEvidenceProjection,
  ExecutiveMemoryTimelineItemProjection,
  ExecutiveMemoryTimelineProjection,
} from './ExecutiveMemoryProjectionTypes.js'
import { EXECUTIVE_MEMORY_PROJECTION_VERSION } from './ExecutiveMemoryProjectionTypes.js'

function assertNonEmptyString(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`Executive memory projection requires ${label}.`)
  }
}

function assertTenantId(tenantId: number) {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error('Executive memory projection requires tenantId.')
  }
}

function sanitizeDriver(driver: OfficeHealthDriver): ExecutiveMemoryDriverProjection {
  return {
    key: driver.key,
    title: driver.title,
    impact: driver.impact,
    weight: driver.weight,
    summary: driver.summary,
  }
}

function sanitizeOfficeHealth(input: ExecutiveMemoryProjectionInput['officeHealth']): ExecutiveMemoryOfficeHealthProjection {
  return {
    score: input.score,
    level: input.level,
    explanation: input.explanation,
    positives: input.positives.map(sanitizeDriver),
    warnings: input.warnings.map(sanitizeDriver),
    opportunities: input.opportunities.map(sanitizeDriver),
    drivers: input.drivers.map(sanitizeDriver),
  }
}

function sanitizeDecisionEvidence(
  evidence: ExecutiveMemoryProjectionInput['decisionCenter']['decisions'][number]['evidence'][number],
): ExecutiveMemoryDecisionEvidenceProjection {
  const projection: ExecutiveMemoryDecisionEvidenceProjection = {
    key: evidence.key,
    label: evidence.label,
    summary: evidence.summary,
  }

  if (typeof evidence.value !== 'undefined') {
    projection.value = evidence.value
  }

  return projection
}

function sanitizeDecision(
  decision: ExecutiveMemoryProjectionInput['decisionCenter']['decisions'][number],
): ExecutiveMemoryDecisionProjection {
  return {
    id: decision.id,
    type: decision.type,
    title: decision.title,
    priority: decision.priority,
    impact: decision.impact,
    confidence: decision.confidence,
    explanation: decision.explanation,
    evidence: decision.evidence.map(sanitizeDecisionEvidence),
    recommendedActions: decision.recommendedActions.map((action) => action),
    blockingFactors: decision.blockingFactors.map((factor) => factor),
  }
}

function sanitizeDecisionCenter(
  input: ExecutiveMemoryProjectionInput['decisionCenter'],
): ExecutiveMemoryDecisionCenterProjection {
  return {
    decisions: input.decisions.map(sanitizeDecision),
  }
}

function sanitizeTimelineEvidence(
  evidence: ExecutiveMemoryProjectionInput['executiveTimeline']['items'][number]['evidence'][number],
): ExecutiveMemoryTimelineEvidenceProjection {
  const projection: ExecutiveMemoryTimelineEvidenceProjection = {
    key: evidence.key,
    description: evidence.description,
  }

  if (typeof evidence.value !== 'undefined') {
    projection.value = evidence.value
  }

  return projection
}

function sanitizeTimelineItem(
  item: ExecutiveMemoryProjectionInput['executiveTimeline']['items'][number],
): ExecutiveMemoryTimelineItemProjection {
  const projection: ExecutiveMemoryTimelineItemProjection = {
    id: item.id,
    category: item.category,
    importance: item.importance,
    temporalKind: item.temporalKind,
    title: item.title,
    summary: item.summary,
    evidence: item.evidence.map(sanitizeTimelineEvidence),
    source: item.source,
    sourceKey: item.sourceKey,
  }

  if (typeof item.suggestedAction !== 'undefined') {
    projection.suggestedAction = item.suggestedAction
  }

  if (typeof item.occurredAt !== 'undefined') {
    projection.occurredAt = item.occurredAt
  }

  return projection
}

function sanitizeExecutiveTimeline(
  input: ExecutiveMemoryProjectionInput['executiveTimeline'],
): ExecutiveMemoryTimelineProjection {
  return {
    items: input.items.map(sanitizeTimelineItem),
    totalDetected: input.totalDetected,
    totalPublished: input.totalPublished,
    generatedAt: input.generatedAt,
  }
}

function buildContentFingerprintValue(args: {
  officeHealth: ExecutiveMemoryOfficeHealthProjection
  decisionCenter: ExecutiveMemoryDecisionCenterProjection
  executiveTimeline: ExecutiveMemoryTimelineProjection
}) {
  return {
    projectionVersion: EXECUTIVE_MEMORY_PROJECTION_VERSION,
    officeHealth: args.officeHealth,
    decisionCenter: args.decisionCenter,
    executiveTimeline: {
      items: args.executiveTimeline.items,
      totalDetected: args.executiveTimeline.totalDetected,
      totalPublished: args.executiveTimeline.totalPublished,
    },
  }
}

function buildSourceFingerprintValue(args: {
  sourceGrowthGeneratedAt: string
  sourceOperationalGeneratedAt: string
}) {
  return {
    projectionVersion: EXECUTIVE_MEMORY_PROJECTION_VERSION,
    sourceGrowthGeneratedAt: args.sourceGrowthGeneratedAt,
    sourceOperationalGeneratedAt: args.sourceOperationalGeneratedAt,
  }
}

export function buildExecutiveMemoryProjection(
  input: ExecutiveMemoryProjectionInput,
): ExecutiveMemoryProjection {
  assertTenantId(input.tenantId)
  assertNonEmptyString(input.officeId, 'officeId')
  assertNonEmptyString(input.capturedAt, 'capturedAt')
  assertNonEmptyString(input.sourceGrowthGeneratedAt, 'sourceGrowthGeneratedAt')
  assertNonEmptyString(input.sourceOperationalGeneratedAt, 'sourceOperationalGeneratedAt')

  const officeHealth = sanitizeOfficeHealth(input.officeHealth)
  const decisionCenter = sanitizeDecisionCenter(input.decisionCenter)
  const executiveTimeline = sanitizeExecutiveTimeline(input.executiveTimeline)

  return {
    projectionVersion: EXECUTIVE_MEMORY_PROJECTION_VERSION,
    tenantId: input.tenantId,
    officeId: input.officeId,
    capturedAt: input.capturedAt,
    sourceGrowthGeneratedAt: input.sourceGrowthGeneratedAt,
    sourceOperationalGeneratedAt: input.sourceOperationalGeneratedAt,
    officeHealth,
    decisionCenter,
    executiveTimeline,
    contentFingerprint: hashFlowMindValue(buildContentFingerprintValue({
      officeHealth,
      decisionCenter,
      executiveTimeline,
    })),
    sourceFingerprint: hashFlowMindValue(buildSourceFingerprintValue({
      sourceGrowthGeneratedAt: input.sourceGrowthGeneratedAt,
      sourceOperationalGeneratedAt: input.sourceOperationalGeneratedAt,
    })),
  }
}
