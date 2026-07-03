import type { CanonicalContactIdentity } from './legalCanonicalTypes.js'

const INVISIBLE_CHARACTERS_PATTERN = /[\u200B-\u200D\uFEFF]/g

export type CanonicalPhoneNormalizationOptions = {
  defaultCountryCode?: string
}

export type CanonicalContactIdentityInput = {
  name?: string
  phone?: string
  whatsapp?: string
  email?: string
  city?: string
}

function sanitizeDisplayText(value: string) {
  return value
    .normalize('NFKC')
    .replace(INVISIBLE_CHARACTERS_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLowercaseSearchValue(value: string) {
  return sanitizeDisplayText(value).toLocaleLowerCase('pt-BR')
}

function normalizeBrazilianPhoneDigits(value: string, options?: CanonicalPhoneNormalizationOptions) {
  const defaultCountryCode = options?.defaultCountryCode?.trim() || '55'
  let digits = value.replace(/\D+/g, '')

  if (digits.length === 0) {
    return undefined
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  if (digits.startsWith(defaultCountryCode)) {
    const nationalNumber = digits.slice(defaultCountryCode.length)
    if (nationalNumber.length === 10 || nationalNumber.length === 11) {
      return `${defaultCountryCode}${nationalNumber}`
    }

    return undefined
  }

  if (digits.startsWith('0')) {
    digits = digits.replace(/^0+/, '')
  }

  if (digits.length === 10 || digits.length === 11) {
    return `${defaultCountryCode}${digits}`
  }

  return undefined
}

export function normalizeCanonicalPhone(value: unknown, options?: CanonicalPhoneNormalizationOptions) {
  if (typeof value !== 'string') {
    return undefined
  }

  const sanitized = sanitizeDisplayText(value)
  if (sanitized.length === 0) {
    return undefined
  }

  return normalizeBrazilianPhoneDigits(sanitized, options)
}

export function normalizeCanonicalWhatsapp(value: unknown, options?: CanonicalPhoneNormalizationOptions) {
  if (typeof value !== 'string') {
    return undefined
  }

  const sanitized = sanitizeDisplayText(value)
  if (sanitized.length === 0) {
    return undefined
  }

  return normalizeBrazilianPhoneDigits(sanitized, options)
}

export function normalizeCanonicalEmail(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const sanitized = sanitizeDisplayText(value).toLocaleLowerCase('en-US')
  if (sanitized.length === 0) {
    return undefined
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailPattern.test(sanitized) ? sanitized : undefined
}

export function normalizeCanonicalPersonName(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const sanitized = sanitizeDisplayText(value)
  return sanitized.length > 0 ? sanitized : undefined
}

export function normalizeCanonicalCity(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const sanitized = sanitizeDisplayText(value)
  return sanitized.length > 0 ? sanitized : undefined
}

export function buildCanonicalContactIdentity(input: CanonicalContactIdentityInput): CanonicalContactIdentity | undefined {
  const displayName = normalizeCanonicalPersonName(input.name)
  const canonicalName = displayName

  const displayPhone = typeof input.phone === 'string' ? sanitizeDisplayText(input.phone) || undefined : undefined
  const canonicalPhone = normalizeCanonicalPhone(input.phone)

  const displayWhatsapp = typeof input.whatsapp === 'string' ? sanitizeDisplayText(input.whatsapp) || undefined : undefined
  const canonicalWhatsapp = normalizeCanonicalWhatsapp(input.whatsapp)

  const displayEmail = typeof input.email === 'string' ? sanitizeDisplayText(input.email) || undefined : undefined
  const canonicalEmail = normalizeCanonicalEmail(input.email)

  const displayCity = normalizeCanonicalCity(input.city)
  const canonicalCity = displayCity

  if (
    !displayName
    && !displayPhone
    && !displayWhatsapp
    && !displayEmail
    && !displayCity
    && !canonicalPhone
    && !canonicalWhatsapp
    && !canonicalEmail
  ) {
    return undefined
  }

  const searchParts = Array.from(new Set([
    canonicalName ? normalizeLowercaseSearchValue(canonicalName) : undefined,
    canonicalWhatsapp,
    canonicalPhone,
    canonicalEmail ? normalizeLowercaseSearchValue(canonicalEmail) : undefined,
    canonicalCity ? normalizeLowercaseSearchValue(canonicalCity) : undefined,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)))

  return {
    displayName,
    canonicalName,
    displayPhone,
    canonicalPhone,
    displayWhatsapp,
    canonicalWhatsapp,
    displayEmail,
    canonicalEmail,
    displayCity,
    canonicalCity,
    searchKey: searchParts.join('|') || undefined,
  }
}
