import { readOnboardingFlowState, registerOnboardingFirstSuccess, writeOnboardingFlowState } from './onboardingContinuity'
import { buildProfessionalReadinessSnapshot } from './professionalReadiness'

const ONBOARDING_DRAFT_KEY = 'brandsoul:onboarding:office-wizard:draft'

type InstitutionalOnboardingChecklist = {
  legalAreas: boolean
  coverage: boolean
  team: boolean
  oab: boolean
  availability: boolean
  intake: boolean
  publicMessages: boolean
  publicationChannels: boolean
}

export type InstitutionalOnboardingDraft = {
  currentStep: number
  activationMode?: 'complete' | 'fast-track'
  account: {
    responsibleName: string
    institutionalEmail: string
    tenantName: string
  }
  office: {
    officeName: string
    institutionalDescription: string
  }
  coverage: {
    legalAreasCsv: string
    servedCitiesCsv: string
  }
  team: {
    teamRoster: string
    professionals: InstitutionalOnboardingProfessionalDraft[]
  }
  operations: {
    attendanceModel: 'online' | 'in_person' | 'hybrid'
    operatingHours: string
    maxCapacity: string
    avgResponseMinutes: string
    responseWindowLabel: string
  }
  intake: {
    intakeCriteria: string
    priorityRules: string
    disqualificationRules: string
  }
  publication: {
    heroMessage: string
    intakeMessage: string
    availabilityMessage: string
    whatsapp: string
    phone: string
    email: string
    address: string
    website: string
  }
  publicationStatus: 'draft' | 'ready' | 'published'
  fastTrack: {
    enabled: boolean
    mainSpecialty: string
    mainCity: string
    contactChannel: string
    basicAvailability: string
    startedAt?: string
    completedAt?: string
    activationDurationSeconds?: number
  }
  compliance: {
    institutionalCommitment: boolean
    legalAccuracy: boolean
    dataGovernance: boolean
    publicationAuthority: boolean
  }
  officeId?: string
  publishedAt?: string
  updatedAt: string
}

export type InstitutionalOnboardingProfessionalDraft = {
  id: string
  displayName: string
  oabCredential: string
  specialtiesCsv: string
  email: string
  phone: string
  photoUrl: string
  bio: string
  isResponsible: boolean
  isPublic: boolean
}

export type InstitutionalOnboardingReadiness = {
  progressPercent: number
  status: 'draft' | 'ready' | 'published'
  checklist: InstitutionalOnboardingChecklist
  missingItems: string[]
}

function isBrowser() {
  return typeof window !== 'undefined'
}

export function createDefaultInstitutionalOnboardingProfessionalDraft(
  input: Partial<InstitutionalOnboardingProfessionalDraft> = {},
): InstitutionalOnboardingProfessionalDraft {
  return {
    id: input.id ?? `draft-professional-${Math.random().toString(36).slice(2, 10)}`,
    displayName: input.displayName ?? '',
    oabCredential: input.oabCredential ?? '',
    specialtiesCsv: input.specialtiesCsv ?? '',
    email: input.email ?? '',
    phone: input.phone ?? '',
    photoUrl: input.photoUrl ?? '',
    bio: input.bio ?? '',
    isResponsible: input.isResponsible ?? true,
    isPublic: input.isPublic ?? true,
  }
}

function parseLegacyTeamRoster(teamRoster: string): InstitutionalOnboardingProfessionalDraft[] {
  const rows = teamRoster
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0)

  return rows.map((row, index) => {
    const [displayName, roleOrVisibility, oabCredential, specialtiesCsv] = row.split('|').map((part) => part.trim())
    return createDefaultInstitutionalOnboardingProfessionalDraft({
      id: `legacy-professional-${index + 1}`,
      displayName,
      oabCredential: oabCredential ?? '',
      specialtiesCsv: specialtiesCsv ?? '',
      isResponsible: /responsavel|responsável/i.test(roleOrVisibility ?? '') || index === 0,
      isPublic: true,
    })
  }).filter((professional) => professional.displayName.trim().length > 0)
}

function serializeProfessionalsToTeamRoster(professionals: InstitutionalOnboardingProfessionalDraft[]) {
  return professionals
    .filter((professional) => professional.displayName.trim().length > 0)
    .map((professional) => [
      professional.displayName.trim(),
      professional.isResponsible ? 'Responsável visível' : '',
      professional.oabCredential.trim(),
      professional.specialtiesCsv.trim(),
    ].join(' | ').trim())
    .join('\n')
}

export function createDefaultInstitutionalOnboardingDraft(): InstitutionalOnboardingDraft {
  return {
    currentStep: 0,
    activationMode: 'complete',
    account: {
      responsibleName: '',
      institutionalEmail: '',
      tenantName: '',
    },
    office: {
      officeName: '',
      institutionalDescription: '',
    },
    coverage: {
      legalAreasCsv: '',
      servedCitiesCsv: '',
    },
    team: {
      teamRoster: '',
      professionals: [createDefaultInstitutionalOnboardingProfessionalDraft()],
    },
    operations: {
      attendanceModel: 'hybrid',
      operatingHours: '',
      maxCapacity: '',
      avgResponseMinutes: '',
      responseWindowLabel: '',
    },
    intake: {
      intakeCriteria: '',
      priorityRules: '',
      disqualificationRules: '',
    },
    publication: {
      heroMessage: '',
      intakeMessage: '',
      availabilityMessage: '',
      whatsapp: '',
      phone: '',
      email: '',
      address: '',
      website: '',
    },
    publicationStatus: 'draft',
    fastTrack: {
      enabled: false,
      mainSpecialty: '',
      mainCity: '',
      contactChannel: '',
      basicAvailability: '',
    },
    compliance: {
      institutionalCommitment: false,
      legalAccuracy: false,
      dataGovernance: false,
      publicationAuthority: false,
    },
    updatedAt: new Date().toISOString(),
  }
}

function sanitizeDraft(input: InstitutionalOnboardingDraft): InstitutionalOnboardingDraft {
  const normalizedProfessionals = Array.isArray(input.team?.professionals) && input.team.professionals.length > 0
    ? input.team.professionals.map((professional, index) => createDefaultInstitutionalOnboardingProfessionalDraft({
      ...professional,
      id: professional.id || `draft-professional-${index + 1}`,
    }))
    : parseLegacyTeamRoster(input.team?.teamRoster ?? '')

  const professionals = normalizedProfessionals.length > 0
    ? normalizedProfessionals
    : [createDefaultInstitutionalOnboardingProfessionalDraft()]

  return {
    ...input,
    currentStep: Math.max(0, Math.min(7, Math.floor(input.currentStep))),
    activationMode: input.activationMode === 'fast-track' ? 'fast-track' : 'complete',
    team: {
      ...input.team,
      professionals,
      teamRoster: serializeProfessionalsToTeamRoster(professionals),
    },
    updatedAt: new Date().toISOString(),
  }
}

export function readInstitutionalOnboardingDraft(): InstitutionalOnboardingDraft {
  if (!isBrowser()) {
    return createDefaultInstitutionalOnboardingDraft()
  }

  const raw = window.localStorage.getItem(ONBOARDING_DRAFT_KEY)
  if (!raw) {
    return createDefaultInstitutionalOnboardingDraft()
  }

  try {
    const parsed = JSON.parse(raw) as Partial<InstitutionalOnboardingDraft>
    const fallback = createDefaultInstitutionalOnboardingDraft()

    return sanitizeDraft({
      ...fallback,
      ...parsed,
      account: {
        ...fallback.account,
        ...(parsed.account ?? {}),
      },
      office: {
        ...fallback.office,
        ...(parsed.office ?? {}),
      },
      coverage: {
        ...fallback.coverage,
        ...(parsed.coverage ?? {}),
      },
      team: {
        ...fallback.team,
        ...(parsed.team ?? {}),
      },
      operations: {
        ...fallback.operations,
        ...(parsed.operations ?? {}),
      },
      intake: {
        ...fallback.intake,
        ...(parsed.intake ?? {}),
      },
      publication: {
        ...fallback.publication,
        ...(parsed.publication ?? {}),
      },
      fastTrack: {
        ...fallback.fastTrack,
        ...(parsed.fastTrack ?? {}),
      },
      compliance: {
        ...fallback.compliance,
        ...(parsed.compliance ?? {}),
      },
    })
  } catch {
    return createDefaultInstitutionalOnboardingDraft()
  }
}

export function writeInstitutionalOnboardingDraft(nextDraft: InstitutionalOnboardingDraft) {
  if (!isBrowser()) {
    return
  }

  const normalized = sanitizeDraft(nextDraft)
  window.localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(normalized))

  const flowState = readOnboardingFlowState('office-setup')
  const nextCompleted = Array.from(new Set([
    ...flowState.completedSteps,
    ...Array.from({ length: normalized.currentStep }, (_, index) => `institutional-step-${index + 1}`),
  ]))
  writeOnboardingFlowState('office-setup', {
    ...flowState,
    currentStep: Math.max(flowState.currentStep, normalized.currentStep),
    completedSteps: nextCompleted,
    dismissed: false,
  })
}

export function clearInstitutionalOnboardingDraft() {
  if (!isBrowser()) {
    return
  }

  window.localStorage.removeItem(ONBOARDING_DRAFT_KEY)
}

export function seedInstitutionalOnboardingAccount(input: {
  responsibleName?: string
  institutionalEmail?: string
  tenantName?: string
}) {
  const current = readInstitutionalOnboardingDraft()

  writeInstitutionalOnboardingDraft({
    ...current,
    account: {
      responsibleName: input.responsibleName?.trim() || current.account.responsibleName,
      institutionalEmail: input.institutionalEmail?.trim() || current.account.institutionalEmail,
      tenantName: input.tenantName?.trim() || current.account.tenantName,
    },
  })
}

export function computeInstitutionalOnboardingReadiness(draft: InstitutionalOnboardingDraft): InstitutionalOnboardingReadiness {
  const hasLegalAreas = draft.coverage.legalAreasCsv.split(',').map((item) => item.trim()).filter(Boolean).length > 0
  const hasCoverage = draft.coverage.servedCitiesCsv.split(',').map((item) => item.trim()).filter(Boolean).length > 0
  const professionalReadiness = buildProfessionalReadinessSnapshot(
    draft.team.professionals
      .filter((professional) => professional.displayName.trim().length > 0)
      .map((professional) => ({
        displayName: professional.displayName,
        oabCredential: professional.oabCredential,
        specialties: professional.specialtiesCsv.split(',').map((item) => item.trim()).filter(Boolean),
        photoUrl: professional.photoUrl,
        bio: professional.bio,
        isResponsible: professional.isResponsible,
        isPublic: professional.isPublic,
        status: 'active' as const,
      })),
  )
  const hasTeam = professionalReadiness.totalProfessionals > 0
  const hasOab = hasTeam && professionalReadiness.hasOabCredential
  const hasAvailability = Boolean(draft.operations.responseWindowLabel.trim() || draft.operations.operatingHours.trim())
  const hasIntake = Boolean(draft.intake.intakeCriteria.trim())
  const hasPublicMessages = Boolean(
    draft.publication.heroMessage.trim()
    && draft.publication.intakeMessage.trim()
    && draft.publication.availabilityMessage.trim(),
  )
  const hasPublicationChannels = Boolean(
    draft.publication.whatsapp.trim()
    || draft.publication.phone.trim()
    || draft.publication.email.trim()
    || draft.publication.address.trim()
    || draft.publication.website.trim(),
  )

  const checklist: InstitutionalOnboardingChecklist = {
    legalAreas: hasLegalAreas,
    coverage: hasCoverage,
    team: hasTeam,
    oab: hasOab,
    availability: hasAvailability,
    intake: hasIntake,
    publicMessages: hasPublicMessages,
    publicationChannels: hasPublicationChannels,
  }

  const messages: Array<[keyof InstitutionalOnboardingChecklist, string]> = [
    ['legalAreas', 'Definir areas juridicas'],
    ['coverage', 'Definir cobertura e cidades'],
    ['team', 'Cadastrar equipe institucional'],
    ['oab', 'Informar OAB de cada profissional'],
    ['availability', 'Configurar disponibilidade e SLA'],
    ['intake', 'Definir politica de intake'],
    ['publicMessages', 'Concluir mensagens publicas'],
    ['publicationChannels', 'Definir canais de publicacao'],
  ]

  const missingItems = messages
    .filter(([key]) => !checklist[key])
    .map(([, label]) => label)

  const checksTotal = Object.keys(checklist).length
  const checksDone = Object.values(checklist).filter(Boolean).length
  const progressPercent = Math.round((checksDone / checksTotal) * 100)

  const status: InstitutionalOnboardingReadiness['status'] = draft.publicationStatus === 'published'
    ? 'published'
    : missingItems.length === 0
      ? 'ready'
      : 'draft'

  return {
    progressPercent,
    status,
    checklist,
    missingItems,
  }
}

export function hasInstitutionalOnboardingContinuationPending() {
  const draft = readInstitutionalOnboardingDraft()
  return draft.publicationStatus !== 'published'
    && (
      draft.office.officeName.trim().length > 0
      || draft.account.institutionalEmail.trim().length > 0
      || draft.currentStep > 0
    )
}

export function markInstitutionalOnboardingPublished(input: { officeId: string }) {
  const draft = readInstitutionalOnboardingDraft()
  const publishedDraft: InstitutionalOnboardingDraft = {
    ...draft,
    officeId: input.officeId,
    publicationStatus: 'published',
    publishedAt: new Date().toISOString(),
  }

  writeInstitutionalOnboardingDraft(publishedDraft)
  registerOnboardingFirstSuccess('office-setup')
  const flowState = readOnboardingFlowState('office-setup')
  writeOnboardingFlowState('office-setup', {
    ...flowState,
    currentStep: 8,
    completedSteps: Array.from(new Set([
      ...flowState.completedSteps,
      ...Array.from({ length: 8 }, (_, index) => `institutional-step-${index + 1}`),
    ])),
    dismissed: false,
  })
}
