import type { CasePriority, CaseStatus } from './caseTypes.js'

export type LegalCanonicalProfessionalIdentity = {
  id: string
  displayName: string
  oabCredential?: string
  email?: string
  phone?: string
  photoUrl?: string
  specialty?: string
  specialties: string[]
  isResponsible: boolean
  isPublic: boolean
  status: string
}

export type LegalOfficeIdentity = {
  officeId: string
  tenantId: number
  name: string
  logoUrl?: string
  description?: string
  areas: string[]
  oab?: string
  cities: string[]
  coverage?: string
  businessHours?: string
  contacts: {
    phone?: string
    whatsapp?: string
    email?: string
    website?: string
    instagram?: string
  }
  responsibleProfessional?: LegalCanonicalProfessionalIdentity | null
  professionals: LegalCanonicalProfessionalIdentity[]
}

export type LegalCaseIdentity = {
  caseId: string
  caseNumber: string
  tenantId: number
  entityId: string
  client: {
    name?: string
    contact?: string
    contactPreference?: string
    city?: string
  }
  practiceArea?: string
  city?: string
  responsibleProfessional?: LegalCanonicalProfessionalIdentity | null
  priority: CasePriority
  status: CaseStatus
  openedAt: string
  updatedAt: string
  lastInteractionAt?: string
  sla?: {
    state: string
    remainingMinutes?: number
    dueAt?: string
  }
}
