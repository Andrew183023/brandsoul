import { randomUUID } from 'node:crypto'

export type LawyerInboxEventsTokenRecord = {
  token: string
  userId: number
  tenantId: number
  professionalId: string
  expiresAt: string
}

const DEFAULT_TTL_MS = 2 * 60 * 1000
const tokenStore = new Map<string, LawyerInboxEventsTokenRecord>()

function purgeExpiredTokens(nowMs: number) {
  for (const [token, record] of tokenStore.entries()) {
    if (Date.parse(record.expiresAt) <= nowMs) {
      tokenStore.delete(token)
    }
  }
}

export function createLawyerInboxEventsToken(input: {
  userId: number
  tenantId: number
  professionalId: string
  ttlMs?: number
  nowMs?: number
}): LawyerInboxEventsTokenRecord {
  const nowMs = input.nowMs ?? Date.now()
  purgeExpiredTokens(nowMs)

  const ttlMs = Number.isFinite(input.ttlMs) && Number(input.ttlMs) > 0 ? Number(input.ttlMs) : DEFAULT_TTL_MS
  const record: LawyerInboxEventsTokenRecord = {
    token: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
    userId: input.userId,
    tenantId: input.tenantId,
    professionalId: input.professionalId,
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
  }

  tokenStore.set(record.token, record)
  return record
}

export function validateLawyerInboxEventsToken(token: string, nowMs = Date.now()): LawyerInboxEventsTokenRecord | null {
  purgeExpiredTokens(nowMs)

  const normalizedToken = token.trim()
  if (!normalizedToken) {
    return null
  }

  const record = tokenStore.get(normalizedToken)
  if (!record) {
    return null
  }

  if (Date.parse(record.expiresAt) <= nowMs) {
    tokenStore.delete(normalizedToken)
    return null
  }

  return record
}

export function clearLawyerInboxEventsTokensForTesting() {
  tokenStore.clear()
}