import { createHash } from 'node:crypto'

import type { NegativeEconomicOutcomeType } from '../negative-outcomes/negativeOutcomeTypes.js'

export type NegativeAttributionSeverity = 'low' | 'medium' | 'high' | 'critical'

export type NegativeAttributionLineageQuality =
  | 'complete'
  | 'partial'
  | 'synthetic'
  | 'missing'

export type NegativeAttributionEvent = {
  attributionId: string
  outcomeId: string
  signalId: string | null
  opportunityId: string | null
  proposalId: string | null
  executionId: string | null
  entityId: string | null
  category: string | null
  keyword: string | null
  outcomeType: NegativeEconomicOutcomeType
  severity: NegativeAttributionSeverity
  reason: string | null
  attributedAt: string
  occurredAt: string
  detectedAt: string
  sourceRuntime: string
  detectorVersion: string
  lineageQuality: NegativeAttributionLineageQuality
  metadata?: Record<string, unknown>
  createdAt: string
}

export type AppendNegativeAttributionInput = Omit<NegativeAttributionEvent, 'attributionId'> & {
  attributionId?: string
}

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

function normalizeIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildNegativeAttributionId(input: Omit<NegativeAttributionEvent, 'attributionId'>) {
  const stableFingerprint = createHash('sha256')
    .update([
      normalizeString(input.outcomeId) ?? 'missing-outcome',
      normalizeString(input.signalId) ?? 'missing-signal',
      normalizeString(input.opportunityId) ?? 'missing-opportunity',
      normalizeString(input.proposalId) ?? 'missing-proposal',
      normalizeString(input.executionId) ?? 'missing-execution',
      normalizeString(input.entityId) ?? 'missing-entity',
      normalizeString(input.outcomeType) ?? 'missing-outcome-type',
      normalizeString(input.category) ?? 'missing-category',
      normalizeString(input.keyword) ?? 'missing-keyword',
      normalizeString(input.occurredAt) ?? 'missing-occurred-at',
      normalizeString(input.detectedAt) ?? 'missing-detected-at',
    ].join(':'))
    .digest('hex')

  return [
    'negative-attribution',
    normalizeIdPart(input.outcomeType).slice(0, 24),
    stableFingerprint.slice(0, 24),
  ].join(':').slice(0, 128)
}
