import { createHash } from 'node:crypto'

import type { CanonicalContactIdentity } from './legalCanonicalTypes.js'
import {
  buildCanonicalContactIdentity,
  normalizeCanonicalCity,
} from './legalContactNormalization.js'

const INVISIBLE_CHARACTERS_PATTERN = /[\u200B-\u200D\uFEFF]/g

export const PUBLIC_TRIAGE_FINGERPRINT_VERSION = 'v1' as const
export const PUBLIC_TRIAGE_FINGERPRINT_SOURCE = 'public_triage' as const
export const DEFAULT_PUBLIC_TRIAGE_FINGERPRINT_WINDOW_MS = 30 * 60 * 1000

export type LegalIntakeFingerprintInput = {
  tenantId: number
  entityId: string
  practiceArea?: string
  objective?: string
  city?: string
  occurredAt?: string | Date
  nowMs?: number
  windowMs?: number
  contactIdentity?: CanonicalContactIdentity
  contactPreference?: string
  contactValue?: string
}

export type LegalIntakeFingerprint = {
  fingerprint: string
  fingerprintVersion: typeof PUBLIC_TRIAGE_FINGERPRINT_VERSION
  source: typeof PUBLIC_TRIAGE_FINGERPRINT_SOURCE
  components: {
    tenantId: number
    entityId: string
    canonicalContact: string
    practiceArea: string
    objectiveKey: string
    cityKey: string
    timeBucket: string
  }
}

function sanitizeFingerprintText(value: string) {
  return value
    .normalize('NFKC')
    .replace(INVISIBLE_CHARACTERS_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeKey(value: string | undefined) {
  if (typeof value !== 'string') {
    return ''
  }

  const sanitized = sanitizeFingerprintText(value)
  return sanitized.length > 0 ? sanitized.toLocaleLowerCase('pt-BR') : ''
}

function resolveCanonicalContact(input: LegalIntakeFingerprintInput) {
  const contactIdentity = input.contactIdentity ?? buildCanonicalContactIdentity({
    phone: ['telefone', 'phone'].includes(input.contactPreference?.trim().toLowerCase() ?? '')
      ? input.contactValue
      : undefined,
    whatsapp: input.contactPreference?.trim().toLowerCase() === 'whatsapp'
      ? input.contactValue
      : undefined,
    email: input.contactPreference?.trim().toLowerCase() === 'email'
      ? input.contactValue
      : undefined,
    city: input.city,
  })

  return contactIdentity?.canonicalWhatsapp
    ?? contactIdentity?.canonicalPhone
    ?? contactIdentity?.canonicalEmail
    ?? ''
}

function resolveTimeBucket(args: {
  occurredAt?: string | Date
  nowMs?: number
  windowMs?: number
}) {
  const windowMs = Number.isFinite(args.windowMs) && Number(args.windowMs) > 0
    ? Number(args.windowMs)
    : DEFAULT_PUBLIC_TRIAGE_FINGERPRINT_WINDOW_MS

  const timestampMs = typeof args.nowMs === 'number'
    ? args.nowMs
    : args.occurredAt instanceof Date
      ? args.occurredAt.getTime()
      : typeof args.occurredAt === 'string'
        ? Date.parse(args.occurredAt)
        : Date.now()

  const normalizedTimestampMs = Number.isFinite(timestampMs) ? timestampMs : Date.now()
  const bucketStartMs = Math.floor(normalizedTimestampMs / windowMs) * windowMs
  return new Date(bucketStartMs).toISOString()
}

export function buildPublicTriageIntakeFingerprint(input: LegalIntakeFingerprintInput): LegalIntakeFingerprint {
  const canonicalContact = resolveCanonicalContact(input)
  const practiceArea = normalizeKey(input.practiceArea)
  const objectiveKey = normalizeKey(input.objective)
  const cityKey = normalizeKey(normalizeCanonicalCity(input.city))
  const timeBucket = resolveTimeBucket({
    occurredAt: input.occurredAt,
    nowMs: input.nowMs,
    windowMs: input.windowMs,
  })

  const components = {
    tenantId: input.tenantId,
    entityId: sanitizeFingerprintText(input.entityId),
    canonicalContact,
    practiceArea,
    objectiveKey,
    cityKey,
    timeBucket,
  }

  const fingerprintPayload = JSON.stringify({
    fingerprintVersion: PUBLIC_TRIAGE_FINGERPRINT_VERSION,
    source: PUBLIC_TRIAGE_FINGERPRINT_SOURCE,
    components,
  })

  return {
    fingerprint: createHash('sha256').update(fingerprintPayload, 'utf-8').digest('hex'),
    fingerprintVersion: PUBLIC_TRIAGE_FINGERPRINT_VERSION,
    source: PUBLIC_TRIAGE_FINGERPRINT_SOURCE,
    components,
  }
}
