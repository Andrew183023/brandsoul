import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import { createObservabilityService } from '../../services/observabilityService.js'

import { createCaseRepository } from './caseRepository.js'
import { LegalMetricsRecorder } from './legalMetricsRecorder.js'
import { createLegalCanonicalTimelineWriteService } from './legalCanonicalTimelineWriteService.js'

async function createTempSqliteDb(prefix: string) {
  const workspace = await mkdtemp(path.join(tmpdir(), prefix))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })

  return {
    db,
    async cleanup() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

test('canonical timeline writer records created and message_added with standardized payloads', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-timeline-write-')

  try {
    await initializeDatabase(harness.db)
    const repository = createCaseRepository(harness.db)
    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const createdCase = await repository.createCase({
      tenantId: 7,
      entityId: 'office-timeline-1',
      requestId: 'timeline-request-1',
      title: 'Caso operacional',
      status: 'open',
      priority: 'high',
      metadata: {},
      openedAt: '2026-06-29T11:00:00.000Z',
    })

    const writer = createLegalCanonicalTimelineWriteService(harness.db, recorder)
    await writer.recordCaseCreated({
      tenantId: 7,
      caseId: createdCase.id,
      actorProfessionalId: 'prof-1',
      actorUserId: 13,
      entityId: 'office-timeline-1',
      status: 'open',
      priority: 'high',
      source: 'public-triage',
      requestId: 'timeline-request-1',
      leadId: 'lead-1',
      intakeId: 'intake-1',
      occurredAt: '2026-06-29T11:00:01.000Z',
    })

    await writer.recordMessageAdded({
      tenantId: 7,
      caseId: createdCase.id,
      actorProfessionalId: 'prof-1',
      actorUserId: 13,
      messageId: 'message-1',
      sequenceNo: 1,
      messageType: 'note',
      direction: 'outbound',
      source: 'public_triage',
      requestId: 'timeline-request-1',
      leadId: 'lead-1',
      intakeId: 'intake-1',
      occurredAt: '2026-06-29T11:00:02.000Z',
    })

    const timeline = await repository.listTimelineEvents(7, createdCase.id)
    const metrics = observability.getMetricsSnapshot()
    assert.equal(timeline.length, 2)
    assert.equal(timeline[0]?.eventType, 'created')
    assert.equal(timeline[0]?.actorUserId, 13)
    assert.deepEqual(timeline[0]?.payload, {
      entityId: 'office-timeline-1',
      status: 'open',
      priority: 'high',
      source: 'public-triage',
      requestId: 'timeline-request-1',
      leadId: 'lead-1',
      intakeId: 'intake-1',
    })
    assert.equal(timeline[1]?.eventType, 'message_added')
    assert.equal(timeline[1]?.actorUserId, 13)
    assert.deepEqual(timeline[1]?.payload, {
      messageId: 'message-1',
      sequenceNo: 1,
      messageType: 'note',
      direction: 'outbound',
      source: 'public_triage',
      requestId: 'timeline-request-1',
      leadId: 'lead-1',
      intakeId: 'intake-1',
    })
    assert.equal(metrics.customCounters.legal_timeline_events_total, 2)
    assert.equal(
      metrics.customCounterSeries['legal_timeline_events_total{entity_id=office-timeline-1,event=created,result=success,tenant_id=7}'],
      1,
    )
    assert.equal(
      metrics.customCounterSeries['legal_timeline_events_total{entity_id=office-timeline-1,event=message_added,result=success,tenant_id=7}'],
      1,
    )
  } finally {
    await harness.cleanup()
  }
})

test('canonical timeline writer respects transaction rollback', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-timeline-rollback-')

  try {
    await initializeDatabase(harness.db)
    const repository = createCaseRepository(harness.db)
    const createdCase = await repository.createCase({
      tenantId: 8,
      entityId: 'office-timeline-2',
      requestId: 'timeline-request-2',
      title: 'Caso rollback',
      status: 'open',
      priority: 'normal',
      metadata: {},
      openedAt: '2026-06-29T12:00:00.000Z',
    })

    await assert.rejects(async () => {
      await harness.db.transaction(async (tx) => {
        const writer = createLegalCanonicalTimelineWriteService(tx)
        await writer.recordCaseCreated({
          tenantId: 8,
          caseId: createdCase.id,
          actorProfessionalId: 'prof-2',
          entityId: 'office-timeline-2',
          status: 'open',
          priority: 'normal',
        })
        throw new Error('force rollback')
      })
    })

    const timeline = await repository.listTimelineEvents(8, createdCase.id)
    assert.equal(timeline.length, 0)
  } finally {
    await harness.cleanup()
  }
})

test('canonical timeline writer records status, assignment, acceptance and close payloads with actorUserId', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-timeline-operational-')

  try {
    await initializeDatabase(harness.db)
    const repository = createCaseRepository(harness.db)
    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const createdCase = await repository.createCase({
      tenantId: 9,
      entityId: 'office-timeline-3',
      requestId: 'timeline-request-3',
      title: 'Caso operacional 2',
      status: 'open',
      priority: 'normal',
      metadata: {},
      openedAt: '2026-06-29T13:00:00.000Z',
    })

    const writer = createLegalCanonicalTimelineWriteService(harness.db, recorder)
    await writer.recordStatusChanged({
      tenantId: 9,
      caseId: createdCase.id,
      actorProfessionalId: 'prof-3',
      actorUserId: 42,
      from: 'open',
      to: 'dispatched',
      reason: 'manual_assign',
      occurredAt: '2026-06-29T13:00:01.000Z',
    })
    await writer.recordAssignmentChanged({
      tenantId: 9,
      caseId: createdCase.id,
      type: 'assigned',
      actorProfessionalId: 'prof-3',
      actorUserId: 42,
      professionalId: 'prof-3',
      assignedByProfessionalId: 'prof-3',
      assignmentId: 'assign-1',
      dispatchId: 'dispatch-1',
      role: 'lead',
      status: 'active',
      expiresAt: '2026-06-29T14:00:00.000Z',
      occurredAt: '2026-06-29T13:00:02.000Z',
    })
    await writer.recordAssignmentChanged({
      tenantId: 9,
      caseId: createdCase.id,
      type: 'reassigned',
      actorProfessionalId: 'prof-4',
      actorUserId: 43,
      oldProfessionalId: 'prof-3',
      newProfessionalId: 'prof-4',
      assignedByProfessionalId: 'prof-4',
      assignmentId: 'assign-2',
      status: 'active',
      occurredAt: '2026-06-29T13:00:03.000Z',
    })
    await writer.recordAssignmentDecision({
      tenantId: 9,
      caseId: createdCase.id,
      type: 'accepted',
      actorProfessionalId: 'prof-4',
      actorUserId: 43,
      assignmentId: 'assign-2',
      dispatchId: 'dispatch-2',
      professionalId: 'prof-4',
      status: 'accepted',
      source: 'case.accepted',
      occurredAt: '2026-06-29T13:00:04.000Z',
    })
    await writer.recordClosed({
      tenantId: 9,
      caseId: createdCase.id,
      actorProfessionalId: 'prof-4',
      actorUserId: 43,
      closedBy: 'operator',
      rating: 5,
      responsibleProfessionalId: 'prof-4',
      resolutionReason: 'done',
      status: 'closed',
      occurredAt: '2026-06-29T13:00:05.000Z',
    })

    const timeline = await repository.listTimelineEvents(9, createdCase.id)
    const metrics = observability.getMetricsSnapshot()
    assert.deepEqual(
      timeline.map((entry) => entry.eventType),
      ['status_changed', 'assigned', 'reassigned', 'accepted', 'closed'],
    )
    assert.equal(timeline[0]?.actorUserId, 42)
    assert.deepEqual(timeline[0]?.payload, {
      from: 'open',
      to: 'dispatched',
      fromStatus: 'open',
      toStatus: 'dispatched',
      reason: 'manual_assign',
    })
    assert.equal(timeline[1]?.actorUserId, 42)
    assert.deepEqual(timeline[1]?.payload, {
      professionalId: 'prof-3',
      oldProfessionalId: undefined,
      newProfessionalId: undefined,
      assignedByProfessionalId: 'prof-3',
      assignmentId: 'assign-1',
      dispatchId: 'dispatch-1',
      role: 'lead',
      status: 'active',
      expiresAt: '2026-06-29T14:00:00.000Z',
    })
    assert.equal(timeline[2]?.actorUserId, 43)
    assert.deepEqual(timeline[2]?.payload, {
      professionalId: undefined,
      oldProfessionalId: 'prof-3',
      newProfessionalId: 'prof-4',
      assignedByProfessionalId: 'prof-4',
      assignmentId: 'assign-2',
      dispatchId: undefined,
      role: undefined,
      status: 'active',
      expiresAt: undefined,
    })
    assert.equal(timeline[3]?.actorUserId, 43)
    assert.deepEqual(timeline[3]?.payload, {
      assignmentId: 'assign-2',
      dispatchId: 'dispatch-2',
      professionalId: 'prof-4',
      status: 'accepted',
      source: 'case.accepted',
    })
    assert.equal(timeline[4]?.actorUserId, 43)
    assert.deepEqual(timeline[4]?.payload, {
      closedBy: 'operator',
      rating: 5,
      responsibleProfessionalId: 'prof-4',
      resolutionReason: 'done',
      status: 'closed',
    })
    assert.equal(metrics.customCounters.legal_timeline_events_total, 5)
    assert.equal(
      metrics.customCounterSeries['legal_timeline_events_total{entity_id=office-timeline-3,event=status_changed,result=success,tenant_id=9}'],
      1,
    )
    assert.equal(
      metrics.customCounterSeries['legal_timeline_events_total{entity_id=office-timeline-3,event=portal_access_created,result=success,tenant_id=9}'] ?? 0,
      0,
    )
  } finally {
    await harness.cleanup()
  }
})

test('canonical timeline writer records portal access events without raw token payloads', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-timeline-portal-')

  try {
    await initializeDatabase(harness.db)
    const repository = createCaseRepository(harness.db)
    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const createdCase = await repository.createCase({
      tenantId: 10,
      entityId: 'office-timeline-4',
      requestId: 'timeline-request-4',
      title: 'Caso portal',
      status: 'open',
      priority: 'normal',
      metadata: {},
      openedAt: '2026-06-30T10:00:00.000Z',
    })

    const writer = createLegalCanonicalTimelineWriteService(harness.db, recorder)
    await writer.recordPortalAccessCreated({
      tenantId: 10,
      caseId: createdCase.id,
      tokenId: 'token-1',
      expiresAt: '2026-07-30T10:00:00.000Z',
      source: 'public_triage_case_created',
      requestId: 'timeline-request-4',
      occurredAt: '2026-06-30T10:00:01.000Z',
    })
    await writer.recordPortalAccessUsed({
      tenantId: 10,
      caseId: createdCase.id,
      tokenId: 'token-1',
      usedAt: '2026-06-30T10:00:02.000Z',
      source: 'legal_beta_client_portal',
      occurredAt: '2026-06-30T10:00:02.000Z',
    })

    const timeline = await repository.listTimelineEvents(10, createdCase.id)
    const metrics = observability.getMetricsSnapshot()
    assert.deepEqual(
      timeline.map((entry) => entry.eventType),
      ['portal_access_created', 'portal_access_used'],
    )
    assert.deepEqual(timeline[0]?.payload, {
      tokenId: 'token-1',
      expiresAt: '2026-07-30T10:00:00.000Z',
      source: 'public_triage_case_created',
      requestId: 'timeline-request-4',
    })
    assert.deepEqual(timeline[1]?.payload, {
      tokenId: 'token-1',
      usedAt: '2026-06-30T10:00:02.000Z',
      source: 'legal_beta_client_portal',
    })
    assert.equal('rawToken' in (timeline[0]?.payload ?? {}), false)
    assert.equal('rawToken' in (timeline[1]?.payload ?? {}), false)
    assert.equal(metrics.customCounters.legal_timeline_events_total, 2)
    assert.equal(
      metrics.customCounterSeries['legal_timeline_events_total{entity_id=office-timeline-4,event=portal_access_created,result=success,tenant_id=10}'],
      1,
    )
    assert.equal(
      metrics.customCounterSeries['legal_timeline_events_total{entity_id=office-timeline-4,event=portal_access_used,result=success,tenant_id=10}'],
      1,
    )
    const serializedSeries = JSON.stringify(metrics.customCounterSeries)
    assert.equal(serializedSeries.includes(createdCase.id), false)
    assert.equal(serializedSeries.includes('token-1'), false)
    assert.equal(serializedSeries.includes('prof-4'), false)
    assert.equal(serializedSeries.includes('message-1'), false)
  } finally {
    await harness.cleanup()
  }
})

test('canonical timeline writer records failures without exposing sensitive labels', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-timeline-failure-')

  try {
    await initializeDatabase(harness.db)
    const observability = createObservabilityService()
    const recorder = new LegalMetricsRecorder(observability)
    const writer = createLegalCanonicalTimelineWriteService(harness.db, recorder)

    await assert.rejects(
      () => writer.recordStatusChanged({
        tenantId: 12,
        caseId: 'missing-case',
        entityId: 'office-timeline-5',
        actorProfessionalId: 'prof-x',
        actorUserId: 99,
        from: 'open',
        to: 'dispatched',
        reason: 'manual_assign',
      }),
    )

    const metrics = observability.getMetricsSnapshot()
    assert.equal(metrics.customCounters.legal_timeline_write_failures_total, 1)
    assert.equal(
      metrics.customCounterSeries['legal_timeline_write_failures_total{entity_id=office-timeline-5,event=status_changed,reason=write_failed,result=failed,tenant_id=12}'],
      1,
    )
    const serializedSeries = JSON.stringify(metrics.customCounterSeries)
    assert.equal(serializedSeries.includes('missing-case'), false)
    assert.equal(serializedSeries.includes('prof-x'), false)
    assert.equal(serializedSeries.includes('manual_assign'), false)
  } finally {
    await harness.cleanup()
  }
})

test('canonical timeline writer keeps compatibility when created without recorder', async () => {
  const harness = await createTempSqliteDb('brandsoul-legal-canonical-timeline-no-recorder-')

  try {
    await initializeDatabase(harness.db)
    const repository = createCaseRepository(harness.db)
    const createdCase = await repository.createCase({
      tenantId: 13,
      entityId: 'office-timeline-6',
      requestId: 'timeline-request-6',
      title: 'Caso sem recorder',
      status: 'open',
      priority: 'normal',
      metadata: {},
      openedAt: '2026-07-01T12:00:00.000Z',
    })

    const writer = createLegalCanonicalTimelineWriteService(harness.db)
    await writer.recordCaseCreated({
      tenantId: 13,
      caseId: createdCase.id,
      entityId: 'office-timeline-6',
      status: 'open',
      priority: 'normal',
    })

    const timeline = await repository.listTimelineEvents(13, createdCase.id)
    assert.equal(timeline.length, 1)
    assert.equal(timeline[0]?.eventType, 'created')
  } finally {
    await harness.cleanup()
  }
})
