export type EntityBusinessType = 'restaurant' | 'store' | 'legal' | 'services'

export type EntityToneProfile = {
  voice?: string
  style?: string
  intensity?: 'soft' | 'balanced' | 'strong'
}

export type EntityBusinessChannels = {
  whatsapp?: string
  phone?: string
  email?: string
  address?: string
  website?: string
}

export type EntityCatalogItem = {
  id: string
  title: string
  description?: string
  category?: string
  priceLabel?: string
  active?: boolean
}

export type EntityCatalogCategory = {
  id: string
  label: string
}

export type EntityCatalogConfig = {
  categories?: EntityCatalogCategory[]
  items?: EntityCatalogItem[]
}

export type EntityServiceItem = {
  id: string
  name: string
  description?: string
  category?: string
  durationMin?: number
  priceLabel?: string
  attendanceModes?: string[]
  active?: boolean
}

export type EntityScheduleSlot = {
  start: string
  end: string
}

export type EntityScheduleDay = {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  enabled: boolean
  slots?: EntityScheduleSlot[]
}

export type EntityScheduleConfig = {
  timezone?: string
  days?: EntityScheduleDay[]
}

export type EntityLegalModeConfig = {
  enabled: boolean
  emergencyMode?: boolean
  consumerMode?: boolean
}

export type EntityPublicCta = {
  id: string
  label: string
  type: 'primary' | 'secondary' | 'contact' | 'booking' | 'catalog'
  href?: string
  active?: boolean
}

export type EntityServiceRules = {
  attendanceMode?: 'sales' | 'support' | 'guidance' | 'mixed'
  responseWindowLabel?: string
  bookingEnabled?: boolean
  catalogEnabled?: boolean
}

export type EntityBusinessConfig = {
  businessType: EntityBusinessType
  description?: string
  toneProfile?: EntityToneProfile
  channels?: EntityBusinessChannels
  catalog?: EntityCatalogConfig
  services?: EntityServiceItem[]
  schedule?: EntityScheduleConfig
  legalMode?: EntityLegalModeConfig
  publicCtas?: EntityPublicCta[]
  serviceRules?: EntityServiceRules
}
