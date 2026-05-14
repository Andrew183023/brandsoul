import { spawnSync } from 'node:child_process'

const DEFAULT_SUITES = [
  'distributedSovereignty',
  'sovereignPersistenceCoordination',
  'semanticReplayHydration',
  'orchestratorAdminRoutes',
  'runtimeGovernance',
  'institutionalSovereignMutationGate',
  'institutionalRecoveryGovernance',
  'replayIntegrity',
  'semanticMutation',
]

function parseSuites(argv) {
  const suites = argv
    .filter((arg) => arg !== '--')
    .map((arg) => arg.trim())
    .filter(Boolean)

  if (suites.length > 0) {
    return suites
  }

  return DEFAULT_SUITES
}

const suites = parseSuites(process.argv.slice(2))

for (const suite of suites) {
  console.info(`[hermetic-tests] running suite=${suite}`)
  const result = spawnSync('npm', ['run', 'test', '--', suite], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      FLOWMIND_TEST_ENV_ISOLATION: process.env.FLOWMIND_TEST_ENV_ISOLATION ?? 'true',
      FLOWMIND_SKIP_DOTENV: process.env.FLOWMIND_SKIP_DOTENV ?? 'true',
      FLOWMIND_DISABLE_EXTERNAL_PROVIDERS: process.env.FLOWMIND_DISABLE_EXTERNAL_PROVIDERS ?? 'true',
      TEST_RUNTIME_MODE: process.env.TEST_RUNTIME_MODE ?? 'isolated',
      RENDER_DEPLOY_MODE: process.env.RENDER_DEPLOY_MODE ?? 'ci-test',
      NODE_ENV: process.env.NODE_ENV ?? 'test',
    },
    timeout: 8 * 60 * 1000,
  })

  if (result.error) {
    console.error(`[hermetic-tests] suite failed to execute: ${suite}`)
    console.error(result.error)
    process.exit(1)
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    console.error(`[hermetic-tests] suite failed: ${suite}`)
    process.exit(result.status)
  }
}

console.info(`[hermetic-tests] all suites passed (${suites.length})`)
