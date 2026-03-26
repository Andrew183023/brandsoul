import axios from 'axios'

import { buildApiUrl } from './api'
import type { BrandPersona } from './persona'
import type { CatalogItem } from '../types/catalog'

export interface PublicBrandResponse {
  slug: string
  spark: BrandPersona
  catalog: CatalogItem[]
  theme?: BrandPersona['theme']
  pageSections?: BrandPersona['pageSections']
  pageHighlights?: {
    hasPromotions: boolean
    hasNewArrivals: boolean
  } | null
}

export async function fetchPublicBrand(slug: string) {
  const response = await axios.get<PublicBrandResponse>(buildApiUrl(`/public/brands/${encodeURIComponent(slug)}`))
  return response.data
}
