import type { CatalogItem } from '../types/catalog'

interface CaseSummaryPayload {
  tipo?: string
  dados?: string[]
  evidencias?: string[]
  passos?: string[]
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

export function formatSummaryForWhatsApp(summary: CaseSummaryPayload) {
  const caseType = summary.tipo ? summary.tipo.replace(/_/g, ' ') : 'orientação inicial'
  const dataLines = (summary.dados ?? []).slice(0, 4).map((item) => `- ${item}`)
  const evidenceLines = (summary.evidencias ?? []).slice(0, 4).map((item) => `- ${item}`)
  const stepLines = (summary.passos ?? []).slice(0, 4).map((item) => `- ${item}`)

  return [
    'Olá. Quero encaminhar este resumo para análise profissional.',
    '',
    `Tipo de caso: ${caseType}`,
    '',
    'Informações coletadas:',
    ...(dataLines.length > 0 ? dataLines : ['- Ainda sem detalhes adicionais.']),
    '',
    'Evidências registradas:',
    ...(evidenceLines.length > 0 ? evidenceLines : ['- Ainda sem evidências registradas.']),
    '',
    'Próximos passos sugeridos:',
    ...(stepLines.length > 0 ? stepLines : ['- Aguardar orientação profissional.']),
  ].join('\n')
}
