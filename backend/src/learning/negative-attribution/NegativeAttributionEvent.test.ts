import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNegativeAttributionId, type NegativeAttributionEvent } from './NegativeAttributionEvent.js'

function buildFixture(overrides: Partial<Omit<NegativeAttributionEvent, 'attributionId'>> = {}) {
  return {
    outcomeId: 'negative-outcome:proposal-rejected:abc123',
    signalId: 'signal-1',
    opportunityId: 'opportunity-1',
    proposalId: 'proposal-1',
    executionId: null,
    entityId: 'entity-1',
    category: 'legal',
    keyword: 'labor lawyer',
    outcomeType: 'proposal_rejected' as const,
    severity: 'medium' as const,
    reason: 'Governance rejected the proposal before execution.',
    attributedAt: '2026-05-08T10:00:00.000Z',
    occurredAt: '2026-05-08T10:00:00.000Z',
    detectedAt: '2026-05-08T10:00:00.000Z',
    sourceRuntime: 'terminal-failure-detection-runtime',
    detectorVersion: 'v1',
    lineageQuality: 'complete' as const,
    metadata: { confidence: 0.84 },
    createdAt: '2026-05-08T10:00:00.000Z',
    ...overrides,
  }
}

test('negative attribution identity ignores detector reason wording and version metadata', () => {
  const baseline = buildNegativeAttributionId(buildFixture())
  const changedReason = buildNegativeAttributionId(buildFixture({
    reason: 'Governance declined the proposal after review.',
  }))
  const changedDetectorVersion = buildNegativeAttributionId(buildFixture({
    detectorVersion: 'v2',
    sourceRuntime: 'terminal-failure-detection-runtime',
  }))

  assert.equal(changedReason, baseline)
  assert.equal(changedDetectorVersion, baseline)
})

test('negative attribution identity is stable for partial lineage events', () => {
  const first = buildNegativeAttributionId(buildFixture({
    outcomeId: 'negative-outcome:opportunity-expired:def456',
    signalId: null,
    opportunityId: 'opportunity-unknown',
    proposalId: null,
    executionId: null,
    entityId: null,
    category: 'general',
    keyword: 'generic trend',
    outcomeType: 'opportunity_expired',
    severity: 'medium',
    lineageQuality: 'missing',
    detectedAt: '2026-05-08T10:01:00.000Z',
    occurredAt: '2026-05-08T10:01:00.000Z',
    attributedAt: '2026-05-08T10:01:00.000Z',
  }))
  const second = buildNegativeAttributionId(buildFixture({
    outcomeId: 'negative-outcome:opportunity-expired:def456',
    signalId: null,
    opportunityId: 'opportunity-unknown',
    proposalId: null,
    executionId: null,
    entityId: null,
    category: 'general',
    keyword: 'generic trend',
    outcomeType: 'opportunity_expired',
    severity: 'medium',
    reason: 'Changed detector wording only.',
    lineageQuality: 'missing',
    detectedAt: '2026-05-08T10:01:00.000Z',
    occurredAt: '2026-05-08T10:01:00.000Z',
    attributedAt: '2026-05-08T10:01:00.000Z',
  }))

  assert.equal(second, first)
})
