import { createHash } from 'node:crypto'

export type LearningOutcomeType =
  | 'revenue_positive'
  | 'revenue_negative'
  | 'conversion_positive'
  | 'conversion_negative'

export type LearningLedgerEvent = {
  learningEventId: string
  attributionId: string
  marketSignalId: string
  opportunityId: string
  proposalId: string
  executionId: string
  entityId: string
  category: string
  signalKeyword: string
  outcomeType: LearningOutcomeType
  attributedRevenue: number
  conversionSuccess: boolean
  observedAt: string
}

export type AppendLearningLedgerEventInput = Omit<LearningLedgerEvent, 'learningEventId'> & {
  learningEventId?: string
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
    throw new Error(`Learning ledger requires ${label}.`)
  }

  return normalized
}

export function buildLearningLedgerEventId(input: Omit<LearningLedgerEvent, 'learningEventId'>) {
  const fingerprint = createHash('sha256')
    .update([
      normalizeRequired(input.attributionId, 'attributionId'),
      normalizeRequired(input.marketSignalId, 'marketSignalId'),
      normalizeRequired(input.opportunityId, 'opportunityId'),
      normalizeRequired(input.proposalId, 'proposalId'),
      normalizeRequired(input.executionId, 'executionId'),
      normalizeRequired(input.entityId, 'entityId'),
      normalizeRequired(input.category, 'category').toLowerCase(),
      normalizeRequired(input.signalKeyword, 'signalKeyword').toLowerCase(),
      input.outcomeType,
      Number(input.attributedRevenue).toString(),
      input.conversionSuccess ? '1' : '0',
      normalizeRequired(input.observedAt, 'observedAt'),
    ].join(':'))
    .digest('hex')

  return [
    'learning-ledger',
    normalizeIdentifierPart(input.outcomeType).slice(0, 24),
    fingerprint.slice(0, 24),
  ].join(':').slice(0, 128)
}
