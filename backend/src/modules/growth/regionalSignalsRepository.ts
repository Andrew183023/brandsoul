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
  bestChannel?: string
  bestAudienceName?: string
  bestIntentStage?: string
  bestSearchIntent?: string
  bestCampaignTargetId?: string
  bestRecommendedRadiusKm?: number
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
  best_channel: string | null
  best_audience_name: string | null
  best_intent_stage: string | null
  best_search_intent: string | null
  best_campaign_target_id: string | null
  best_recommended_radius_km: number | null
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

type BestTargetEvidenceRow = {
  city: string
  specialty: string
  campaign_target_id: string
  channel: string
  audience_name: string
  intent_stage: string
  search_intent: string | null
  recommended_radius_km: number
  converted_count: number
  urgent_count: number
  lead_count: number
}

type BestTargetEvidence = {
  campaignTargetId: string
  channel: string
  audienceName: string
  intentStage: string
  searchIntent?: string
  recommendedRadiusKm: number
}

type BootstrapTargetRow = {
  cities_json: string
  specialties_json: string
  campaign_target_id: string
  channel: string
  audience_name: string
  intent_stage: string
  search_intent: string | null
  recommended_radius_km: number
}

type BootstrapOpportunity = {
  city: string
  specialty: string
  bestTarget: BestTargetEvidence
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
    bestChannel: row.best_channel ?? undefined,
    bestAudienceName: row.best_audience_name ?? undefined,
    bestIntentStage: row.best_intent_stage ?? undefined,
    bestSearchIntent: row.best_search_intent ?? undefined,
    bestCampaignTargetId: row.best_campaign_target_id ?? undefined,
    bestRecommendedRadiusKm: row.best_recommended_radius_km ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildAggregateKey(city: string, specialty: string) {
  return `${city.trim().toLowerCase()}::${specialty.trim().toLowerCase()}`
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
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

function mapBestTargetEvidence(rows: BestTargetEvidenceRow[]) {
  const bestTargetByKey = new Map<string, BestTargetEvidence>()

  for (const row of rows) {
    const city = row.city?.trim()
    const specialty = row.specialty?.trim()

    if (!city || !specialty) {
      continue
    }

    const key = buildAggregateKey(city, specialty)
    if (bestTargetByKey.has(key)) {
      continue
    }

    bestTargetByKey.set(key, {
      campaignTargetId: row.campaign_target_id,
      channel: row.channel,
      audienceName: row.audience_name,
      intentStage: row.intent_stage,
      searchIntent: row.search_intent ?? undefined,
      recommendedRadiusKm: Number(row.recommended_radius_km ?? 0),
    })
  }

  return bestTargetByKey
}

function mapBootstrapTargetEvidence(rows: BootstrapTargetRow[]) {
  const bestTargetByKey = new Map<string, BootstrapOpportunity>()

  for (const row of rows) {
    const cities = parseStringArray(row.cities_json).map((city) => city.trim()).filter(Boolean)
    const specialties = parseStringArray(row.specialties_json).map((specialty) => specialty.trim()).filter(Boolean)

    for (const city of cities) {
      for (const specialty of specialties) {
        const key = buildAggregateKey(city, specialty)
        if (bestTargetByKey.has(key)) {
          continue
        }

        bestTargetByKey.set(key, {
          city,
          specialty,
          bestTarget: {
            campaignTargetId: row.campaign_target_id,
            channel: row.channel,
            audienceName: row.audience_name,
            intentStage: row.intent_stage,
            searchIntent: row.search_intent ?? undefined,
            recommendedRadiusKm: Number(row.recommended_radius_km ?? 0),
          },
        })
      }
    }
  }

  return bestTargetByKey
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
    const [visitRows, leadRows, caseRows, urgentLeadRows, bestTargetRows, bootstrapTargetRows] = await Promise.all([
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
      this.db.all<BestTargetEvidenceRow[]>(
        `
          SELECT
            leads.city AS city,
            leads.specialty AS specialty,
            leads.campaign_target_id AS campaign_target_id,
            targets.channel AS channel,
            targets.audience_name AS audience_name,
            targets.intent_stage AS intent_stage,
            targets.search_intent AS search_intent,
            targets.recommended_radius_km AS recommended_radius_km,
            SUM(CASE WHEN leads.converted_case_id IS NOT NULL THEN 1 ELSE 0 END) AS converted_count,
            SUM(CASE WHEN leads.urgency IN ('high', 'critical') THEN 1 ELSE 0 END) AS urgent_count,
            COUNT(leads.id) AS lead_count
          FROM regional_leads leads
          INNER JOIN regional_campaign_targets targets
            ON targets.id = leads.campaign_target_id
          WHERE leads.tenant_id = ?
            AND leads.entity_id = ?
            AND leads.campaign_target_id IS NOT NULL
          GROUP BY
            leads.city,
            leads.specialty,
            leads.campaign_target_id,
            targets.channel,
            targets.audience_name,
            targets.intent_stage,
            targets.search_intent,
            targets.recommended_radius_km
          ORDER BY
            converted_count DESC,
            urgent_count DESC,
            lead_count DESC,
            leads.city ASC,
            leads.specialty ASC
        `,
        tenantId,
        entityId,
      ),
      this.db.all<BootstrapTargetRow[]>(
        `
          SELECT
            campaigns.cities_json AS cities_json,
            campaigns.specialties_json AS specialties_json,
            targets.id AS campaign_target_id,
            targets.channel AS channel,
            targets.audience_name AS audience_name,
            targets.intent_stage AS intent_stage,
            targets.search_intent AS search_intent,
            targets.recommended_radius_km AS recommended_radius_km
          FROM regional_campaign_targets targets
          INNER JOIN regional_campaigns campaigns
            ON campaigns.id = targets.campaign_id
          WHERE campaigns.tenant_id = ?
            AND campaigns.entity_id = ?
          ORDER BY targets.updated_at DESC, targets.created_at DESC
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
    const bestTargetByKey = mapBestTargetEvidence(bestTargetRows)
    const bootstrapTargetByKey = mapBootstrapTargetEvidence(bootstrapTargetRows)

    for (const [key, opportunity] of bootstrapTargetByKey.entries()) {
      if (aggregates.has(key)) {
        continue
      }

      aggregates.set(key, {
        city: opportunity.city,
        specialty: opportunity.specialty,
        visits: 0,
        leads: 0,
        cases: 0,
        urgentLeads: 0,
      })
      if (!bestTargetByKey.has(key)) {
        bestTargetByKey.set(key, opportunity.bestTarget)
      }
    }

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
        const hasRealEvidence = aggregate.visits > 0
          || aggregate.leads > 0
          || aggregate.cases > 0
          || aggregate.urgentLeads > 0
        const signalScore = hasRealEvidence ? computeSignalScore(aggregate) : 1
        const urgencyScore = computeUrgencyScore(aggregate)
        const bestTarget = bestTargetByKey.get(buildAggregateKey(aggregate.city, aggregate.specialty))
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
              best_channel,
              best_audience_name,
              best_intent_stage,
              best_search_intent,
              best_campaign_target_id,
              best_recommended_radius_km,
              demand_score,
              competition_score,
              opportunity_score,
              trend,
              source,
              payload_json,
              last_updated,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'stable', 'internal', '{}', ?, ?, ?)
            ON CONFLICT (tenant_id, entity_id, city, specialty) DO UPDATE SET
              visits = excluded.visits,
              leads = excluded.leads,
              cases = excluded.cases,
              urgent_leads = excluded.urgent_leads,
              urgency_score = excluded.urgency_score,
              signal_score = excluded.signal_score,
              best_channel = excluded.best_channel,
              best_audience_name = excluded.best_audience_name,
              best_intent_stage = excluded.best_intent_stage,
              best_search_intent = excluded.best_search_intent,
              best_campaign_target_id = excluded.best_campaign_target_id,
              best_recommended_radius_km = excluded.best_recommended_radius_km,
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
          bestTarget?.channel ?? null,
          bestTarget?.audienceName ?? null,
          bestTarget?.intentStage ?? null,
          bestTarget?.searchIntent ?? null,
          bestTarget?.campaignTargetId ?? null,
          bestTarget?.recommendedRadiusKm ?? null,
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
          best_channel,
          best_audience_name,
          best_intent_stage,
          best_search_intent,
          best_campaign_target_id,
          best_recommended_radius_km,
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
          best_channel,
          best_audience_name,
          best_intent_stage,
          best_search_intent,
          best_campaign_target_id,
          best_recommended_radius_km,
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
