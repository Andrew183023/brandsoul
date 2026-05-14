import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { buildServer } from '../server.js'
import { validateRuntimeConfig } from '../config/env.js'

test('hermetic bootstrap sets deterministic defaults', () => {
  assert.equal(process.env.FLOWMIND_TEST_ENV_ISOLATION, 'true')
  assert.equal(process.env.FLOWMIND_DISABLE_EXTERNAL_PROVIDERS, 'true')
  assert.equal(process.env.TEST_RUNTIME_MODE, 'isolated')
  assert.equal(process.env.RENDER_DEPLOY_MODE, 'ci-test')
  assert.ok(process.env.SQLITE_FILE)
  assert.ok(process.env.BRANDSOUL_DB_PATH)
})

test('network guard blocks outbound HTTP', async () => {
  await assert.rejects(
    () => fetch('https://example.com/hermetic-network-violation-check'),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal((error as Error & { code?: string }).code, 'HERMETIC_NETWORK_VIOLATION')
      return true
    },
  )
})

test('isolated runtime mode does not auto-start autonomous runtime loops', async () => {
  const app = await buildServer() as typeof buildServer extends (...args: never[]) => Promise<infer T> ? T & { backendContext: { runtimeGovernance: { getStatus: () => { subsystemMatrix: Array<{ subsystem: string, started: boolean }> } } } } : never

  try {
    const subsystemMatrix = app.backendContext.runtimeGovernance.getStatus().subsystemMatrix
    const marketSignalRuntime = subsystemMatrix.find((entry: { subsystem: string; started: boolean }) => entry.subsystem === 'market-signal-runtime')
    const economicFeedbackRuntime = subsystemMatrix.find((entry: { subsystem: string; started: boolean }) => entry.subsystem === 'economic-feedback-runtime')

    assert.equal(marketSignalRuntime?.started, false)
    assert.equal(economicFeedbackRuntime?.started, false)
  } finally {
    await app.close()
  }
})

test('render deploy production mode is forbidden in test runtime', () => {
  const previousRenderDeployMode = process.env.RENDER_DEPLOY_MODE
  const previousNodeEnv = process.env.NODE_ENV

  try {
    process.env.NODE_ENV = 'test'
    process.env.RENDER_DEPLOY_MODE = 'production'
    assert.throws(() => validateRuntimeConfig(), /RENDER_DEPLOY_MODE=production is forbidden when NODE_ENV=test/)
  } finally {
    if (typeof previousRenderDeployMode === 'undefined') {
      delete process.env.RENDER_DEPLOY_MODE
    } else {
      process.env.RENDER_DEPLOY_MODE = previousRenderDeployMode
    }

    if (typeof previousNodeEnv === 'undefined') {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }
})

test('backend runtime workflow exists and pins Node 20', async () => {
  const workflowPath = path.resolve(process.cwd(), '..', '.github', 'workflows', 'backend-runtime.yml')
  const workflow = await readFile(workflowPath, 'utf8')
  assert.match(workflow, /node-version:\s*['"]20['"]/)
  assert.match(workflow, /distributedSovereignty/)
  assert.match(workflow, /semanticMutation/)
})

test('artifact hygiene rules ignore sqlite and tap outputs', async () => {
  const gitignorePath = path.resolve(process.cwd(), '..', '.gitignore')
  const gitignore = await readFile(gitignorePath, 'utf8')
  assert.match(gitignore, /backend\/\.tmp\//)
  assert.match(gitignore, /backend\/tap-output\*/)
  assert.match(gitignore, /\*\.sqlite/)
  assert.match(gitignore, /\*\.db/)
  assert.match(gitignore, /runtime-artifacts\//)
})
