import { runWithMutationAuthority } from './authorityBoundary.js'
import { getInstitutionalSovereignMutationGate } from './institutionalSovereignMutationGate.js'

const DEFAULT_TEST_MUTATION_SOURCE =
  'backend/src/sovereignty/sovereignTestMutationHarness.ts#runTestMutation'
const DEFAULT_SEED_MUTATION_SOURCE =
  'backend/src/sovereignty/sovereignTestMutationHarness.ts#runSeedMutation'
const DEFAULT_TEST_MEMORY_MUTATION_SOURCE =
  'backend/src/sovereignty/sovereignTestMutationHarness.ts#runTestMemoryMutation'

async function runScopedTestMutation<T>(work: () => Promise<T>, source: string): Promise<T> {
  try {
    return await getInstitutionalSovereignMutationGate().evaluateAndExecute({
      authoritySource: source,
      context: {
        mutationType: 'test.seed.mutation',
        mutationScope: 'entity',
        requestedCapability: 'orchestrator.command.execute',
        runtimeMode: 'normal',
        continuityMode: 'institutional_safe',
        replayVerificationState: 'verified',
        attestationIntegrity: 'verified',
        recoveryRequired: false,
        actor: 'admin',
        traceId: source,
      },
      work,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Institutional sovereign mutation gate is not installed.') {
      return runWithMutationAuthority(
        {
          source,
          viaExecutor: true,
        },
        work,
      )
    }

    throw error
  }

}

export async function runTestMutation<T>(
  work: () => Promise<T>,
  source = DEFAULT_TEST_MUTATION_SOURCE,
): Promise<T> {
  return runScopedTestMutation(work, source)
}

export async function runSeedMutation<T>(
  work: () => Promise<T>,
  source = DEFAULT_SEED_MUTATION_SOURCE,
): Promise<T> {
  return runScopedTestMutation(work, source)
}

export async function runTestMemoryMutation<T>(
  work: () => Promise<T>,
  source = DEFAULT_TEST_MEMORY_MUTATION_SOURCE,
): Promise<T> {
  return runScopedTestMutation(work, source)
}
