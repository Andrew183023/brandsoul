import { randomUUID } from 'node:crypto'

import type { BackendDatabase } from '../../db/index.js'

export type RegionalCampaignStatus = 'draft' | 'active' | 'paused' | 'archived'
export type RegionalCampaignObjective = 'visibility' | 'lead_capture' | 'emergency_24h' | 'institutional'
export type RegionalCampaignTargetChannel = 'google_search' | 'google_local' | 'facebook' | 'instagram'
export type RegionalCampaignTargetIntentStage = 'awareness' | 'consideration' | 'decision'
export type RegionalCampaignTargetSearchIntent = 'problem_aware' | 'solution_aware' | 'provider_aware' | 'ready_to_hire'
export type PopulationDensity = 'small' | 'medium' | 'large'

export type RegionalCampaignRecord = {
  id: string
  tenantId: string
  entityId: string
  campaignName: string
  states: string[]
  cities: string[]
  radiusKm: number
  specialties: string[]
  objective: RegionalCampaignObjective
  budgetDaily?: number
  budgetMonthly?: number
  status: RegionalCampaignStatus
  clicks: number
  impressions: number
  leadsReceived: number
  avgCpc?: number
  conversions: number
  seoPagesGenerated: boolean
  createdAt: string
  updatedAt: string
}

export type CreateRegionalCampaignInput = {
  tenantId: string
  entityId: string
  campaignName: string
  states?: string[]
  cities?: string[]
  radiusKm?: number
  specialties?: string[]
  objective?: RegionalCampaignObjective
  budgetDaily?: number
  budgetMonthly?: number
}

export type RegionalCampaignTargetRecord = {
  id: string
  campaignId: string
  channel: RegionalCampaignTargetChannel
  audienceName: string
  audienceDescription?: string
  intentStage: RegionalCampaignTargetIntentStage
  searchIntent?: RegionalCampaignTargetSearchIntent
  recommendedRadiusKm: number
  createdAt: string
  updatedAt: string
}

export type CreateRegionalCampaignTargetInput = {
  campaignId: string
  channel: RegionalCampaignTargetChannel
  audienceName: string
  audienceDescription?: string
  intentStage: RegionalCampaignTargetIntentStage
  searchIntent?: RegionalCampaignTargetSearchIntent
  recommendedRadiusKm: number
}

export type SpecialtyRadiusDefaultRecord = {
  id: string
  specialty: string
  populationDensity: PopulationDensity
  recommendedRadiusKm: number
  createdAt: string
  updatedAt: string
}

type RegionalCampaignRow = {
  id: string
  tenant_id: string
  entity_id: string
  campaign_name: string
  states_json: string
  cities_json: string
  radius_km: number
  specialties_json: string
  objective: RegionalCampaignObjective
  budget_daily: number | null
  budget_monthly: number | null
  status: RegionalCampaignStatus
  clicks: number
  impressions: number
  leads_received: number
  avg_cpc: number | null
  conversions: number
  seo_pages_generated: number
  created_at: string
  updated_at: string
}

type RegionalCampaignTargetRow = {
  id: string
  campaign_id: string
  channel: RegionalCampaignTargetChannel
  audience_name: string
  audience_description: string | null
  intent_stage: RegionalCampaignTargetIntentStage
  search_intent: RegionalCampaignTargetSearchIntent | null
  recommended_radius_km: number
  created_at: string
  updated_at: string
}

type SpecialtyRadiusDefaultRow = {
  id: string
  specialty: string
  population_density: PopulationDensity
  recommended_radius_km: number
  created_at: string
  updated_at: string
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function mapCampaignRow(row: RegionalCampaignRow): RegionalCampaignRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    campaignName: row.campaign_name,
    states: parseStringArray(row.states_json),
    cities: parseStringArray(row.cities_json),
    radiusKm: row.radius_km,
    specialties: parseStringArray(row.specialties_json),
    objective: row.objective,
    budgetDaily: row.budget_daily ?? undefined,
    budgetMonthly: row.budget_monthly ?? undefined,
    status: row.status,
    clicks: row.clicks,
    impressions: row.impressions,
    leadsReceived: row.leads_received,
    avgCpc: row.avg_cpc ?? undefined,
    conversions: row.conversions,
    seoPagesGenerated: row.seo_pages_generated === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCampaignTargetRow(row: RegionalCampaignTargetRow): RegionalCampaignTargetRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    channel: row.channel,
    audienceName: row.audience_name,
    audienceDescription: row.audience_description ?? undefined,
    intentStage: row.intent_stage,
    searchIntent: row.search_intent ?? undefined,
    recommendedRadiusKm: row.recommended_radius_km,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSpecialtyRadiusDefaultRow(row: SpecialtyRadiusDefaultRow): SpecialtyRadiusDefaultRecord {
  return {
    id: row.id,
    specialty: row.specialty,
    populationDensity: row.population_density,
    recommendedRadiusKm: row.recommended_radius_km,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class RegionalGrowthRepository {
  constructor(private readonly db: BackendDatabase) {}

  async createCampaign(input: CreateRegionalCampaignInput) {
    const now = new Date().toISOString()
    const id = randomUUID()

    await this.db.run(
      `
        INSERT INTO regional_campaigns (
          id,
          tenant_id,
          entity_id,
          campaign_name,
          states_json,
          cities_json,
          radius_km,
          specialties_json,
          objective,
          budget_daily,
          budget_monthly,
          status,
          clicks,
          impressions,
          leads_received,
          avg_cpc,
          conversions,
          seo_pages_generated,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 0, 0, ?, ?)
      `,
      id,
      input.tenantId,
      input.entityId,
      input.campaignName,
      JSON.stringify(input.states ?? []),
      JSON.stringify(input.cities ?? []),
      input.radiusKm ?? 30,
      JSON.stringify(input.specialties ?? []),
      input.objective ?? 'visibility',
      input.budgetDaily ?? null,
      input.budgetMonthly ?? null,
      'draft',
      now,
      now,
    )

    return this.getCampaignById(input.tenantId, id)
  }

  async listCampaignsByTenant(tenantId: string) {
    const rows = await this.db.all<RegionalCampaignRow[]>(
      `
        SELECT *
        FROM regional_campaigns
        WHERE tenant_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `,
      tenantId,
    )

    return rows.map(mapCampaignRow)
  }

  async getCampaignById(tenantId: string, campaignId: string) {
    const row = await this.db.get<RegionalCampaignRow>(
      `
        SELECT *
        FROM regional_campaigns
        WHERE tenant_id = ?
          AND id = ?
      `,
      tenantId,
      campaignId,
    )

    return row ? mapCampaignRow(row) : null
  }

  async listPublishedSeoLandingPages() {
    const rows = await this.db.all<SeoLandingPageRow[]>(
      `
        SELECT *
        FROM seo_landing_pages
        WHERE published = 1
        ORDER BY updated_at DESC, created_at DESC
      `,
    )

    return rows.map(mapSeoLandingPageRow)
  }

  async getSeoLandingPageBySlug(slug: string) {
    const normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`

    const row = await this.db.get<SeoLandingPageRow>(
      `
        SELECT *
        FROM seo_landing_pages
        WHERE slug = ?
          AND published = 1
      `,
      normalizedSlug,
    )

    return row ? mapSeoLandingPageRow(row) : null
  }

  async activateCampaign(tenantId: string, campaignId: string) {
    const now = new Date().toISOString()

    await this.db.run(
      `
        UPDATE regional_campaigns
        SET status = 'active',
            updated_at = ?
        WHERE tenant_id = ?
          AND id = ?
      `,
      now,
      tenantId,
      campaignId,
    )

    return this.getCampaignById(tenantId, campaignId)
  }

  async createCampaignTarget(tenantId: string, input: CreateRegionalCampaignTargetInput) {
    const campaign = await this.getCampaignById(tenantId, input.campaignId)
    if (!campaign) {
      return null
    }

    const now = new Date().toISOString()
    const id = randomUUID()

    await this.db.run(
      `
        INSERT INTO regional_campaign_targets (
          id,
          campaign_id,
          channel,
          audience_name,
          audience_description,
          intent_stage,
          search_intent,
          recommended_radius_km,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      id,
      input.campaignId,
      input.channel,
      input.audienceName,
      input.audienceDescription ?? null,
      input.intentStage,
      input.searchIntent ?? null,
      input.recommendedRadiusKm,
      now,
      now,
    )

    return this.getCampaignTargetById(id)
  }

  async listCampaignTargetsByCampaign(tenantId: string, campaignId: string) {
    const rows = await this.db.all<RegionalCampaignTargetRow[]>(
      `
        SELECT targets.*
        FROM regional_campaign_targets targets
        INNER JOIN regional_campaigns campaigns
          ON campaigns.id = targets.campaign_id
        WHERE campaigns.tenant_id = ?
          AND campaigns.id = ?
        ORDER BY targets.updated_at DESC, targets.created_at DESC
      `,
      tenantId,
      campaignId,
    )

    return rows.map(mapCampaignTargetRow)
  }

  async getCampaignTargetById(targetId: string) {
    const row = await this.db.get<RegionalCampaignTargetRow>(
      `
        SELECT *
        FROM regional_campaign_targets
        WHERE id = ?
      `,
      targetId,
    )

    return row ? mapCampaignTargetRow(row) : null
  }

  async deleteCampaignTarget(tenantId: string, targetId: string) {
    const target = await this.db.get<{ id: string }>(
      `
        SELECT targets.id
        FROM regional_campaign_targets targets
        INNER JOIN regional_campaigns campaigns
          ON campaigns.id = targets.campaign_id
        WHERE campaigns.tenant_id = ?
          AND targets.id = ?
      `,
      tenantId,
      targetId,
    )

    if (!target) {
      return false
    }

    await this.db.run(
      `
        DELETE FROM regional_campaign_targets
        WHERE id = ?
      `,
      targetId,
    )

    return true
  }

  async listRadiusDefaults() {
    const rows = await this.db.all<SpecialtyRadiusDefaultRow[]>(
      `
        SELECT *
        FROM specialty_radius_defaults
        ORDER BY specialty ASC, population_density ASC
      `,
    )

    return rows.map(mapSpecialtyRadiusDefaultRow)
  }

  async recommendRadius(specialty: string, populationDensity: PopulationDensity) {
    const normalizedSpecialty = specialty.trim().toLowerCase()
    const row = await this.db.get<SpecialtyRadiusDefaultRow>(
      `
        SELECT *
        FROM specialty_radius_defaults
        WHERE specialty = ?
          AND population_density = ?
      `,
      normalizedSpecialty,
      populationDensity,
    )

    return row ? mapSpecialtyRadiusDefaultRow(row) : null
  }
}

export function createRegionalGrowthRepository(db: BackendDatabase) {
  return new RegionalGrowthRepository(db)
}

export type SeoLandingPageRecord = {
  id: string
  campaignId: string
  tenantId: string
  entityId: string
  slug: string
  city: string
  specialty: string
  title: string
  metaDesc?: string
  contentHtml?: string
  published: boolean
  leadsReceived: number
  createdAt: string
  updatedAt: string
}

type SeoLandingPageRow = {
  id: string
  campaign_id: string
  tenant_id: string
  entity_id: string
  slug: string
  city: string
  specialty: string
  title: string
  meta_desc: string | null
  content_html: string | null
  published: number
  leads_received: number
  created_at: string
  updated_at: string
}

export function mapSeoLandingPageRow(row: SeoLandingPageRow): SeoLandingPageRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    slug: row.slug,
    city: row.city,
    specialty: row.specialty,
    title: row.title,
    metaDesc: row.meta_desc ?? undefined,
    contentHtml: row.content_html ?? undefined,
    published: row.published === 1,
    leadsReceived: row.leads_received,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
