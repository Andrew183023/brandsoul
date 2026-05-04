import assert from 'node:assert/strict'
import test from 'node:test'

import { clearLawyerInboxEventsTokensForTesting, createLawyerInboxEventsToken, validateLawyerInboxEventsToken } from './lawyerInboxEventTokens.js'
import { getLawyerInboxChannel, publish, subscribe, unsubscribe, type LawyerInboxEvent } from './lawyerInboxEvents.js'

test('publish assignment.created notifies subscribed lawyer inbox listener', () => {
  const channel = getLawyerInboxChannel(1, 'prof-1')
  const received: LawyerInboxEvent[] = []
  const listener = (event: LawyerInboxEvent) => {
    received.push(event)
  }

  subscribe(channel, listener)

  try {
    publish(channel, {
      type: 'assignment.created',
      caseId: 'case-1',
      assignmentId: 'assignment-1',
      occurredAt: '2026-05-02T10:00:00.000Z',
    })
  } finally {
    unsubscribe(channel, listener)
  }

  assert.equal(received.length, 1)
  assert.equal(received[0]?.type, 'assignment.created')
  assert.equal(received[0]?.assignmentId, 'assignment-1')
})

test('lawyer inbox events token validation rejects expired tokens', () => {
  clearLawyerInboxEventsTokensForTesting()

  const created = createLawyerInboxEventsToken({
    userId: 10,
    tenantId: 20,
    professionalId: 'prof-20',
    ttlMs: 1_000,
    nowMs: 1_000,
  })

  const validRecord = validateLawyerInboxEventsToken(created.token, 1_500)
  assert.ok(validRecord)
  assert.equal(validRecord?.professionalId, 'prof-20')

  const expiredRecord = validateLawyerInboxEventsToken(created.token, 2_001)
  assert.equal(expiredRecord, null)
})