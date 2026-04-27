export type BrandSoulCommerceProduct = {
  id: string
  name: string
  description?: string
  price?: number
  category?: string
  available?: boolean
}

export type BrandSoulPromotion = {
  id: string
  title: string
  description?: string
  discountLabel?: string
  validUntil?: string
  active: boolean
}

export type BrandSoulBusinessHoursEntry = {
  day:
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday'
  open?: string
  close?: string
  closed?: boolean
}

export type BrandSoulPolicy = {
  key: string
  title: string
  description: string
}

export type BrandSoulCampaign = {
  id: string
  name: string
  goal?: string
  active: boolean
  startsAt?: string
  endsAt?: string
}

export type BrandSoulCommerceContext = {
  products: BrandSoulCommerceProduct[]
  promotions: BrandSoulPromotion[]
  businessHours: BrandSoulBusinessHoursEntry[]
  policies: BrandSoulPolicy[]
  activeCampaigns: BrandSoulCampaign[]
}