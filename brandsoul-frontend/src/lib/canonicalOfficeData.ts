import type { OfficeBusinessConfig } from '../backend-bridge/api/adminApi'
import type { ProfessionalReadinessSnapshot } from './professionalReadiness'

export type CanonicalPublicationStatus = 'published' | 'draft' | 'unpublished'

export type CanonicalOperationalStatus = 'ready' | 'pending' | 'critical'

export type CanonicalDriftIssueCode =
  | 'legacy-final-form-identity'
  | 'legacy-social-public-name'
  | 'legacy-catalog-surface'
  | 'legacy-services-surface'
  | 'office-name-missing'
  | 'legal-areas-missing'
  | 'served-cities-missing'
  | 'professionals-readiness-unknown'
  | 'responsible-professional-missing'
  | 'public-professional-missing'
  | 'professional-oab-missing'
  | 'professional-specialty-missing'
  | 'professional-trust-profile-missing'
  | 'triage-policies-missing'
  | 'public-messages-missing'
  | 'availability-sla-missing'

export type CanonicalDriftIssue = {
  code: CanonicalDriftIssueCode
  severity: 'high' | 'medium' | 'low'
  message: string
}

export type CanonicalOfficeDriftReport = {
  hasDrift: boolean
  issues: CanonicalDriftIssue[]
}

export type CanonicalOfficeProfileProjection = {
  officeId: string
  officeName: string
  institutionalDescription: string
  legalAreas: string[]
  servedCities: string[]
  team: Array<{
    id: string
    name: string
    role?: string
    oabCredential?: string
  }>
  publicMessages: {
    heroMessage?: string
    intakeMessage?: string
    availabilityMessage?: string
  }
  channels: {
    whatsapp?: string
    phone?: string
    email?: string
    address?: string
    website?: string
    other?: string
  }
  responsibleProfessional?: {
    photoUrl?: string
    fullName: string
    oabCredential?: string
    specialties: string[]
    yearsOfExperience?: number
    shortBio?: string
  }
  officeGallery: Array<{
    id: string
    url: string
    isCover?: boolean
  }>
  institutionalVideo?: {
    mode: 'external' | 'uploaded'
    provider?: 'youtube' | 'vimeo' | 'upload'
    url: string
    title?: string
    intro?: string
  }
}

export type CanonicalOfficeOperationalProjection = {
  status: CanonicalOperationalStatus
  operatingHours?: string
  maxCapacity?: number
  avgResponseMinutes?: number
  responseWindowLabel: string
  attendanceMode: 'sales' | 'support' | 'guidance' | 'mixed'
  intake: {
    intakeCriteria?: string
    priorityRules?: string
    disqualificationRules?: string
  }
  availabilityLabel: string
  availabilityDetails: string
  intakeExpectationLabel: string
}

export type CanonicalOfficePublicationProjection = {
  status: CanonicalPublicationStatus
  reason: string
}

export type CanonicalOfficeProjection = {
  profile: CanonicalOfficeProfileProjection
  operational: CanonicalOfficeOperationalProjection
  publication: CanonicalOfficePublicationProjection
  drift: CanonicalOfficeDriftReport
}

export type CanonicalBusinessContext = {
  businessType: 'legal'
  officeName: string
  description?: string
  legalAreas: string[]
  servedCities: string[]
  intake: {
    intakeCriteria?: string
    priorityRules?: string
  }
  availability: {
    responseWindowLabel: string
    operatingHours?: string
  }
  publicationStatus: CanonicalPublicationStatus
}

type LegacyProfileCandidate = {
  finalForm?: {
    identity?: {
      name?: string
    }
  }
  social?: {
    publicName?: string
  }
  catalog?: unknown
  services?: unknown
}

function normalizeText(value: string | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTextList(values: string[] | undefined) {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0)
}

function hydrateLegacyResponsibleIntoTeam(config?: OfficeBusinessConfig) {
  const baseTeam = [...(config?.team ?? [])]
  const canonicalResponsible = baseTeam.find((member) => member.isResponsible === true)
  const legacyResponsible = config?.responsibleProfessional

  if (canonicalResponsible || !legacyResponsible?.fullName?.trim()) {
    return baseTeam
  }

  return [
    {
      id: 'responsible-professional',
      name: legacyResponsible.fullName.trim(),
      role: 'Advogada responsável',
      oabCredential: normalizeText(legacyResponsible.oabCredential) || undefined,
      photoUrl: normalizeText(legacyResponsible.photoUrl) || undefined,
      specialties: normalizeTextList(legacyResponsible.specialties),
      yearsOfExperience: typeof legacyResponsible.yearsOfExperience === 'number' ? legacyResponsible.yearsOfExperience : undefined,
      shortBio: normalizeText(legacyResponsible.shortBio) || undefined,
      isResponsible: true,
      isPublic: true,
      status: 'active',
    },
    ...baseTeam,
  ]
}

function resolveResponsibleProfessional(config?: OfficeBusinessConfig) {
  const team = hydrateLegacyResponsibleIntoTeam(config)
  const responsible = team.find((member) => member.isResponsible === true)
  const fullName = normalizeText(responsible?.name)

  if (fullName.length === 0) {
    return undefined
  }

  return {
    photoUrl: normalizeText(responsible?.photoUrl) || undefined,
    fullName,
    oabCredential: normalizeText(responsible?.oabCredential) || undefined,
    specialties: normalizeTextList(responsible?.specialties).length > 0
      ? normalizeTextList(responsible?.specialties)
      : normalizeTextList(config?.legalAreas).slice(0, 3),
    yearsOfExperience: typeof responsible?.yearsOfExperience === 'number' ? responsible.yearsOfExperience : undefined,
    shortBio: normalizeText(responsible?.shortBio) || undefined,
  }
}

function countDefinedChannels(channels: CanonicalOfficeProfileProjection['channels']) {
  const entries = [
    channels.whatsapp,
    channels.phone,
    channels.email,
    channels.address,
    channels.website,
    channels.other,
  ]

  return entries.filter((entry) => normalizeText(entry).length > 0).length
}

function resolvePublicationStatus(
  profile: CanonicalOfficeProfileProjection,
  config: OfficeBusinessConfig | undefined,
  professionalReadiness: ProfessionalReadinessSnapshot | undefined,
): CanonicalOfficePublicationProjection {
  const requiredMessages = [
    profile.publicMessages.heroMessage,
    profile.publicMessages.intakeMessage,
    profile.publicMessages.availabilityMessage,
  ].filter((value) => normalizeText(value).length > 0).length
  const channelsCount = countDefinedChannels(profile.channels)
  const hasCoreIdentity = profile.officeName.length > 0 && profile.institutionalDescription.length > 0
  const hasOperationalContext = profile.legalAreas.length > 0 && profile.servedCities.length > 0
  const hasPublicationIntent = requiredMessages > 0 || channelsCount > 0 || hasOperationalContext
  const hasProfessionalBase = professionalReadiness?.isKnown === true
    && professionalReadiness.hasPublicProfessional
    && professionalReadiness.hasResponsibleProfessional
    && professionalReadiness.hasOabCredential
    && professionalReadiness.hasSpecialtyCoverage

  if (!hasPublicationIntent) {
    return {
      status: 'unpublished',
      reason: 'Nenhuma configuracao publica essencial foi definida.',
    }
  }

  const publicationReady = hasCoreIdentity
    && hasOperationalContext
    && requiredMessages === 3
    && channelsCount > 0
    && Boolean(config?.triagePolicies?.intakeCriteria)
    && hasProfessionalBase

  if (publicationReady) {
    return {
      status: 'published',
      reason: 'Perfil publico completo e consistente com a operacao juridica.',
    }
  }

  return {
    status: 'draft',
    reason: professionalReadiness?.isKnown === false
      ? 'Perfil publico iniciado, aguardando verificacao profissional para liberar publicacao.'
      : 'Perfil publico iniciado, ainda com lacunas operacionais ou editoriais.',
  }
}

function resolveOperationalStatus(
  config: OfficeBusinessConfig | undefined,
  professionalReadiness: ProfessionalReadinessSnapshot | undefined,
): CanonicalOperationalStatus {
  const hasIntake = Boolean(normalizeText(config?.triagePolicies?.intakeCriteria))
  const hasResponseWindow = Boolean(normalizeText(config?.serviceRules?.responseWindowLabel))
  const hasProfessionalBase = professionalReadiness?.isKnown === true && professionalReadiness.totalProfessionals > 0

  if (hasIntake && hasResponseWindow && hasProfessionalBase) {
    return 'ready'
  }

  if (hasIntake || hasResponseWindow || hasProfessionalBase) {
    return 'pending'
  }

  return 'critical'
}

function resolveAttendanceMode(value: OfficeBusinessConfig['serviceRules']): 'sales' | 'support' | 'guidance' | 'mixed' {
  if (value?.attendanceMode === 'sales' || value?.attendanceMode === 'support' || value?.attendanceMode === 'guidance' || value?.attendanceMode === 'mixed') {
    return value.attendanceMode
  }

  return 'guidance'
}

export function detectCanonicalOfficeDrift(args: {
  businessConfig?: OfficeBusinessConfig
  professionalReadinessSnapshot?: ProfessionalReadinessSnapshot
  legacyProfile?: LegacyProfileCandidate
  presenceName?: string
}): CanonicalOfficeDriftReport {
  const issues: CanonicalDriftIssue[] = []
  const config = args.businessConfig
  const legacy = args.legacyProfile
  const professionalReadiness = args.professionalReadinessSnapshot

  const officeName = normalizeText(config?.officeName)
  if (officeName.length === 0) {
    issues.push({
      code: 'office-name-missing',
      severity: 'high',
      message: 'Nome oficial do escritorio ausente no contrato canonic.',
    })
  }

  if ((config?.legalAreas?.length ?? 0) === 0) {
    issues.push({
      code: 'legal-areas-missing',
      severity: 'medium',
      message: 'Areas juridicas nao foram definidas de forma canonica.',
    })
  }

  if ((config?.servedCities?.length ?? 0) === 0) {
    issues.push({
      code: 'served-cities-missing',
      severity: 'medium',
      message: 'Cobertura de cidades nao foi definida de forma canonica.',
    })
  }

  if (professionalReadiness?.isKnown !== true) {
    issues.push({
      code: 'professionals-readiness-unknown',
      severity: 'medium',
      message: 'Leitura canonica de profissionais ainda nao foi confirmada para esta operacao.',
    })
  } else {
    if (!professionalReadiness.hasResponsibleProfessional) {
      issues.push({
        code: 'responsible-professional-missing',
        severity: 'medium',
        message: 'Nenhum profissional responsavel foi definido na projecao canonica.',
      })
    }
    if (!professionalReadiness.hasPublicProfessional) {
      issues.push({
        code: 'public-professional-missing',
        severity: 'medium',
        message: 'Nenhum profissional publico foi definido na projecao canonica.',
      })
    }
    if (!professionalReadiness.hasOabCredential) {
      issues.push({
        code: 'professional-oab-missing',
        severity: 'low',
        message: 'Ainda faltam credenciais OAB na projecao canonica de profissionais.',
      })
    }
    if (!professionalReadiness.hasSpecialtyCoverage) {
      issues.push({
        code: 'professional-specialty-missing',
        severity: 'low',
        message: 'As especialidades profissionais ainda nao foram consolidadas na projecao canonica.',
      })
    }
    if (!professionalReadiness.hasHumanTrustProfile) {
      issues.push({
        code: 'professional-trust-profile-missing',
        severity: 'low',
        message: 'O perfil humano responsavel ainda precisa de foto ou bio para reforcar confianca.',
      })
    }
  }

  const hasIntakePolicies = Boolean(
    normalizeText(config?.triagePolicies?.intakeCriteria)
    || normalizeText(config?.triagePolicies?.priorityRules)
    || normalizeText(config?.triagePolicies?.disqualificationRules),
  )
  if (!hasIntakePolicies) {
    issues.push({
      code: 'triage-policies-missing',
      severity: 'medium',
      message: 'Politicas de triagem nao foram consolidadas no contrato canonico.',
    })
  }

  const hasPublicMessages = Boolean(
    normalizeText(config?.publicMessages?.heroMessage)
    || normalizeText(config?.publicMessages?.intakeMessage)
    || normalizeText(config?.publicMessages?.availabilityMessage),
  )
  if (!hasPublicMessages) {
    issues.push({
      code: 'public-messages-missing',
      severity: 'medium',
      message: 'Mensagens publicas nao foram definidas no contrato canonico.',
    })
  }

  const hasAvailability = Boolean(
    normalizeText(config?.serviceRules?.responseWindowLabel)
    || normalizeText(config?.operatingHours)
    || typeof config?.avgResponseMinutes === 'number',
  )
  if (!hasAvailability) {
    issues.push({
      code: 'availability-sla-missing',
      severity: 'medium',
      message: 'Disponibilidade e SLA nao estao completos no contrato canonico.',
    })
  }

  if (normalizeText(legacy?.finalForm?.identity?.name).length > 0) {
    issues.push({
      code: 'legacy-final-form-identity',
      severity: 'high',
      message: 'Nome legado em finalForm.identity ainda presente na superficie.',
    })
  }

  if (normalizeText(legacy?.social?.publicName).length > 0) {
    issues.push({
      code: 'legacy-social-public-name',
      severity: 'high',
      message: 'Nome legado em social.publicName ainda presente na superficie.',
    })
  }

  if (legacy?.catalog) {
    issues.push({
      code: 'legacy-catalog-surface',
      severity: 'high',
      message: 'Catalogo legado detectado na leitura de perfil publico.',
    })
  }

  if (legacy?.services) {
    issues.push({
      code: 'legacy-services-surface',
      severity: 'high',
      message: 'Lista de servicos legada detectada na leitura de perfil publico.',
    })
  }

  if (officeName.length > 0 && normalizeText(args.presenceName).length > 0 && normalizeText(args.presenceName) !== officeName) {
    issues.push({
      code: 'office-name-missing',
      severity: 'low',
      message: 'Nome publico diverge do nome oficial canonicamente configurado.',
    })
  }

  return {
    hasDrift: issues.length > 0,
    issues,
  }
}

export function projectCanonicalOfficeData(args: {
  officeId: string
  businessConfig?: OfficeBusinessConfig
  professionalReadinessSnapshot?: ProfessionalReadinessSnapshot
  operationalStatusHint?: string
  legacyProfile?: LegacyProfileCandidate
  presenceName?: string
}): CanonicalOfficeProjection {
  const config = args.businessConfig
  const hydratedTeam = hydrateLegacyResponsibleIntoTeam(config)

  const profile: CanonicalOfficeProfileProjection = {
    officeId: args.officeId,
    officeName: normalizeText(config?.officeName) || args.officeId,
    institutionalDescription: normalizeText(config?.institutionalDescription) || normalizeText(config?.description),
    legalAreas: normalizeTextList(config?.legalAreas),
    servedCities: normalizeTextList(config?.servedCities),
    team: hydratedTeam.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      oabCredential: member.oabCredential,
    })),
    publicMessages: {
      heroMessage: normalizeText(config?.publicMessages?.heroMessage) || undefined,
      intakeMessage: normalizeText(config?.publicMessages?.intakeMessage) || undefined,
      availabilityMessage: normalizeText(config?.publicMessages?.availabilityMessage) || undefined,
    },
    channels: {
      whatsapp: normalizeText(config?.channels?.whatsapp) || undefined,
      phone: normalizeText(config?.channels?.phone) || undefined,
      email: normalizeText(config?.channels?.email) || undefined,
      address: normalizeText(config?.channels?.address) || undefined,
      website: normalizeText(config?.channels?.website) || undefined,
      other: normalizeText(config?.channels?.other) || undefined,
    },
    responsibleProfessional: resolveResponsibleProfessional(config),
    officeGallery: (config?.officeGallery ?? []).map((item, index) => ({
      id: item.id,
      url: item.url,
      isCover: item.isCover === true || (index === 0 && !(config?.officeGallery ?? []).some((candidate) => candidate.isCover === true))
        ? true
        : undefined,
    })),
    institutionalVideo: config?.institutionalVideo && normalizeText(config.institutionalVideo.url).length > 0
      ? {
        mode: config.institutionalVideo.mode,
        provider: config.institutionalVideo.provider,
        url: config.institutionalVideo.url,
        title: normalizeText(config.institutionalVideo.title) || undefined,
        intro: normalizeText(config.institutionalVideo.intro) || undefined,
      }
      : undefined,
  }

  const responseWindowLabel = normalizeText(config?.serviceRules?.responseWindowLabel)
  const operatingHours = normalizeText(config?.operatingHours)
  const availabilityDetails = responseWindowLabel
    || (operatingHours.length > 0 ? `Atendimento em ${operatingHours}.` : 'Janela operacional nao informada.')

  const operational: CanonicalOfficeOperationalProjection = {
    status: resolveOperationalStatus(config, args.professionalReadinessSnapshot),
    operatingHours: operatingHours || undefined,
    maxCapacity: typeof config?.maxCapacity === 'number' ? config.maxCapacity : undefined,
    avgResponseMinutes: typeof config?.avgResponseMinutes === 'number' ? config.avgResponseMinutes : undefined,
    responseWindowLabel: responseWindowLabel || 'Retorno inicial em ate 4 horas no horario comercial.',
    attendanceMode: resolveAttendanceMode(config?.serviceRules),
    intake: {
      intakeCriteria: normalizeText(config?.triagePolicies?.intakeCriteria) || undefined,
      priorityRules: normalizeText(config?.triagePolicies?.priorityRules) || undefined,
      disqualificationRules: normalizeText(config?.triagePolicies?.disqualificationRules) || undefined,
    },
    availabilityLabel:
      responseWindowLabel.length > 0 || operatingHours.length > 0
        ? 'Disponibilidade confirmada'
        : 'Disponibilidade estimada',
    availabilityDetails,
    intakeExpectationLabel: responseWindowLabel || 'Retorno inicial em ate 4 horas no horario comercial.',
  }

  if (args.operationalStatusHint && ['failed', 'error', 'rejected'].includes(args.operationalStatusHint.trim().toLowerCase())) {
    operational.status = 'critical'
  }

  const publication = resolvePublicationStatus(profile, config, args.professionalReadinessSnapshot)
  const drift = detectCanonicalOfficeDrift({
    businessConfig: config,
    professionalReadinessSnapshot: args.professionalReadinessSnapshot,
    legacyProfile: args.legacyProfile,
    presenceName: args.presenceName,
  })

  return {
    profile,
    operational,
    publication,
    drift,
  }
}

export function buildCanonicalInteractionBusinessContext(projection: CanonicalOfficeProjection): CanonicalBusinessContext {
  return {
    businessType: 'legal',
    officeName: projection.profile.officeName,
    description: projection.profile.institutionalDescription || undefined,
    legalAreas: projection.profile.legalAreas,
    servedCities: projection.profile.servedCities,
    intake: {
      intakeCriteria: projection.operational.intake.intakeCriteria,
      priorityRules: projection.operational.intake.priorityRules,
    },
    availability: {
      responseWindowLabel: projection.operational.responseWindowLabel,
      operatingHours: projection.operational.operatingHours,
    },
    publicationStatus: projection.publication.status,
  }
}
