import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

type HermeticTestDbOptions = {
  suiteName?: string
  inMemory?: boolean
}

export type HermeticTestDbHandle = {
  workspaceDir: string
  sqliteFile: string
  legacyAuthDbFile: string
  assetStorageDir: string
  cleanup: () => Promise<void>
}

function normalizeSuiteName(input?: string) {
  const name = (input ?? 'suite').trim().toLowerCase()
  return name.replace(/[^a-z0-9-_]+/g, '-').replace(/-+/g, '-').slice(0, 48) || 'suite'
}

export async function createHermeticTestDb(options: HermeticTestDbOptions = {}): Promise<HermeticTestDbHandle> {
  const suiteName = normalizeSuiteName(options.suiteName)
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), `brandsoul-hermetic-${suiteName}-`))
  const assetStorageDir = path.join(workspaceDir, 'assets')
  await mkdir(assetStorageDir, { recursive: true })

  const sqliteFile = options.inMemory ? ':memory:' : path.join(workspaceDir, 'backend.sqlite')
  const legacyAuthDbFile = options.inMemory ? ':memory:' : path.join(workspaceDir, 'legacy-auth.sqlite')

  return {
    workspaceDir,
    sqliteFile,
    legacyAuthDbFile,
    assetStorageDir,
    cleanup: async () => {
      await rm(workspaceDir, { recursive: true, force: true })
    },
  }
}
