import type { CatalogItem } from '../types/catalog'

interface CaseSummaryPayload {
  tipo?: string
  dados?: string[]
  evidencias?: string[]
  passos?: string[]
}

interface WhatsAppTemplateData {
  tipo: string
  resumo: string
  impacto: string
  evidencias: string
}

export function sanitizeWhatsAppInput(value: string) {
  const trimmedValue = value.trim()
  const hasPlusPrefix = trimmedValue.startsWith('+')
  const digits = trimmedValue.replace(/\D/g, '')
  return `${hasPlusPrefix ? '+' : ''}${digits}`
}

export function normalizeWhatsAppNumber(value?: string) {
  const rawValue = value?.trim()
  if (!rawValue) {
    return undefined
  }

  if (rawValue.includes('wa.me') || rawValue.startsWith('http://') || rawValue.startsWith('https://')) {
    const digitsFromUrl = rawValue.replace(/\D/g, '')
    return digitsFromUrl.length >= 10 ? `+${digitsFromUrl}` : undefined
  }

  const hasPlusPrefix = rawValue.startsWith('+')
  const digits = rawValue.replace(/\D/g, '')
  if (digits.length < 10) {
    return undefined
  }

  return `${hasPlusPrefix ? '+' : '+'}${digits}`
}

export function buildWhatsAppMessage(item?: CatalogItem | null) {
  if (!item) {
    return 'Oi! Tenho interesse nos seus produtos e queria mais informações.'
  }

  if (item.price?.trim()) {
    return `Oi! Tenho interesse em ${item.name}, que vi por ${item.price.trim()}, e queria mais informações.`
  }

  return `Oi! Tenho interesse em ${item.name} e queria mais informações.`
}

export function buildWhatsAppUrl(number?: string, message?: string) {
  const normalizedNumber = normalizeWhatsAppNumber(number)
  if (!normalizedNumber) {
    return null
  }

  const waNumber = normalizedNumber.replace(/\D/g, '')
  if (!waNumber) {
    return null
  }

  const encodedMessage = encodeURIComponent(message?.trim() || buildWhatsAppMessage())
  return `https://wa.me/${waNumber}?text=${encodedMessage}`
}

export function applyWhatsAppTemplate(template: string, data: WhatsAppTemplateData) {
  return template
    .replaceAll('{tipo}', data.tipo)
    .replaceAll('{resumo}', data.resumo)
    .replaceAll('{impacto}', data.impacto)
    .replaceAll('{evidencias}', data.evidencias)
}

export function formatSummaryForWhatsApp(summary: CaseSummaryPayload, template?: string) {
  const caseType = summary.tipo ? summary.tipo.replace(/_/g, ' ') : 'orientação inicial'
  const dataItems = (summary.dados ?? []).slice(0, 4)
  const evidenceItems = (summary.evidencias ?? []).slice(0, 4)
  const stepItems = (summary.passos ?? []).slice(0, 4)
  const shortSummary = dataItems[0] ?? 'Caso em organização inicial'
  const impactSummary = dataItems[1] ?? dataItems[2] ?? 'Impacto ainda em detalhamento'
  const evidenceSummary = evidenceItems.length > 0 ? evidenceItems.join(', ') : 'Sem evidências anexadas até o momento'
  const nextStepSummary = stepItems[0] ?? 'Aguardar orientação profissional'

  if (template?.trim()) {
    return applyWhatsAppTemplate(template.trim(), {
      tipo: caseType,
      resumo: shortSummary,
      impacto: impactSummary,
      evidencias: evidenceSummary,
    })
  }

  return [
    'Olá, organizei meu caso pelo BrandSoul e gostaria de encaminhar para análise.',
    '',
    `Tipo de caso: ${caseType}`,
    `Resumo: ${shortSummary}`,
    `Impacto: ${impactSummary}`,
    `Evidências: ${evidenceSummary}`,
    `Próximo passo já orientado: ${nextStepSummary}`,
    '',
    'Podemos seguir com a análise?',
  ].join('\n')
}
