export type ProfessionalReadinessCandidate = {
  displayName?: string
  photoUrl?: string
  oabCredential?: string
  specialties?: string[]
  bio?: string
  isResponsible?: boolean
  isPublic?: boolean
  status?: 'active' | 'inactive' | 'suspended'
}

export type ProfessionalReadinessSnapshot = {
  isKnown: boolean
  totalProfessionals: number
  publicProfessionals: number
  responsibleProfessionals: number
  professionalsWithOab: number
  professionalsWithSpecialties: number
  professionalsWithPhoto: number
  hasResponsibleProfessional: boolean
  hasPublicProfessional: boolean
  hasOabCredential: boolean
  hasSpecialtyCoverage: boolean
  hasHumanTrustProfile: boolean
}

function normalizeText(value: string | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

export function buildProfessionalReadinessSnapshot(
  professionals: ProfessionalReadinessCandidate[] | undefined,
): ProfessionalReadinessSnapshot {
  if (!Array.isArray(professionals)) {
    return {
      isKnown: false,
      totalProfessionals: 0,
      publicProfessionals: 0,
      responsibleProfessionals: 0,
      professionalsWithOab: 0,
      professionalsWithSpecialties: 0,
      professionalsWithPhoto: 0,
      hasResponsibleProfessional: false,
      hasPublicProfessional: false,
      hasOabCredential: false,
      hasSpecialtyCoverage: false,
      hasHumanTrustProfile: false,
    }
  }

  const activeProfessionals = professionals.filter((professional) => professional.status !== 'inactive')
  const publicProfessionals = activeProfessionals.filter((professional) => professional.isPublic === true)
  const responsibleProfessionals = activeProfessionals.filter((professional) => professional.isResponsible === true)
  const professionalsWithOab = activeProfessionals.filter((professional) => normalizeText(professional.oabCredential).length > 0)
  const professionalsWithSpecialties = activeProfessionals.filter((professional) => (professional.specialties ?? []).some((item) => normalizeText(item).length > 0))
  const professionalsWithPhoto = activeProfessionals.filter((professional) => normalizeText(professional.photoUrl).length > 0)
  const responsiblePublicProfessional = responsibleProfessionals.find((professional) => professional.isPublic === true) ?? responsibleProfessionals[0]
  const responsibleHasHumanProfile = Boolean(
    responsiblePublicProfessional
    && normalizeText(responsiblePublicProfessional.displayName).length > 0
    && normalizeText(responsiblePublicProfessional.oabCredential).length > 0
    && ((responsiblePublicProfessional.specialties ?? []).some((item) => normalizeText(item).length > 0))
    && (
      normalizeText(responsiblePublicProfessional.photoUrl).length > 0
      || normalizeText(responsiblePublicProfessional.bio).length > 0
    ),
  )

  return {
    isKnown: true,
    totalProfessionals: activeProfessionals.length,
    publicProfessionals: publicProfessionals.length,
    responsibleProfessionals: responsibleProfessionals.length,
    professionalsWithOab: professionalsWithOab.length,
    professionalsWithSpecialties: professionalsWithSpecialties.length,
    professionalsWithPhoto: professionalsWithPhoto.length,
    hasResponsibleProfessional: responsibleProfessionals.length > 0,
    hasPublicProfessional: publicProfessionals.length > 0,
    hasOabCredential: professionalsWithOab.length > 0,
    hasSpecialtyCoverage: professionalsWithSpecialties.length > 0,
    hasHumanTrustProfile: responsibleHasHumanProfile,
  }
}
