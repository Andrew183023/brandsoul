import { createHash } from 'node:crypto'

import type { NegativeEconomicOutcomeType } from './negativeOutcomeTypes.js'

export type NegativeEconomicOutcomeMetadata = Record<string, unknown>

export type NegativeEconomicOutcome = {
  outcomeId: string
  outcomeType: NegativeEconomicOutcomeType
  entityId: string
  marketSignalId: string
  opportunityId: string
  proposalId: string
  executionId: string
  category: string
  signalKeyword: string
  detectedAt: string
  reason: string
  metadata?: NegativeEconomicOutcomeMetadata
}

export type AppendNegativeEconomicOutcomeInput = Omit<NegativeEconomicOutcome, 'outcomeId'> & {
  outcomeId?: string
}

function normalizeIdentifierPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeRequired(value: string, label: string) {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new Error(`Negative economic outcome requires ${label}.`)
  }

  return normalized
}

export function buildNegativeEconomicOutcomeId(input: Omit<NegativeEconomicOutcome, 'outcomeId'>) {
  const fingerprint = createHash('sha256')
    .update([
      input.outcomeType,
      normalizeRequired(input.entityId, 'entityId'),
      normalizeRequired(input.marketSignalId, 'marketSignalId'),
      normalizeRequired(input.opportunityId, 'opportunityId'),
      normalizeRequired(input.proposalId, 'proposalId'),
      normalizeRequired(input.executionId, 'executionId'),
      normalizeRequired(input.category, 'category').toLowerCase(),
      normalizeRequired(input.signalKeyword, 'signalKeyword').toLowerCase(),
      normalizeRequired(input.detectedAt, 'detectedAt'),
    ].join(':'))
    .digest('hex')

  return [
    'negative-outcome',
    normalizeIdentifierPart(input.outcomeType).slice(0, 24),
    fingerprint.slice(0, 24),
  ].join(':').slice(0, 128)
}
