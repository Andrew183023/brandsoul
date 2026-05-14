import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const sourceRoot = path.join(workspaceRoot, 'src')
const hermeticBootstrap = pathToFileURL(path.join(workspaceRoot, 'test', 'testEnvBootstrap.ts')).href

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const collected = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      collected.push(...await collectTestFiles(entryPath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      collected.push(entryPath)
    }
  }

  return collected
}

function normalizeFilterTerms(argv) {
  return argv
    .filter((arg) => arg !== '--')
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0)
}

function toRelativePath(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join('/')
}

function filterTestFiles(files, terms) {
  if (terms.length === 0) {
    return files
  }

  const loweredTerms = terms.map((term) => term.toLowerCase())

  return files.filter((filePath) => {
    const relative = toRelativePath(filePath).toLowerCase()
    const base = path.basename(filePath).toLowerCase()
    return loweredTerms.some((term) => relative.includes(term) || base.includes(term))
  })
}

const files = (await collectTestFiles(sourceRoot)).sort()
const filterTerms = normalizeFilterTerms(process.argv.slice(2))
const selectedFiles = filterTestFiles(files, filterTerms)

if (files.length === 0) {
  console.error('No source test files found under src/.')
  process.exit(1)
}

if (filterTerms.length > 0) {
  console.info(`[tests] filter: ${filterTerms.join(', ')}`)
  console.info(`[tests] selected files (${selectedFiles.length}):`)
  for (const filePath of selectedFiles) {
    console.info(` - ${toRelativePath(filePath)}`)
  }

  if (selectedFiles.length === 0) {
    console.error('[tests] no test files matched the provided filter.')
    process.exit(1)
  }
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', hermeticBootstrap, '--test', ...selectedFiles], {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

if (typeof result.status === 'number') {
  process.exit(result.status)
}

process.exit(1)