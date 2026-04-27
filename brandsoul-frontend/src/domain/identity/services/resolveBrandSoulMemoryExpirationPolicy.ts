import type { BrandSoulMemory } from '../contracts/BrandSoulMemory'

export type BrandSoulMemoryRetentionKind = 'permanent' | 'expiring' | 'context-dependent'

export type BrandSoulMemoryExpirationPolicy = {
  retentionKind: BrandSoulMemoryRetentionKind
  expiresAt?: string
  reason: string
}

function addHours(isoDate: string, hours: number) {
  const date = new Date(isoDate)
  date.setHours(date.getHours() + hours)
  return date.toISOString()
}

function addDays(isoDate: string, days: number) {
  const date = new Date(isoDate)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

export function resolveBrandSoulMemoryExpirationPolicy(memory: Pick<BrandSoulMemory, 'type' | 'source' | 'createdAt' | 'content'>) {
  if (memory.type === 'identity') {
    if (memory.source === 'inference') {
      return {
        retentionKind: 'expiring',
        expiresAt: addDays(memory.createdAt, 30),
        reason: 'identity memories inferred by the system stay provisional until reinforced',
      } satisfies BrandSoulMemoryExpirationPolicy
    }

    return {
      retentionKind: 'permanent',
      reason: 'identity memories are sovereign and should persist unless explicitly revised',
    } satisfies BrandSoulMemoryExpirationPolicy
  }

  if (memory.type === 'operational') {
    return {
      retentionKind: 'expiring',
      expiresAt: addDays(memory.createdAt, 14),
      reason: 'operational memories age quickly because they reflect campaigns, offers, and temporary business conditions',
    } satisfies BrandSoulMemoryExpirationPolicy
  }

  if (memory.type === 'contextual') {
    return {
      retentionKind: 'context-dependent',
      expiresAt: addHours(memory.createdAt, 6),
      reason: 'contextual memories exist only while the current conversation, session, or campaign context remains active',
    } satisfies BrandSoulMemoryExpirationPolicy
  }

  if (memory.content.contextKey) {
    return {
      retentionKind: 'context-dependent',
      expiresAt: addDays(memory.createdAt, 30),
      reason: 'relational memories tied to a specific context should fade when that context stops being relevant',
    } satisfies BrandSoulMemoryExpirationPolicy
  }

  return {
    retentionKind: 'expiring',
    expiresAt: addDays(memory.createdAt, 30),
    reason: 'relational memories remain useful for a while but should decay if not reinforced',
  } satisfies BrandSoulMemoryExpirationPolicy
}