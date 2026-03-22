import type { CatalogItem } from '../types/catalog'

export const CATALOG_STORAGE_KEY = 'brandsoul.catalog'
const CATALOG_TEXT_MAX_LENGTH = 140

function buildCatalogItemId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `catalog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeCatalogItem(item: Partial<CatalogItem>): CatalogItem | null {
  const title = item.title?.trim().slice(0, CATALOG_TEXT_MAX_LENGTH)
  const description = item.description?.trim().slice(0, CATALOG_TEXT_MAX_LENGTH)
  if (!title || !description) {
    return null
  }

  const price = item.price?.trim().slice(0, 40)
  const ctaLabel = item.ctaLabel?.trim().slice(0, 40)
  const highlight = item.highlight?.trim().slice(0, 40)
  const category = item.category?.trim().slice(0, 40)

  return {
    id: item.id?.trim() || buildCatalogItemId(),
    title,
    description,
    price: price || undefined,
    ctaLabel: ctaLabel || undefined,
    highlight: highlight || undefined,
    category: category || undefined,
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

  window.localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(normalizedCatalog))
}
