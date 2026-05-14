import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(backendRoot, '..')

const checks = []

function addCheck(name, passed, detail) {
  checks.push({ name, passed, detail })
  const marker = passed ? 'PASS' : 'FAIL'
  console.info(`[ci-readiness] ${marker} ${name}${detail ? ` :: ${detail}` : ''}`)
}

function runCommand(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
}

const lockfilePath = path.join(backendRoot, 'package-lock.json')
addCheck('package-lock exists', existsSync(lockfilePath), lockfilePath)

const npmCiResult = runCommand('npm', ['ci'], backendRoot)
addCheck(
  'npm ci passes',
  npmCiResult.status === 0,
  npmCiResult.status === 0 ? 'ok' : (npmCiResult.stderr || npmCiResult.stdout || 'npm ci failed').slice(0, 300),
)

const runTestsScript = readFileSync(path.join(backendRoot, 'scripts', 'run-tests.mjs'), 'utf8')
addCheck(
  'test bootstrap is wired',
  runTestsScript.includes('testEnvBootstrap.ts'),
  'scripts/run-tests.mjs imports hermetic bootstrap',
)

const bootstrapSource = readFileSync(path.join(backendRoot, 'test', 'testEnvBootstrap.ts'), 'utf8')
addCheck(
  'external providers disabled in tests',
  bootstrapSource.includes('FLOWMIND_DISABLE_EXTERNAL_PROVIDERS'),
  'bootstrap sets FLOWMIND_DISABLE_EXTERNAL_PROVIDERS',
)

const networkGuardSource = readFileSync(path.join(backendRoot, 'test', 'testNetworkGuard.ts'), 'utf8')
addCheck(
  'network guard present',
  networkGuardSource.includes('HERMETIC_NETWORK_VIOLATION') && networkGuardSource.includes('blocked_network_attempt_total'),
  'testNetworkGuard blocks outbound HTTP and records metric',
)

const envSource = readFileSync(path.join(backendRoot, 'src', 'config', 'env.ts'), 'utf8')
addCheck(
  'local env dependency disabled for tests',
  envSource.includes('FLOWMIND_TEST_ENV_ISOLATION') && envSource.includes('FLOWMIND_SKIP_DOTENV'),
  'env loader skips .env under hermetic isolation',
)

const workflowPath = path.join(repoRoot, '.github', 'workflows', 'backend-runtime.yml')
const workflowExists = existsSync(workflowPath)
addCheck('backend hermetic workflow exists', workflowExists, workflowPath)

if (workflowExists) {
  const workflow = readFileSync(workflowPath, 'utf8')
  addCheck('workflow pins Node 20', workflow.includes("node-version: '20'") || workflow.includes('node-version: "20"'), 'workflow setup-node uses v20')
  addCheck('workflow defines matrix suites', workflow.includes('distributedSovereignty') && workflow.includes('semanticMutation'), 'matrix suite names present')
}

const gitStatus = runCommand('git', ['status', '--porcelain'], repoRoot)
const statusOutput = gitStatus.stdout || ''
const sqliteTracked = statusOutput
  .split(/\r?\n/)
  .filter((line) => /\.sqlite|\.db/.test(line))
  .filter(Boolean)
addCheck('no tracked sqlite dependency drift', sqliteTracked.length === 0, sqliteTracked.length === 0 ? 'ok' : sqliteTracked.join('; '))

const artifactLeaks = statusOutput
  .split(/\r?\n/)
  .filter((line) => /tap-output|coverage|test-output|runtime-artifacts|backend\/\.tmp|backend\\\.tmp/.test(line))
  .filter(Boolean)
addCheck('no runtime artifact leakage tracked', artifactLeaks.length === 0, artifactLeaks.length === 0 ? 'ok' : artifactLeaks.join('; '))

const passCount = checks.filter((check) => check.passed).length
const failCount = checks.length - passCount
console.info(`[ci-readiness] summary pass=${passCount} fail=${failCount}`)

if (failCount > 0) {
  process.exit(1)
}
