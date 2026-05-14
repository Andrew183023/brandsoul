import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDatabaseConnection, initializeDatabase } from '../../db/index.js'
import type { MutationLogRecord } from '../../sovereignty/authorityBoundary.js'
import { createAdaptiveEquilibriumEvidenceRepository } from './adaptiveEquilibriumEvidenceRepository.js'
import { createGovernanceEvidenceTimelineRepository } from './governanceEvidenceTimelineRepository.js'
import {
  appendAdaptiveEvidenceWithSovereignAuthority,
  appendGovernanceTimelineEventWithSovereignAuthority,
} from './sovereignAdaptiveAppend.js'

type LogMutationMessage = {
  tag: unknown
  record: MutationLogRecord | null
}

async function createTempDatabase() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-adaptive-sovereign-append-'))
  const sqliteFile = path.join(workspace, 'repository.sqlite')
  const db = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(db)

  return {
    db,
    async close() {
      await db.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

function buildAdaptiveEvidenceInput() {
  return {
    replayConsistencyEquilibrium: 0.91,
    reinforcementEscalationPersistence: 0.27,
    saturationEquilibrium: 0.18,
    oscillationDamping: 0.85,
    projectionStabilityConvergence: 0.84,
    rankingDiversityPreservation: 0.72,
    entropyEvolution: 0.44,
    projectionLockInPersistence: 0.11,
    lowConfidenceAmplificationPersistence: 0.08,
    replayDegradationPersistence: 0.09,
    governanceClassification: 'CAUTION' as const,
    recommendation: 'do_not_rollout' as const,
    sustainedEquilibriumEvidence: false,
    replayFingerprint: 'adaptive-equilibrium:test-fingerprint-1',
    generatedAt: '2026-05-09T20:00:00.000Z',
    heatmapSnapshot: null,
  }
}

function buildGovernanceEventInput() {
  return {
    eventType: 'classification_transition' as const,
    timestamp: '2026-05-09T20:00:00.000Z',
    classification: 'CAUTION' as const,
    recommendation: 'do_not_rollout' as const,
    severity: 'MEDIUM' as const,
    triggerFactors: ['classification_change', 'risk_upshift'],
    replayFingerprint: 'adaptive-equilibrium:test-fingerprint-1',
    longitudinalWindow: 'long' as const,
    sourceEvidenceId: 'adaptive-equilibrium-evidence:test-source',
  }
}

test('unauthorized adaptive evidence append fails', async () => {
  const harness = await createTempDatabase()

  try {
    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.db)

    await assert.rejects(
      repository.appendEvidence(buildAdaptiveEvidenceInput()),
      /FLOWMIND_AUTHORITY_BOUNDARY_VIOLATION/,
    )
  } finally {
    await harness.close()
  }
})

test('authorized append succeeds and governance recommendation remains unchanged', async () => {
  const harness = await createTempDatabase()

  try {
    const adaptiveRepository = createAdaptiveEquilibriumEvidenceRepository(harness.db)
    const governanceRepository = createGovernanceEvidenceTimelineRepository(harness.db)

    const evidenceResult = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository: adaptiveRepository,
      input: buildAdaptiveEvidenceInput(),
      authority: {
        source: 'backend/src/learning/persistence/adaptiveSovereignAppend.test.ts#authorizedAdaptive',
      },
    })

    const governanceResult = await appendGovernanceTimelineEventWithSovereignAuthority({
      repository: governanceRepository,
      input: {
        ...buildGovernanceEventInput(),
        sourceEvidenceId: evidenceResult.evidence.evidenceId,
      },
      authority: {
        source: 'backend/src/learning/persistence/adaptiveSovereignAppend.test.ts#authorizedGovernance',
      },
    })

    assert.equal(evidenceResult.inserted, true)
    assert.equal(evidenceResult.evidence.recommendation, 'do_not_rollout')
    assert.equal(governanceResult.inserted, true)
    assert.equal(governanceResult.event.recommendation, 'do_not_rollout')
  } finally {
    await harness.close()
  }
})

test('append tracing preserved for sovereign adaptive evidence writes', async () => {
  const harness = await createTempDatabase()
  const originalConsoleInfo = console.info
  const mutationLogs: LogMutationMessage[] = []

  console.info = (message?: unknown, ...optionalParams: unknown[]) => {
    mutationLogs.push({
      tag: message,
      record: (optionalParams[0] ?? null) as MutationLogRecord | null,
    })
  }

  try {
    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.db)
    const result = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input: buildAdaptiveEvidenceInput(),
      authority: {
        source: 'backend/src/learning/persistence/adaptiveSovereignAppend.test.ts#appendTracing',
      },
    })

    const appendLog = mutationLogs.find((entry) => (
      entry.tag === 'log.mutation'
      && entry.record?.source === 'backend/src/learning/persistence/adaptiveEquilibriumEvidenceRepository.ts#appendEvidence'
      && entry.record?.targetId === result.evidence.evidenceId
    ))

    assert(appendLog?.record)
    assert.equal(appendLog.record.viaExecutor, true)
    assert.equal(appendLog.record.type, 'portfolio')

    const persisted = await repository.getEvidenceById(result.evidence.evidenceId)
    assert(persisted)
    assert.equal(
      persisted.evidenceGenerationMetadata.sovereignAppendAudit?.authoritySource,
      'backend/src/learning/persistence/adaptiveSovereignAppend.test.ts#appendTracing',
    )
    assert.equal(persisted.evidenceGenerationMetadata.sovereignAppendAudit?.viaExecutor, true)
    assert.equal(persisted.evidenceGenerationMetadata.sovereignAppendAudit?.traceEnforced, true)
  } finally {
    console.info = originalConsoleInfo
    await harness.close()
  }
})

test('replay persistence unchanged under sovereign append enforcement', async () => {
  const harness = await createTempDatabase()

  try {
    const repository = createAdaptiveEquilibriumEvidenceRepository(harness.db)
    const input = buildAdaptiveEvidenceInput()

    const first = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input,
      authority: {
        source: 'backend/src/learning/persistence/adaptiveSovereignAppend.test.ts#replayFirst',
      },
    })
    const second = await appendAdaptiveEvidenceWithSovereignAuthority({
      repository,
      input,
      authority: {
        source: 'backend/src/learning/persistence/adaptiveSovereignAppend.test.ts#replaySecond',
      },
    })

    assert.equal(first.evidence.evidenceId, second.evidence.evidenceId)
    assert.equal(first.evidence.replayFingerprint, second.evidence.replayFingerprint)
    assert.equal(second.inserted, false)

    const total = await repository.countEvidence()
    assert.equal(total, 1)
  } finally {
    await harness.close()
  }
})
