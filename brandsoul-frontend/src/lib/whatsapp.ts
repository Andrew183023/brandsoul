import type { CatalogItem } from '../types/catalog'

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
