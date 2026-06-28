import type { CaseRecord, JsonObject } from './caseTypes.js'
import type {
  LegalCanonicalProfessionalIdentity,
  LegalCaseIdentity,
  LegalOfficeIdentity,
} from './legalCanonicalTypes.js'
import { readCanonicalCaseInput } from './legalCanonicalCaseInput.js'

type OfficeBusinessConfigLike = {
  officeName?: string
  logoUrl?: string
  institutionalDescription?: string
  description?: string
  legalAreas?: string[]
  servedCities?: string[]
  serviceRegion?: string
  businessHours?: string
  oabCredential?: string
  whatsapp?: string
  phone?: string
  email?: string
  website?: string
  site?: string
  instagram?: string
}

type OfficeEntityLike = {
  id: string
  tenantId?: number
  ownerTenantId?: number
  displayName?: string
  name?: string
  metadata?: unknown
  entityProfile?: {
    metadata?: unknown
    displayName?: string
    name?: string
  }
}

type OfficeProfessionalLike = {
  id: string
  displayName: string
  oabCredential?: string
  email?: string
  phone?: string
  photoUrl?: string
  specialty?: string
  specialties?: string[]
  isResponsible?: boolean
  isPublic?: boolean
  status?: string
}

function asRecord(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as JsonObject
}

function readString(record: unknown, ...keys: string[]) {
  const source = asRecord(record)

  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

function readStringArray(record: unknown, ...keys: string[]) {
  const source = asRecord(record)

  for (const key of keys) {
    const value = source[key]
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }

  return []
}

function readNestedRecord(record: unknown, key: string) {
  return asRecord(asRecord(record)[key])
}

function compactUnique(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
}

export function buildLegalCaseNumber(caseId: string, explicitCaseNumber?: string | null) {
  const normalizedExplicit = explicitCaseNumber?.trim()
  if (normalizedExplicit) {
    return normalizedExplicit
  }

  const compact = caseId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return `CASO-${compact.slice(0, 8) || 'LEGAL'}`
}

export function mapLegalProfessionalIdentity(professional: OfficeProfessionalLike): LegalCanonicalProfessionalIdentity {
  const specialties = professional.specialties?.map((item) => item.trim()).filter(Boolean) ?? []

  return {
    id: professional.id,
    displayName: professional.displayName,
    oabCredential: professional.oabCredential,
    email: professional.email,
    phone: professional.phone,
    photoUrl: professional.photoUrl,
    specialty: professional.specialty ?? specialties[0],
    specialties,
    isResponsible: professional.isResponsible === true,
    isPublic: professional.isPublic === true,
    status: professional.status ?? 'active',
  }
}

export function buildLegalOfficeIdentity(args: {
  office: OfficeEntityLike
  businessConfig?: OfficeBusinessConfigLike | null
  professionals?: OfficeProfessionalLike[]
}): LegalOfficeIdentity {
  const profileMetadata = asRecord(args.office.entityProfile?.metadata)
  const officeMetadata = asRecord(args.office.metadata)
  const metadataBusinessConfig = readNestedRecord(profileMetadata, 'businessConfig')
  const businessConfig = {
    ...metadataBusinessConfig,
    ...(args.businessConfig ?? {}),
  }

  const professionals = (args.professionals ?? []).map(mapLegalProfessionalIdentity)
  const responsibleProfessional = professionals.find((professional) => professional.isResponsible) ?? null

  return {
    officeId: args.office.id,
    tenantId: args.office.ownerTenantId ?? args.office.tenantId ?? 0,
    name: readString(businessConfig, 'officeName', 'name')
      ?? args.office.entityProfile?.displayName
      ?? args.office.entityProfile?.name
      ?? args.office.displayName
      ?? args.office.name
      ?? 'Escritório sem nome',
    logoUrl: readString(businessConfig, 'logoUrl', 'logo', 'brandLogo') ?? readString(officeMetadata, 'logoUrl', 'logo'),
    description: readString(businessConfig, 'institutionalDescription', 'description'),
    areas: compactUnique(readStringArray(businessConfig, 'legalAreas', 'areas', 'practiceAreas')),
    oab: readString(businessConfig, 'oabCredential', 'oab'),
    cities: compactUnique(readStringArray(businessConfig, 'servedCities', 'cities')),
    coverage: readString(businessConfig, 'serviceRegion', 'coverage'),
    businessHours: readString(businessConfig, 'businessHours'),
    contacts: {
      phone: readString(businessConfig, 'phone'),
      whatsapp: readString(businessConfig, 'whatsapp'),
      email: readString(businessConfig, 'email'),
      website: readString(businessConfig, 'website', 'site'),
      instagram: readString(businessConfig, 'instagram'),
    },
    responsibleProfessional,
    professionals,
  }
}

export function buildLegalCaseIdentity(args: {
  caseRecord: CaseRecord
  responsibleProfessional?: OfficeProfessionalLike | null
  lastInteractionAt?: string
  sla?: LegalCaseIdentity['sla']
}): LegalCaseIdentity {
  const metadata = asRecord(args.caseRecord.metadata)
  const publicTriage = readNestedRecord(metadata, 'publicTriage')
  const persistedCanonicalInput = readCanonicalCaseInput(asRecord(metadata).canonicalCaseInput)
  const responsibleProfessional = args.responsibleProfessional
    ? mapLegalProfessionalIdentity(args.responsibleProfessional)
    : null

  return {
    caseId: args.caseRecord.id,
    caseNumber: buildLegalCaseNumber(
      args.caseRecord.id,
      persistedCanonicalInput?.caseNumber ?? args.caseRecord.caseNumber,
    ),
    tenantId: args.caseRecord.tenantId,
    entityId: args.caseRecord.entityId ?? '',
    client: {
      name: persistedCanonicalInput?.clientName
        ?? readString(metadata, 'clientName', 'fullName', 'name')
        ?? readString(publicTriage, 'clientName', 'fullName', 'name'),
      contact: persistedCanonicalInput?.contact
        ?? readString(metadata, 'contact')
        ?? readString(publicTriage, 'contactValue'),
      contactPreference: persistedCanonicalInput?.contactPreference
        ?? readString(publicTriage, 'contactPreference')
        ?? readString(metadata, 'contactPreference'),
      city: persistedCanonicalInput?.city
        ?? readString(metadata, 'city')
        ?? readString(publicTriage, 'city'),
    },
    practiceArea: args.caseRecord.practiceArea ?? persistedCanonicalInput?.practiceArea,
    city: persistedCanonicalInput?.city
      ?? readString(metadata, 'city')
      ?? readString(publicTriage, 'city'),
    responsibleProfessional,
    priority: args.caseRecord.priority,
    status: args.caseRecord.status,
    openedAt: persistedCanonicalInput?.openedAt ?? args.caseRecord.openedAt,
    updatedAt: args.caseRecord.updatedAt,
    lastInteractionAt: args.lastInteractionAt ?? persistedCanonicalInput?.lastInteractionAt,
    sla: args.sla,
  }
}

export const legalCanonicalIdentity = {
  buildLegalCaseNumber,
  buildLegalOfficeIdentity,
  buildLegalCaseIdentity,
  mapLegalProfessionalIdentity,
  compactUnique,
}
