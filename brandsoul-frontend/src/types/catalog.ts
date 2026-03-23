export type CatalogAvailability = 'available' | 'low' | 'out'

export interface CatalogItem {
  id: string
  name: string
  description: string
  category?: string
  price?: string
  highlight?: string
  image?: string
  images?: string[]
  stock?: number
  availability?: CatalogAvailability
  ctaLabel?: string
  title?: string
}
