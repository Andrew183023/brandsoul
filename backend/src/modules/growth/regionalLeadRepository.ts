import { randomUUID } from 'node:crypto'

import type { BackendDatabase } from '../../db/index.js'

export type RegionalLeadUrgency = 'low' | 'normal' | 'high' | 'critical'
export type RegionalLeadStatus = 'new' | 'triaged' | 'contacted' | 'converted' | 'lost'

export type RegionalLeadRecord = {
  id: string
  campaignId?: string
  landingPageId?: string
  tenantId: string
  entityId: string
  landingSlug: string
  name: string
  phone: string
  email?: string
  city: string
  specialty: string
  urgency: RegionalLeadUrgency
  caseSummary: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  referrer?: string
  convertedCaseId?: string
  convertedAt?: string
  status: RegionalLeadStatus
  createdAt: string
  updatedAt: string
}

export type CreateRegionalLeadInput = {
  campaignId?: string
  landingPageId?: string
  tenantId: string
  entityId: string
  landingSlug: string
  name: string
  phone: string
  email?: string
  city: string
  specialty: string
  urgency?: RegionalLeadUrgency
  caseSummary: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  referrer?: string
}

type RegionalLeadRow = {
  id: string
  campaign_id: string | null
  landing_page_id: string | null
  tenant_id: string
  entity_id: string
  landing_slug: string
  name: string
  phone: string
  email: string | null
  city: string
  specialty: string
  urgency: RegionalLeadUrgency
  case_summary: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  referrer: string | null
  converted_case_id: string | null
  converted_at: string | null
  status: RegionalLeadStatus
  created_at: string
  updated_at: string
}

function normalizeRequiredText(value: string) {
  return value.trim()
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export function mapRegionalLeadRow(row: RegionalLeadRow): RegionalLeadRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id ?? undefined,
    landingPageId: row.landing_page_id ?? undefined,
    tenantId: row.tenant_id,
    entityId: row.entity_id,
    landingSlug: row.landing_slug,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    city: row.city,
    specialty: row.specialty,
    urgency: row.urgency,
    caseSummary: row.case_summary,
    utmSource: row.utm_source ?? undefined,
    utmMedium: row.utm_medium ?? undefined,
    utmCampaign: row.utm_campaign ?? undefined,
    utmTerm: row.utm_term ?? undefined,
    referrer: row.referrer ?? undefined,
    convertedCaseId: row.converted_case_id ?? undefined,
    convertedAt: row.converted_at ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class RegionalLeadRepository {
  constructor(private readonly db: BackendDatabase) {}

  async createLead(input: CreateRegionalLeadInput) {
    const now = new Date().toISOString()
    const lead: RegionalLeadRecord = {
      id: randomUUID(),
      campaignId: normalizeOptionalText(input.campaignId),
      landingPageId: normalizeOptionalText(input.landingPageId),
      tenantId: normalizeRequiredText(input.tenantId),
      entityId: normalizeRequiredText(input.entityId),
      landingSlug: normalizeRequiredText(input.landingSlug),
      name: normalizeRequiredText(input.name),
      phone: normalizeRequiredText(input.phone),
      email: normalizeOptionalText(input.email),
      city: normalizeRequiredText(input.city),
      specialty: normalizeRequiredText(input.specialty),
      urgency: input.urgency ?? 'normal',
      caseSummary: normalizeRequiredText(input.caseSummary),
      utmSource: normalizeOptionalText(input.utmSource),
      utmMedium: normalizeOptionalText(input.utmMedium),
      utmCampaign: normalizeOptionalText(input.utmCampaign),
      utmTerm: normalizeOptionalText(input.utmTerm),
      referrer: normalizeOptionalText(input.referrer),
      status: 'new',
      createdAt: now,
      updatedAt: now,
    }

    await this.db.transaction(async (tx) => {
      await tx.run(
        `
          INSERT INTO regional_leads (
            id,
            campaign_id,
            landing_page_id,
            tenant_id,
            entity_id,
            landing_slug,
            name,
            phone,
            email,
            city,
            specialty,
            urgency,
            case_summary,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_term,
            referrer,
            converted_case_id,
            converted_at,
            status,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        lead.id,
        lead.campaignId ?? null,
        lead.landingPageId ?? null,
        lead.tenantId,
        lead.entityId,
        lead.landingSlug,
        lead.name,
        lead.phone,
        lead.email ?? null,
        lead.city,
        lead.specialty,
        lead.urgency,
        lead.caseSummary,
        lead.utmSource ?? null,
        lead.utmMedium ?? null,
        lead.utmCampaign ?? null,
        lead.utmTerm ?? null,
        lead.referrer ?? null,
        null,
        null,
        lead.status,
        lead.createdAt,
        lead.updatedAt,
      )

      if (lead.landingPageId) {
        await tx.run(
          `
            UPDATE seo_landing_pages
            SET leads_received = leads_received + 1,
                updated_at = ?
            WHERE id = ?
          `,
          now,
          lead.landingPageId,
        )
      }

      if (lead.campaignId) {
        await tx.run(
          `
            UPDATE regional_campaigns
            SET leads_received = leads_received + 1,
                updated_at = ?
            WHERE id = ?
          `,
          now,
          lead.campaignId,
        )
      }
    })

    return lead
  }

  async getLeadById(id: string) {
    const row = await this.db.get<RegionalLeadRow>(
      `
        SELECT *
        FROM regional_leads
        WHERE id = ?
      `,
      id,
    )

    return row ? mapRegionalLeadRow(row) : null
  }

  async markLeadConverted(id: string, caseId: string) {
    const now = new Date().toISOString()
    await this.db.run(
      `
        UPDATE regional_leads
        SET converted_case_id = ?,
            converted_at = ?,
            status = 'converted',
            updated_at = ?
        WHERE id = ?
      `,
      caseId,
      now,
      now,
      id,
    )

    return this.getLeadById(id)
  }

  async listLeadsByCampaign(campaignId: string) {
    const rows = await this.db.all<RegionalLeadRow[]>(
      `
        SELECT *
        FROM regional_leads
        WHERE campaign_id = ?
        ORDER BY created_at DESC
      `,
      campaignId,
    )

    return rows.map(mapRegionalLeadRow)
  }

  async listLeadsByEntity(entityId: string) {
    const rows = await this.db.all<RegionalLeadRow[]>(
      `
        SELECT *
        FROM regional_leads
        WHERE entity_id = ?
        ORDER BY created_at DESC, updated_at DESC
      `,
      entityId,
    )

    return rows.map(mapRegionalLeadRow)
  }

  async countLeadsByCampaign(campaignId: string) {
    const row = await this.db.get<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM regional_leads
        WHERE campaign_id = ?
      `,
      campaignId,
    )

    return Number(row?.total ?? 0)
  }
}

export function createRegionalLeadRepository(db: BackendDatabase) {
  return new RegionalLeadRepository(db)
}
