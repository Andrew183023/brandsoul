import { rm } from 'node:fs/promises'
import path from 'node:path'

import { createHermeticTestDb } from './createHermeticTestDb.js'
import { installTestNetworkGuard } from './testNetworkGuard.js'

const globalState = globalThis as typeof globalThis & {
  __brandsoulHermeticBootstrap?: {
    workspaceDir: string
    cleaned: boolean
  }
}

if (!globalState.__brandsoulHermeticBootstrap) {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test'
  process.env.FLOWMIND_TEST_ENV_ISOLATION = 'true'
  process.env.FLOWMIND_SKIP_DOTENV = 'true'
  process.env.FLOWMIND_DISABLE_EXTERNAL_PROVIDERS = process.env.FLOWMIND_DISABLE_EXTERNAL_PROVIDERS || 'true'
  process.env.TEST_RUNTIME_MODE = process.env.TEST_RUNTIME_MODE || 'isolated'
  process.env.RENDER_DEPLOY_MODE = process.env.RENDER_DEPLOY_MODE || 'ci-test'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'brandsoul-hermetic-test-secret'
  process.env.AUTH_STORE_MODE = process.env.AUTH_STORE_MODE || 'native_only'
  process.env.AUTH_STORE_NATIVE_ONLY_CONFIRMED = process.env.AUTH_STORE_NATIVE_ONLY_CONFIRMED || 'true'

  const suiteHint = process.env.HERMETIC_TEST_SUITE || process.env.npm_lifecycle_event || 'node-test'
  const dbHandle = await createHermeticTestDb({ suiteName: suiteHint })

  process.env.SQLITE_FILE = process.env.SQLITE_FILE || dbHandle.sqliteFile
  process.env.BRANDSOUL_DB_PATH = process.env.BRANDSOUL_DB_PATH || dbHandle.legacyAuthDbFile
  process.env.ASSET_STORAGE_DIR = process.env.ASSET_STORAGE_DIR || path.join(dbHandle.workspaceDir, 'assets')

  installTestNetworkGuard()

  console.info('[hermetic-test-bootstrap] active', {
    envIsolation: process.env.FLOWMIND_TEST_ENV_ISOLATION,
    externalProvidersDisabled: process.env.FLOWMIND_DISABLE_EXTERNAL_PROVIDERS,
    runtimeMode: process.env.TEST_RUNTIME_MODE,
    renderDeployMode: process.env.RENDER_DEPLOY_MODE,
    sqliteFile: process.env.SQLITE_FILE,
  })

  const cleanup = async () => {
    if (globalState.__brandsoulHermeticBootstrap?.cleaned) {
      return
    }

    globalState.__brandsoulHermeticBootstrap = {
      workspaceDir: dbHandle.workspaceDir,
      cleaned: true,
    }
    await rm(dbHandle.workspaceDir, { recursive: true, force: true })
  }

  process.once('beforeExit', () => {
    void cleanup()
  })
  process.once('exit', () => {
    void cleanup()
  })

  globalState.__brandsoulHermeticBootstrap = {
    workspaceDir: dbHandle.workspaceDir,
    cleaned: false,
  }
}
