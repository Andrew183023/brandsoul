import type { BackendDatabase } from '../../db/dbClient.js'

type JsonPrimitive = string | number | boolean | null

export type LeadAttributionRecord = {
  id: string
  leadId?: string
  campaignId?: string
  landingPageId?: string
  landingSlug: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  referrer?: string
  firstTouchAt: string
  createdAt: string
  updatedAt: string
}

export type CreateLeadAttributionInput = {
  id?: string
  leadId?: string
  campaignId?: string
  landingPageId?: string
  landingSlug: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  referrer?: string
  firstTouchAt?: string
  createdAt?: string
  updatedAt?: string
}

type LeadAttributionRow = {
  id: string
  lead_id: string | null
  campaign_id: string | null
  landing_page_id: string | null
  landing_slug: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  referrer: string | null
  first_touch_at: string
  created_at: string
  updated_at: string
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function mapRowToRecord(row?: LeadAttributionRow): LeadAttributionRecord | null {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    leadId: row.lead_id ?? undefined,
    campaignId: row.campaign_id ?? undefined,
    landingPageId: row.landing_page_id ?? undefined,
    landingSlug: row.landing_slug,
    utmSource: row.utm_source ?? undefined,
    utmMedium: row.utm_medium ?? undefined,
    utmCampaign: row.utm_campaign ?? undefined,
    utmTerm: row.utm_term ?? undefined,
    referrer: row.referrer ?? undefined,
    firstTouchAt: row.first_touch_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class LeadAttributionRepository {
  constructor(private readonly db: BackendDatabase) {}

  async createAttribution(input: CreateLeadAttributionInput): Promise<LeadAttributionRecord> {
    const now = new Date().toISOString()
    const record: LeadAttributionRecord = {
      id: input.id ?? createId('attr'),
      leadId: normalizeOptionalText(input.leadId),
      campaignId: normalizeOptionalText(input.campaignId),
      landingPageId: normalizeOptionalText(input.landingPageId),
      landingSlug: input.landingSlug.trim(),
      utmSource: normalizeOptionalText(input.utmSource),
      utmMedium: normalizeOptionalText(input.utmMedium),
      utmCampaign: normalizeOptionalText(input.utmCampaign),
      utmTerm: normalizeOptionalText(input.utmTerm),
      referrer: normalizeOptionalText(input.referrer),
      firstTouchAt: input.firstTouchAt ?? now,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? input.createdAt ?? now,
    }

    await this.db.run(
      `
        INSERT INTO regional_lead_attribution (
          id,
          lead_id,
          campaign_id,
          landing_page_id,
          landing_slug,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          referrer,
          first_touch_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      record.id,
      record.leadId ?? null,
      record.campaignId ?? null,
      record.landingPageId ?? null,
      record.landingSlug,
      record.utmSource ?? null,
      record.utmMedium ?? null,
      record.utmCampaign ?? null,
      record.utmTerm ?? null,
      record.referrer ?? null,
      record.firstTouchAt,
      record.createdAt,
      record.updatedAt,
    )

    return record
  }

  async getAttributionById(id: string): Promise<LeadAttributionRecord | null> {
    const row = await this.db.get<LeadAttributionRow>(
      `
        SELECT
          id,
          lead_id,
          campaign_id,
          landing_page_id,
          landing_slug,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          referrer,
          first_touch_at,
          created_at,
          updated_at
        FROM regional_lead_attribution
        WHERE id = ?
      `,
      id,
    )

    return mapRowToRecord(row)
  }

  async listCampaignAttributions(campaignId: string, limit = 200): Promise<LeadAttributionRecord[]> {
    const rows = await this.db.all<LeadAttributionRow[]>(
      `
        SELECT
          id,
          lead_id,
          campaign_id,
          landing_page_id,
          landing_slug,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          referrer,
          first_touch_at,
          created_at,
          updated_at
        FROM regional_lead_attribution
        WHERE campaign_id = ?
        ORDER BY first_touch_at DESC, created_at DESC
        LIMIT ?
      `,
      campaignId,
      limit,
    )

    return rows
      .map((row) => mapRowToRecord(row))
      .filter((row): row is LeadAttributionRecord => Boolean(row))
  }

  async listLandingAttributions(landingSlug: string, limit = 200): Promise<LeadAttributionRecord[]> {
    const rows = await this.db.all<LeadAttributionRow[]>(
      `
        SELECT
          id,
          lead_id,
          campaign_id,
          landing_page_id,
          landing_slug,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          referrer,
          first_touch_at,
          created_at,
          updated_at
        FROM regional_lead_attribution
        WHERE landing_slug = ?
        ORDER BY first_touch_at DESC, created_at DESC
        LIMIT ?
      `,
      landingSlug,
      limit,
    )

    return rows
      .map((row) => mapRowToRecord(row))
      .filter((row): row is LeadAttributionRecord => Boolean(row))
  }

  async countCampaignVisits(campaignId: string): Promise<number> {
    const row = await this.db.get<{ total: JsonPrimitive }>(
      `
        SELECT COUNT(*) AS total
        FROM regional_lead_attribution
        WHERE campaign_id = ?
      `,
      campaignId,
    )

    return Number(row?.total ?? 0)
  }

  async countLandingVisits(landingSlug: string): Promise<number> {
    const row = await this.db.get<{ total: JsonPrimitive }>(
      `
        SELECT COUNT(*) AS total
        FROM regional_lead_attribution
        WHERE landing_slug = ?
      `,
      landingSlug,
    )

    return Number(row?.total ?? 0)
  }
}

export function createLeadAttributionRepository(db: BackendDatabase) {
  return new LeadAttributionRepository(db)
}
