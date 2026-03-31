import type { CatalogAvailability, CatalogItem, CatalogPriority } from '../types/catalog'

export const CATALOG_STORAGE_KEY = 'brandsoul.catalog'
const CATALOG_TEXT_MAX_LENGTH = 140
const CATALOG_IMAGE_MAX_LENGTH = 2_000_000

function buildCatalogItemId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `catalog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function resolveCatalogAvailability(stock?: number, availability?: CatalogAvailability): CatalogAvailability {
  if (typeof stock === 'number' && Number.isFinite(stock)) {
    if (stock <= 0) {
      return 'out'
    }

    if (stock <= 3) {
      return 'low'
    }

    return 'available'
  }

  return availability ?? 'available'
}

export function normalizeCatalogItem(item: Partial<CatalogItem>): CatalogItem | null {
  const name = (item.name ?? item.title)?.trim().slice(0, CATALOG_TEXT_MAX_LENGTH)
  const description = item.description?.trim().slice(0, CATALOG_TEXT_MAX_LENGTH)
  if (!name || !description) {
    return null
  }

  const price = item.price?.trim().slice(0, 40)
  const ctaLabel = item.ctaLabel?.trim().slice(0, 40)
  const highlight = item.highlight?.trim().slice(0, 40)
  const category = item.category?.trim().slice(0, 40)
  const priority = normalizeCatalogPriority(item.priority)
  const isFeatured = normalizeCatalogFeatured(item.isFeatured)
  const isPromotion = normalizeCatalogFeatured(item.isPromotion)
  const isNewArrival = normalizeCatalogFeatured(item.isNewArrival)
  const complements = normalizeCatalogComplements(item.complements)
  const image = normalizeCatalogImage(item.image)
  const images = normalizeCatalogImages(item.images)
  const stock = normalizeCatalogStock(item.stock)
  const availability = resolveCatalogAvailability(stock, normalizeCatalogAvailability(item.availability))

  return {
    id: item.id?.trim() || buildCatalogItemId(),
    name,
    description,
    category: category || undefined,
    price: price || undefined,
    highlight: highlight || undefined,
    priority,
    isFeatured,
    isPromotion,
    isNewArrival,
    complements,
    image,
    images,
    stock,
    availability,
    ctaLabel: ctaLabel || undefined,
    title: name,
  }
}

export function loadCatalogItems(): CatalogItem[] {
  const rawCatalog = window.localStorage.getItem(CATALOG_STORAGE_KEY)
  if (!rawCatalog) {
    return []
  }

  try {
    const parsedCatalog = JSON.parse(rawCatalog) as Array<Partial<CatalogItem>>
    if (!Array.isArray(parsedCatalog)) {
      return []
    }

    return parsedCatalog
      .map((item) => normalizeCatalogItem(item))
      .filter((item): item is CatalogItem => item !== null)
      .slice(0, 6)
  } catch {
    return []
  }
}

export function saveCatalogItems(items: CatalogItem[]) {
  const normalizedCatalog = items
    .map((item) => normalizeCatalogItem(item))
    .filter((item): item is CatalogItem => item !== null)
    .slice(0, 6)
    .map((item) => buildLightCatalogItem(item))

  try {
    window.localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(normalizedCatalog))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      window.localStorage.removeItem(CATALOG_STORAGE_KEY)
      return
    }

    throw error
  }
}

export function buildCatalogSummary(items: CatalogItem[]) {
  return items.slice(0, 6).map((item) => ({
    name: item.name,
    price: item.price,
    availability: resolveCatalogAvailability(item.stock, item.availability),
    is_featured: item.isFeatured ?? false,
    priority: item.priority ?? 'medium',
    is_promotion: item.isPromotion ?? false,
    is_new_arrival: item.isNewArrival ?? false,
    highlight: item.highlight,
    description: item.description.slice(0, 80),
    complements: item.complements?.slice(0, 3) ?? [],
  }))
}

function normalizeCatalogPriority(value?: CatalogPriority) {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value
  }

  return undefined
}

function normalizeCatalogFeatured(value?: boolean) {
  if (typeof value !== 'boolean') {
    return undefined
  }

  return value
}

function normalizeCatalogComplements(values?: string[]) {
  if (!Array.isArray(values)) {
    return undefined
  }

  const normalizedValues = values
    .map((value) => value.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 4)

  return normalizedValues.length > 0 ? normalizedValues : undefined
}

function normalizeCatalogAvailability(value?: CatalogAvailability): CatalogAvailability | undefined {
  if (value === 'available' || value === 'low' || value === 'out') {
    return value
  }

  return undefined
}

function normalizeCatalogImage(value?: string) {
  const normalizedValue = value?.trim()
  if (!normalizedValue) {
    return undefined
  }

  return normalizedValue.slice(0, CATALOG_IMAGE_MAX_LENGTH)
}

function normalizeCatalogImages(values?: string[]) {
  if (!Array.isArray(values)) {
    return undefined
  }

  const normalizedValues = values
    .map((value) => normalizeCatalogImage(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)

  return normalizedValues.length > 0 ? normalizedValues : undefined
}

function normalizeCatalogStock(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  const normalizedValue = Math.max(0, Math.floor(value))
  return normalizedValue
}

function buildLightCatalogItem(item: CatalogItem): Partial<CatalogItem> {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    price: item.price,
    highlight: item.highlight,
    priority: item.priority,
    isFeatured: item.isFeatured,
    isPromotion: item.isPromotion,
    isNewArrival: item.isNewArrival,
    complements: item.complements,
    stock: item.stock,
    availability: item.availability,
    ctaLabel: item.ctaLabel,
    title: item.title,
  }
}
