import { randomUUID } from 'node:crypto'

import type { BackendDatabase } from '../../db/index.js'
import type { RegionalCampaignRecord } from './regionalGrowthRepository.js'

const SPECIALTY_LABELS: Record<string, string> = {
  trabalhista: 'Advogado Trabalhista',
  previdenciario: 'Advogado Previdenciário',
  familia: 'Advogado de Família',
  consumidor: 'Advogado do Consumidor',
  empresarial: 'Advogado Empresarial',
  criminal: 'Advogado Criminal',
  imobiliario: 'Advogado Imobiliário',
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function buildSeoHtml(city: string, specialty: string, label: string) {
  return `<section class="seo-landing-hero">
  <h1>${label} em ${city}</h1>
  <p>Atendimento jurídico online e presencial com triagem segura pela BrandSoul Legal.</p>
</section>`
}

export class SeoGeneratorService {
  constructor(private readonly db: BackendDatabase) {}

  async generatePagesForCampaign(campaign: RegionalCampaignRecord) {
    const now = new Date().toISOString()
    const pages = []

    for (const city of campaign.cities) {
      for (const specialty of campaign.specialties) {
        const label = SPECIALTY_LABELS[specialty] ?? specialty
        const slug = `/p/${slugify(city)}/${slugify(label)}`
        const title = `${label} em ${city} | Atendimento Online e Presencial`
        const metaDesc = `Precisa de ${label.toLowerCase()} em ${city}? Faça uma triagem segura e receba orientação inicial.`

        await this.db.run(
          `
            INSERT OR IGNORE INTO seo_landing_pages (
              id, campaign_id, tenant_id, entity_id, slug, city, specialty,
              title, meta_desc, content_html, published, leads_received,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
          `,
          randomUUID(),
          campaign.id,
          campaign.tenantId,
          campaign.entityId,
          slug,
          city,
          specialty,
          title,
          metaDesc,
          buildSeoHtml(city, specialty, label),
          now,
          now,
        )

        pages.push({ slug, city, specialty, title, metaDesc })
      }
    }

    await this.db.run(
      `
        UPDATE regional_campaigns
        SET seo_pages_generated = 1,
            updated_at = ?
        WHERE id = ?
      `,
      now,
      campaign.id,
    )

    return pages
  }
}

export function createSeoGeneratorService(db: BackendDatabase) {
  return new SeoGeneratorService(db)
}
