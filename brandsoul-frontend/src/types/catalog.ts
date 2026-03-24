export type CatalogAvailability = 'available' | 'low' | 'out'
export type CatalogPriority = 'high' | 'medium' | 'low'

export interface CatalogItem {
  id: string
  name: string
  description: string
  category?: string
  price?: string
  highlight?: string
  priority?: CatalogPriority
  isFeatured?: boolean
  complements?: string[]
  image?: string
  images?: string[]
  stock?: number
  availability?: CatalogAvailability
  ctaLabel?: string
  title?: string
}
