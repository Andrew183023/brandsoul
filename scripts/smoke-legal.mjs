import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const rootDir = process.cwd()
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function fail(message) {
  throw new Error(message)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function assertFile(path) {
  if (!existsSync(path)) {
    fail(`Missing contract file: ${path}`)
  }
}

function assertScript(pkgPath, scriptName) {
  const pkg = readJson(pkgPath)
  if (!pkg.scripts || typeof pkg.scripts[scriptName] !== 'string' || pkg.scripts[scriptName].trim().length === 0) {
    fail(`Missing script "${scriptName}" in ${pkgPath}`)
  }
}

function runCommand(cwd, args) {
  const result = spawnSync(npmBin, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    fail(`Command failed in ${cwd}: ${npmBin} ${args.join(' ')}`)
  }
}

function parseEnvKeys(path) {
  const raw = readFileSync(path, 'utf-8')
  const keys = new Set()
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    keys.add(trimmed.slice(0, eq).trim())
  }
  return keys
}

function assertEnvContract(path) {
  const keys = parseEnvKeys(path)
  const required = [
    'NODE_ENV',
    'PORT',
    'AUTH_ISSUER',
    'AUTH_AUDIENCE',
    'AUTH_ACTIVE_KID',
    'CORS_ORIGIN',
    'VITE_API_URL',
    'VITE_AUTH_API_URL',
  ]

  for (const key of required) {
    if (!keys.has(key)) {
      fail(`Missing env key in ${path}: ${key}`)
    }
  }

  if (!keys.has('DATABASE_URL') && !keys.has('SQLITE_FILE')) {
    fail(`Missing DATABASE_URL or SQLITE_FILE in ${path}`)
  }
}

function assertReadmeContract(path) {
  const raw = readFileSync(path, 'utf-8')
  const requiredSnippets = [
    'Root directory: `backend`',
    'Root directory: `brandsoul-frontend`',
    'Health check: `GET /health`',
    '## 7. Smoke Test Manual',
    'cases publicados = `entity.ts`',
    '`caseRoutes.ts` = legacy/internal',
    '`npm run smoke:legal`',
  ]

  for (const snippet of requiredSnippets) {
    if (!raw.includes(snippet)) {
      fail(`README contract missing snippet: ${snippet}`)
    }
  }
}

function main() {
  const backendDir = resolve(rootDir, 'backend')
  const frontendDir = resolve(rootDir, 'brandsoul-frontend')

  const contractFiles = [
    '.env.legal.example',
    'Dockerfile.legal',
    'docker-compose.legal.yml',
    'README_DEPLOY_LEGAL.md',
    'render.legal.yaml',
  ]

  for (const file of contractFiles) {
    assertFile(resolve(rootDir, file))
  }

  assertScript(resolve(backendDir, 'package.json'), 'build:legal')
  assertScript(resolve(backendDir, 'package.json'), 'start:legal')
  assertScript(resolve(frontendDir, 'package.json'), 'build:legal')
  assertScript(resolve(frontendDir, 'package.json'), 'preview:legal')

  assertEnvContract(resolve(rootDir, '.env.legal.example'))
  assertReadmeContract(resolve(rootDir, 'README_DEPLOY_LEGAL.md'))

  runCommand(backendDir, ['run', 'build:legal'])
  runCommand(frontendDir, ['run', 'build:legal'])

  assertFile(resolve(backendDir, 'dist', 'server.legal-beta.js'))
  assertFile(resolve(frontendDir, 'dist-legal', 'index.legal.html'))

  console.log('BrandSoul Legal smoke checks passed.')
}

main()
