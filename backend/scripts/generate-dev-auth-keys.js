import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(scriptDir, '..')
const outputDir = path.join(backendRoot, 'tmp', 'auth-dev-keys')
const privateKeyPath = path.join(outputDir, 'brandsoul-auth-dev-private.pem')
const publicKeyPath = path.join(outputDir, 'brandsoul-auth-dev-public.pem')

mkdirSync(outputDir, { recursive: true })

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
})

writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600 })
writeFileSync(publicKeyPath, publicKey, { encoding: 'utf8', mode: 0o644 })

console.log(`Generated:\n- ${privateKeyPath}\n- ${publicKeyPath}`)
