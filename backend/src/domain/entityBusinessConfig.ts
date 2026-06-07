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
  other?: string
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

export type EntityBusinessTeamMember = {
  id: string
  name: string
  oabCredential?: string
  photoUrl?: string
  specialties?: string[]
  shortBio?: string
  email?: string
  phone?: string
  status?: 'active' | 'inactive' | 'suspended'
  isResponsible?: boolean
  isPublic?: boolean
}

export type EntityTrustEvidenceConfig = {
  enabled?: boolean
  approvedCaseIds?: string[]
}

export type EntityPublicMessages = {
  heroMessage?: string
  intakeMessage?: string
  availabilityMessage?: string
}

export type EntityTriagePolicies = {
  intakeCriteria?: string
  priorityRules?: string
  disqualificationRules?: string
}

export type EntityInstitutionalVideo = {
  mode: 'external' | 'uploaded'
  provider?: 'youtube' | 'vimeo' | 'upload'
  url: string
  title?: string
  intro?: string
}

export type EntityOfficeGalleryItem = {
  id: string
  url: string
  isCover?: boolean
}

export type EntityBusinessConfig = {
  businessType: EntityBusinessType
  description?: string
  officeName?: string
  institutionalDescription?: string
  legalAreas?: string[]
  servedCities?: string[]
  attendanceModel?: 'sales' | 'support' | 'guidance' | 'mixed'
  operatingHours?: string
  maxCapacity?: number
  avgResponseMinutes?: number
  toneProfile?: EntityToneProfile
  channels?: EntityBusinessChannels
  catalog?: EntityCatalogConfig
  services?: EntityServiceItem[]
  schedule?: EntityScheduleConfig
  legalMode?: EntityLegalModeConfig
  publicCtas?: EntityPublicCta[]
  serviceRules?: EntityServiceRules
  publicMessages?: EntityPublicMessages
  triagePolicies?: EntityTriagePolicies
  trustEvidence?: EntityTrustEvidenceConfig
  team?: EntityBusinessTeamMember[]
  responsibleProfessional?: {
    photoUrl?: string
    fullName: string
    oabCredential?: string
    specialties: string[]
    yearsOfExperience?: number
    shortBio?: string
  }
  officeGallery?: EntityOfficeGalleryItem[]
  institutionalVideo?: EntityInstitutionalVideo
}
