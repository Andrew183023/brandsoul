import { randomUUID } from 'node:crypto'

import type { BackendDatabase } from '../../db/index.js'

export type RegionalSignalRecord = {
  id: string
  tenantId: string
  entityId: string
  city: string
  specialty: string
  visits: number
  leads: number
  cases: number
  urgentLeads: number
  urgencyScore: number
  signalScore: number
  createdAt: string
  updatedAt: string
}

type RegionalSignalRow = {
  id: string
  tenant_id: string
  entity_id: string
  city: string
  specialty: string
  visits: number
  leads: number
  cases: number
  urgent_leads: number
  urgency_score: number
  signal_score: number
  created_at: string
  updated_at: string
}

type AggregateRow = {
  city: string
  specialty: string
  total: number
}

type SignalAggregate = {
  city: string
  specialty: string
  visits: number
  leads: number
  cases: number
  urgentLeads: number
}

function mapRegionalSignalRow(row: RegionalSignalRow): RegionalSignalRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    city: row.city,
    specialty: row.specialty,
    visits: Number(row.visits ?? 0),
    leads: Number(row.leads ?? 0),
    cases: Number(row.cases ?? 0),
    urgentLeads: Number(row.urgent_leads ?? 0),
    urgencyScore: Number(row.urgency_score ?? 0),
    signalScore: Number(row.signal_score ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildAggregateKey(city: string, specialty: string) {
  return `${city.trim().toLowerCase()}::${specialty.trim().toLowerCase()}`
}

function computeSignalScore(aggregate: SignalAggregate) {
  return (aggregate.visits * 1)
    + (aggregate.leads * 10)
    + (aggregate.cases * 50)
    + (aggregate.urgentLeads * 25)
}

function computeUrgencyScore(aggregate: SignalAggregate) {
  return aggregate.urgentLeads * 25
}

function mergeAggregates(
  target: Map<string, SignalAggregate>,
  rows: AggregateRow[],
  field: keyof Pick<SignalAggregate, 'visits' | 'leads' | 'cases' | 'urgentLeads'>,
) {
  for (const row of rows) {
    const city = row.city?.trim()
    const specialty = row.specialty?.trim()

    if (!city || !specialty) {
      continue
    }

    const key = buildAggregateKey(city, specialty)
    const current = target.get(key) ?? {
      city,
      specialty,
      visits: 0,
      leads: 0,
      cases: 0,
      urgentLeads: 0,
    }

    current[field] = Number(row.total ?? 0)
    target.set(key, current)
  }
}

export class RegionalSignalsRepository {
  constructor(private readonly db: BackendDatabase) {}

  async recalculateSignalsForEntity(tenantId: string, entityId: string) {
    const [visitRows, leadRows, caseRows, urgentLeadRows] = await Promise.all([
      this.db.all<AggregateRow[]>(
        `
          SELECT pages.city AS city, pages.specialty AS specialty, COUNT(attribution.id) AS total
          FROM seo_landing_pages pages
          INNER JOIN regional_lead_attribution attribution
            ON attribution.landing_page_id = pages.id
          WHERE pages.tenant_id = ?
            AND pages.entity_id = ?
          GROUP BY pages.city, pages.specialty
        `,
        tenantId,
        entityId,
      ),
      this.db.all<AggregateRow[]>(
        `
          SELECT city, specialty, COUNT(id) AS total
          FROM regional_leads
          WHERE tenant_id = ?
            AND entity_id = ?
          GROUP BY city, specialty
        `,
        tenantId,
        entityId,
      ),
      this.db.all<AggregateRow[]>(
        `
          SELECT city, specialty, COUNT(id) AS total
          FROM regional_leads
          WHERE tenant_id = ?
            AND entity_id = ?
            AND converted_case_id IS NOT NULL
          GROUP BY city, specialty
        `,
        tenantId,
        entityId,
      ),
      this.db.all<AggregateRow[]>(
        `
          SELECT city, specialty, COUNT(id) AS total
          FROM regional_leads
          WHERE tenant_id = ?
            AND entity_id = ?
            AND urgency IN ('high', 'critical')
          GROUP BY city, specialty
        `,
        tenantId,
        entityId,
      ),
    ])

    const aggregates = new Map<string, SignalAggregate>()
    mergeAggregates(aggregates, visitRows, 'visits')
    mergeAggregates(aggregates, leadRows, 'leads')
    mergeAggregates(aggregates, caseRows, 'cases')
    mergeAggregates(aggregates, urgentLeadRows, 'urgentLeads')

    await this.db.transaction(async (tx) => {
      const keys = Array.from(aggregates.values())
      if (keys.length === 0) {
        await tx.run(
          `
            DELETE FROM regional_signals
            WHERE tenant_id = ?
              AND entity_id = ?
          `,
          tenantId,
          entityId,
        )
        return
      }

      const staleConditions = keys.map(() => '(city = ? AND specialty = ?)').join(' OR ')
      const staleParams = keys.flatMap((entry) => [entry.city, entry.specialty])

      await tx.run(
        `
          DELETE FROM regional_signals
          WHERE tenant_id = ?
            AND entity_id = ?
            AND NOT (${staleConditions})
        `,
        tenantId,
        entityId,
        ...staleParams,
      )

      for (const aggregate of keys) {
        const now = new Date().toISOString()
        const signalScore = computeSignalScore(aggregate)
        const urgencyScore = computeUrgencyScore(aggregate)
        const existing = await tx.get<{ id: string; created_at: string }>(
          `
            SELECT id, created_at
            FROM regional_signals
            WHERE tenant_id = ?
              AND entity_id = ?
              AND city = ?
              AND specialty = ?
          `,
          tenantId,
          entityId,
          aggregate.city,
          aggregate.specialty,
        )

        const signalId = existing?.id ?? randomUUID()
        const createdAt = existing?.created_at ?? now

        await tx.run(
          `
            INSERT INTO regional_signals (
              id,
              tenant_id,
              entity_id,
              region,
              city,
              state,
              specialty,
              visits,
              leads,
              cases,
              urgent_leads,
              urgency_score,
              signal_score,
              demand_score,
              competition_score,
              opportunity_score,
              trend,
              source,
              payload_json,
              last_updated,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'stable', 'internal', '{}', ?, ?, ?)
            ON CONFLICT (tenant_id, entity_id, city, specialty) DO UPDATE SET
              visits = excluded.visits,
              leads = excluded.leads,
              cases = excluded.cases,
              urgent_leads = excluded.urgent_leads,
              urgency_score = excluded.urgency_score,
              signal_score = excluded.signal_score,
              opportunity_score = excluded.opportunity_score,
              last_updated = excluded.last_updated,
              updated_at = excluded.updated_at
          `,
          signalId,
          tenantId,
          entityId,
          aggregate.city,
          aggregate.city,
          aggregate.specialty,
          aggregate.visits,
          aggregate.leads,
          aggregate.cases,
          aggregate.urgentLeads,
          urgencyScore,
          signalScore,
          signalScore,
          now,
          createdAt,
          now,
        )
      }
    })

    return this.listSignalsByEntity(tenantId, entityId)
  }

  async listSignalsByEntity(tenantId: string, entityId: string) {
    const rows = await this.db.all<RegionalSignalRow[]>(
      `
        SELECT
          id,
          tenant_id,
          entity_id,
          city,
          specialty,
          visits,
          leads,
          cases,
          urgent_leads,
          urgency_score,
          signal_score,
          created_at,
          updated_at
        FROM regional_signals
        WHERE tenant_id = ?
          AND entity_id = ?
        ORDER BY signal_score DESC, updated_at DESC
      `,
      tenantId,
      entityId,
    )

    return rows.map(mapRegionalSignalRow)
  }

  async getTopSignalsByEntity(tenantId: string, entityId: string, limit = 10) {
    const rows = await this.db.all<RegionalSignalRow[]>(
      `
        SELECT
          id,
          tenant_id,
          entity_id,
          city,
          specialty,
          visits,
          leads,
          cases,
          urgent_leads,
          urgency_score,
          signal_score,
          created_at,
          updated_at
        FROM regional_signals
        WHERE tenant_id = ?
          AND entity_id = ?
        ORDER BY signal_score DESC, updated_at DESC
        LIMIT ?
      `,
      tenantId,
      entityId,
      limit,
    )

    return rows.map(mapRegionalSignalRow)
  }
}

export function createRegionalSignalsRepository(db: BackendDatabase) {
  return new RegionalSignalsRepository(db)
}
