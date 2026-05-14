import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNegativeEconomicOutcomeId } from './NegativeEconomicOutcome.js'

function buildFixture(overrides: Partial<Parameters<typeof buildNegativeEconomicOutcomeId>[0]> = {}) {
  return {
    outcomeType: 'proposal_rejected' as const,
    entityId: 'entity-1',
    marketSignalId: 'signal-1',
    opportunityId: 'opportunity-1',
    proposalId: 'proposal-1',
    executionId: 'none',
    category: 'legal',
    signalKeyword: 'labor lawyer',
    detectedAt: '2026-05-08T10:00:00.000Z',
    reason: 'Governance rejected outbound action.',
    metadata: {
      confidence: 0.84,
      source: 'proposal',
    },
    ...overrides,
  }
}

test('negative economic outcome identity ignores detector reason and metadata wording changes', () => {
  const baseline = buildNegativeEconomicOutcomeId(buildFixture())
  const changedReason = buildNegativeEconomicOutcomeId(buildFixture({
    reason: 'Governance declined this proposal after review.',
  }))
  const changedMetadata = buildNegativeEconomicOutcomeId(buildFixture({
    metadata: {
      confidence: 0.84,
      source: 'proposal',
      note: 'wording changed only',
    },
  }))

  assert.equal(changedReason, baseline)
  assert.equal(changedMetadata, baseline)
})

test('negative economic outcome identity changes when semantic failure type changes', () => {
  const rejected = buildNegativeEconomicOutcomeId(buildFixture({
    outcomeType: 'proposal_rejected',
  }))
  const timeout = buildNegativeEconomicOutcomeId(buildFixture({
    outcomeType: 'no_response_timeout',
  }))

  assert.notEqual(timeout, rejected)
})

test('negative economic outcome identity remains stable when proposal or execution lineage is missing', () => {
  const first = buildNegativeEconomicOutcomeId(buildFixture({
    proposalId: 'none',
    executionId: 'none',
    opportunityId: 'opportunity-unknown',
    marketSignalId: 'signal-unknown',
    entityId: 'unassigned',
    outcomeType: 'opportunity_expired',
  }))
  const second = buildNegativeEconomicOutcomeId(buildFixture({
    proposalId: 'none',
    executionId: 'none',
    opportunityId: 'opportunity-unknown',
    marketSignalId: 'signal-unknown',
    entityId: 'unassigned',
    outcomeType: 'opportunity_expired',
    reason: 'Opportunity aging description changed.',
  }))

  assert.equal(second, first)
})
