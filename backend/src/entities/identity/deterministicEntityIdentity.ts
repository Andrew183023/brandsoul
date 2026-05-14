import { createHash } from 'node:crypto'

import type { CanonicalEntityType } from '../../brain/domain/entity/contracts/EntityProfile.js'

type JsonRecord = Record<string, unknown>

export type DeterministicEntityIdentityInput = {
  tenantId?: number
  canonicalName: string
  entityType: CanonicalEntityType
  createdAt: string
  stableSeedMaterial?: unknown
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  const entries = Object.entries(value as JsonRecord)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)

  return `{${entries.join(',')}}`
}

export function slugifyCanonicalName(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return normalized || 'entity'
}

export function buildDeterministicIdentitySeed(input: DeterministicEntityIdentityInput) {
  return stableStringify({
    tenantId: input.tenantId ?? null,
    canonicalName: input.canonicalName.trim(),
    entityType: input.entityType,
    createdAt: input.createdAt,
    stableSeedMaterial: input.stableSeedMaterial ?? null,
  })
}

export function buildGenesisFingerprint(input: DeterministicEntityIdentityInput) {
  return createHash('sha256')
    .update(buildDeterministicIdentitySeed(input))
    .digest('hex')
    .slice(0, 40)
}

export function buildDeterministicCanonicalSlug(input: DeterministicEntityIdentityInput) {
  const base = slugifyCanonicalName(input.canonicalName)
  const fingerprint = buildGenesisFingerprint(input)
  return `${base}-${fingerprint.slice(0, 10)}`
}

export function buildDeterministicEntityId(input: DeterministicEntityIdentityInput) {
  const slug = buildDeterministicCanonicalSlug(input)
  return `entity-${slug}`
}

