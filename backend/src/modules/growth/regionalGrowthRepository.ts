import { randomUUID } from 'node:crypto'

import type { BackendDatabase } from '../../db/index.js'

export type RegionalCampaignStatus = 'draft' | 'active' | 'paused' | 'archived'
export type RegionalCampaignObjective = 'visibility' | 'lead_capture' | 'emergency_24h' | 'institutional'

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
