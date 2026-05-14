import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createDatabaseConnection, initializeDatabase } from '../db/index.js'
import { createInstitutionalSovereignMutationGate, installInstitutionalSovereignMutationGate } from '../sovereignty/institutionalSovereignMutationGate.js'
import { createSemanticMutationExecutor, installSemanticMutationExecutor } from '../sovereignty/semanticMutationExecutor.js'
import { createInstitutionalContinuityGovernanceService } from './institutionalContinuityGovernanceService.js'
import { createInstitutionalRecoveryGovernanceService, installInstitutionalRecoveryGovernanceService } from './institutionalRecoveryGovernanceService.js'
import { createObservabilityService } from './observabilityService.js'
import { createRuntimeContinuityAttestationService } from './runtimeContinuityAttestationService.js'
import { createRuntimeGovernanceService } from './runtimeGovernanceService.js'

export async function createInstitutionalRecoveryHarness() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'institutional-recovery-'))
  const sqliteFile = path.join(workspace, 'backend.sqlite')
  const connection = await createDatabaseConnection({
    provider: 'sqlite',
    sqliteFile,
  })
  await initializeDatabase(connection)

  const observability = createObservabilityService()
  const runtimeGovernance = createRuntimeGovernanceService({ observability })
  const continuityGovernance = createInstitutionalContinuityGovernanceService({
    db: connection,
    observability,
  })
  await continuityGovernance.initialize()
  const runtimeContinuityAttestationService = createRuntimeContinuityAttestationService({
    db: connection,
    observability,
    now: () => '2026-05-13T00:00:00.000Z',
  })
  const recoveryGovernance = createInstitutionalRecoveryGovernanceService({
    db: connection,
    observability,
    continuityGovernance,
    runtimeContinuityAttestationService,
    now: () => '2026-05-13T00:00:00.000Z',
  })
  installInstitutionalRecoveryGovernanceService(recoveryGovernance)

  const gate = createInstitutionalSovereignMutationGate({
    db: connection,
    observability,
    runtimeGovernance,
    continuityGovernance,
    runtimeContinuityAttestationService,
    recoveryGovernance,
  })
  installInstitutionalSovereignMutationGate(gate)
  installSemanticMutationExecutor(createSemanticMutationExecutor({
    db: connection,
    observability,
  }))

  return {
    workspace,
    connection,
    observability,
    runtimeGovernance,
    continuityGovernance,
    runtimeContinuityAttestationService,
    recoveryGovernance,
    gate,
    async close() {
      await connection.close()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}
