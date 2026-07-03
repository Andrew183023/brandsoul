import { randomUUID } from 'node:crypto'

import type { BackendDatabase } from '../../db/index.js'
import type { PublicTriageSpamDecision } from './legalPublicTriageSpamPolicy.js'

export class LegalPublicTriageSpamRepository {
  constructor(private readonly db: BackendDatabase) {}

  async recordEvent(args: {
    tenantId?: number
    entityId: string
    ipKey?: string
    contactKey?: string
    fingerprint?: string
    requestId: string
    reason: string
    decision: PublicTriageSpamDecision
    expiresAt: string
    metadata?: Record<string, unknown>
  }) {
    const now = new Date().toISOString()
    await this.db.run(
      `
        INSERT INTO public_triage_spam_events (
          id,
          tenant_id,
          entity_id,
          ip_key,
          contact_key,
          fingerprint,
          request_id,
          reason,
          decision,
          created_at,
          expires_at,
          metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      randomUUID(),
      args.tenantId ?? null,
      args.entityId,
      args.ipKey ?? null,
      args.contactKey ?? null,
      args.fingerprint ?? null,
      args.requestId,
      args.reason,
      args.decision,
      now,
      args.expiresAt,
      JSON.stringify(args.metadata ?? {}),
    )
  }

  async countActiveEvents(args: {
    tenantId?: number
    entityId?: string
    ipKey?: string
    contactKey?: string
    reasons?: string[]
    decisions?: PublicTriageSpamDecision[]
    now?: string
  }) {
    const now = args.now ?? new Date().toISOString()
    const clauses = ['expires_at > ?']
    const params: unknown[] = [now]

    if (typeof args.tenantId === 'number') {
      clauses.push('tenant_id = ?')
      params.push(args.tenantId)
    }

    if (typeof args.entityId === 'string') {
      clauses.push('entity_id = ?')
      params.push(args.entityId)
    }

    if (typeof args.ipKey === 'string') {
      clauses.push('ip_key = ?')
      params.push(args.ipKey)
    }

    if (typeof args.contactKey === 'string') {
      clauses.push('contact_key = ?')
      params.push(args.contactKey)
    }

    if (args.reasons && args.reasons.length > 0) {
      clauses.push(`reason IN (${args.reasons.map(() => '?').join(', ')})`)
      params.push(...args.reasons)
    }

    if (args.decisions && args.decisions.length > 0) {
      clauses.push(`decision IN (${args.decisions.map(() => '?').join(', ')})`)
      params.push(...args.decisions)
    }

    const row = await this.db.get<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM public_triage_spam_events
        WHERE ${clauses.join(' AND ')}
      `,
      ...params,
    )

    return Number(row?.total ?? 0)
  }
}

export function createLegalPublicTriageSpamRepository(db: BackendDatabase) {
  return new LegalPublicTriageSpamRepository(db)
}
