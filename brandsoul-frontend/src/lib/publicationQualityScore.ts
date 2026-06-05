import type { ProfessionalReadinessSnapshot } from './professionalReadiness'

export type PublicationQualityClassification = 'Excelente' | 'Boa' | 'Parcial' | 'Incompleta'

export type PublicationQualityCriterionId =
  | 'profileComplete'
  | 'channelsConfigured'
  | 'coverageConfigured'
  | 'availabilityConfigured'
  | 'intakeConfigured'
  | 'publicMessagesConfigured'
  | 'publicProfessionalConfigured'
  | 'responsibleProfessionalConfigured'
  | 'professionalOabConfigured'
  | 'professionalSpecialtyConfigured'
  | 'professionalTrustProfileConfigured'
  | 'publicationActive'

export type PublicationQualityCriterion = {
  id: PublicationQualityCriterionId
  label: string
  weight: number
  met: boolean
}

export type PublicationQualityInput = {
  officeName: string
  institutionalDescription: string
  legalAreas: string
  servedCities: string
  operatingHours: string
  avgResponseMinutes: string
  responseWindowLabel: string
  whatsapp: string
  phone: string
  email: string
  address: string
  website: string
  otherContact: string
  heroMessage: string
  intakeMessage: string
  availabilityMessage: string
  intakeCriteria: string
  publicationStatus: 'published' | 'draft' | 'unpublished'
  professionalReadiness?: ProfessionalReadinessSnapshot
}

export type PublicationQualityScore = {
  score: number
  classification: PublicationQualityClassification
  criteria: PublicationQualityCriterion[]
  missingItems: string[]
  nextSteps: string[]
}

function countCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .length
}

function hasText(value: string) {
  return value.trim().length > 0
}

function resolveClassification(score: number): PublicationQualityClassification {
  if (score >= 90) {
    return 'Excelente'
  }

  if (score >= 70) {
    return 'Boa'
  }

  if (score >= 50) {
    return 'Parcial'
  }

  return 'Incompleta'
}

function toNextStep(label: string) {
  if (label === 'Perfil completo') {
    return 'Complete nome institucional e descricao para elevar confianca publica.'
  }

  if (label === 'Canais configurados') {
    return 'Defina ao menos um canal de contato publico para conversao ativa.'
  }

  if (label === 'Cobertura configurada') {
    return 'Configure areas juridicas e cidades atendidas para reduzir ambiguidade.'
  }

  if (label === 'Disponibilidade configurada') {
    return 'Preencha disponibilidade/SLA para dar previsibilidade de resposta.'
  }

  if (label === 'Intake configurado') {
    return 'Defina criterios de intake para padronizar entrada de casos.'
  }

  if (label === 'Mensagens publicas configuradas') {
    return 'Conclua as tres mensagens publicas para narrativa coerente.'
  }

  if (label === 'Profissional publico configurado') {
    return 'Defina ao menos um profissional publico para sustentar confianca e visibilidade institucional.'
  }

  if (label === 'Responsavel profissional definido') {
    return 'Marque quem responde visivelmente pelo escritorio antes da publicacao.'
  }

  if (label === 'OAB profissional informada') {
    return 'Informe a credencial OAB no cadastro profissional visivel.'
  }

  if (label === 'Especialidades profissionais definidas') {
    return 'Vincule especialidades aos profissionais publicos para dar aderencia ao perfil.'
  }

  if (label === 'Perfil humano confiavel') {
    return 'Complete foto ou bio do profissional responsavel para reforcar confianca humana.'
  }

  if (label === 'Publicacao ativa') {
    return 'Ative publicacao apos fechar os criterios essenciais.'
  }

  return `Concluir: ${label}.`
}

export function evaluatePublicationQualityScore(input: PublicationQualityInput): PublicationQualityScore {
  const hasProfile = hasText(input.officeName) && hasText(input.institutionalDescription)
  const hasChannels = [
    input.whatsapp,
    input.phone,
    input.email,
    input.address,
    input.website,
    input.otherContact,
  ].some(hasText)
  const hasCoverage = countCsv(input.legalAreas) > 0 && countCsv(input.servedCities) > 0
  const hasAvailability = hasText(input.operatingHours) || hasText(input.avgResponseMinutes) || hasText(input.responseWindowLabel)
  const hasIntake = hasText(input.intakeCriteria)
  const hasMessages = hasText(input.heroMessage) && hasText(input.intakeMessage) && hasText(input.availabilityMessage)
  const professionals = input.professionalReadiness
  const hasPublicProfessional = professionals?.isKnown === true && professionals.hasPublicProfessional
  const hasResponsibleProfessional = professionals?.isKnown === true && professionals.hasResponsibleProfessional
  const hasProfessionalOab = professionals?.isKnown === true && professionals.hasOabCredential
  const hasProfessionalSpecialty = professionals?.isKnown === true && professionals.hasSpecialtyCoverage
  const hasHumanTrustProfile = professionals?.isKnown === true && professionals.hasHumanTrustProfile
  const isPublished = input.publicationStatus === 'published'

  const criteria: PublicationQualityCriterion[] = [
    { id: 'profileComplete', label: 'Perfil completo', weight: 10, met: hasProfile },
    { id: 'channelsConfigured', label: 'Canais configurados', weight: 8, met: hasChannels },
    { id: 'coverageConfigured', label: 'Cobertura configurada', weight: 8, met: hasCoverage },
    { id: 'availabilityConfigured', label: 'Disponibilidade configurada', weight: 8, met: hasAvailability },
    { id: 'intakeConfigured', label: 'Intake configurado', weight: 8, met: hasIntake },
    { id: 'publicMessagesConfigured', label: 'Mensagens publicas configuradas', weight: 8, met: hasMessages },
    { id: 'publicProfessionalConfigured', label: 'Profissional publico configurado', weight: 10, met: hasPublicProfessional },
    { id: 'responsibleProfessionalConfigured', label: 'Responsavel profissional definido', weight: 10, met: hasResponsibleProfessional },
    { id: 'professionalOabConfigured', label: 'OAB profissional informada', weight: 10, met: hasProfessionalOab },
    { id: 'professionalSpecialtyConfigured', label: 'Especialidades profissionais definidas', weight: 5, met: hasProfessionalSpecialty },
    { id: 'professionalTrustProfileConfigured', label: 'Perfil humano confiavel', weight: 5, met: hasHumanTrustProfile },
    { id: 'publicationActive', label: 'Publicacao ativa', weight: 10, met: isPublished },
  ]

  const score = criteria.reduce((total, criterion) => total + (criterion.met ? criterion.weight : 0), 0)
  const missingItems = criteria.filter((criterion) => !criterion.met).map((criterion) => criterion.label)
  const nextSteps = missingItems.slice(0, 3).map((label) => toNextStep(label))

  return {
    score,
    classification: resolveClassification(score),
    criteria,
    missingItems,
    nextSteps,
  }
}
