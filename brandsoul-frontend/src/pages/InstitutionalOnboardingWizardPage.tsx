import { useMemo, useState } from 'react'

import { LEGAL_ROUTES } from '../app/routes/legalRoutes'
import {
  createAdminOffice,
  createOfficeProfessional,
  listOfficeProfessionals,
  saveOfficeBusinessConfig,
  updateOfficeProfessional,
  type OfficeBusinessConfig,
  type OfficeProfessionalPayload,
} from '../backend-bridge/api/adminApi'
import OperationalFeedbackPanel from '../components/OperationalFeedbackPanel'
import {
  clearInstitutionalOnboardingDraft,
  createDefaultInstitutionalOnboardingProfessionalDraft,
  computeInstitutionalOnboardingReadiness,
  markInstitutionalOnboardingPublished,
  readInstitutionalOnboardingDraft,
  writeInstitutionalOnboardingDraft,
  type InstitutionalOnboardingDraft,
  type InstitutionalOnboardingProfessionalDraft,
} from '../lib/institutionalOnboarding'
import { buildOperationalFeedbackSnapshot } from '../lib/operationalFeedbackEngine'
import { buildProfessionalReadinessSnapshot } from '../lib/professionalReadiness'
import { consumeAuthContinuationReturnTo } from '../lib/authContinuation'
import { navigateTo } from '../lib/navigation'
import { useAuthSession } from '../lib/session'
import '../styles/institutionalOnboardingWizard.css'

type WizardStep = {
  id: number
  title: string
  subtitle: string
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 1, title: 'Conta institucional', subtitle: 'Responsável, email e organização.' },
  { id: 2, title: 'Dados do escritório', subtitle: 'Nome oficial e descrição institucional.' },
  { id: 3, title: 'Áreas e cobertura', subtitle: 'Especialidades jurídicas e cidades atendidas.' },
  { id: 4, title: 'Equipe e OAB', subtitle: 'Profissionais, papéis e credenciais OAB.' },
  { id: 5, title: 'Disponibilidade e SLA', subtitle: 'Janelas operacionais e compromisso de resposta.' },
  { id: 6, title: 'Intake e políticas', subtitle: 'Critérios de triagem e regras de prioridade.' },
  { id: 7, title: 'Revisão', subtitle: 'Conferência final do que já está pronto para ir ao ar.' },
  { id: 8, title: 'Publicação', subtitle: 'Preparação final do perfil público do escritório.' },
]

function splitCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseOptionalPositiveInt(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  const parsed = Number.parseInt(normalized, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function splitSpecialtiesCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function buildProfessionalPayloadsFromDraft(draft: InstitutionalOnboardingDraft): OfficeProfessionalPayload[] {
  return draft.team.professionals
    .map((professional) => ({
      displayName: professional.displayName.trim(),
      oabCredential: professional.oabCredential.trim() || undefined,
      specialties: splitSpecialtiesCsv(professional.specialtiesCsv),
      email: professional.email.trim() || undefined,
      phone: professional.phone.trim() || undefined,
      photoUrl: professional.photoUrl.trim() || undefined,
      bio: professional.bio.trim() || undefined,
      isResponsible: professional.isResponsible,
      isPublic: professional.isPublic,
      status: 'active' as const,
    }))
    .filter((professional) => professional.displayName.length > 0)
}

function buildBusinessConfigFromDraft(draft: InstitutionalOnboardingDraft): OfficeBusinessConfig {
  return {
    businessType: 'legal',
    officeName: draft.office.officeName.trim() || undefined,
    institutionalDescription: draft.office.institutionalDescription.trim() || undefined,
    legalAreas: splitCsv(draft.coverage.legalAreasCsv),
    servedCities: splitCsv(draft.coverage.servedCitiesCsv),
    attendanceModel: draft.operations.attendanceModel,
    operatingHours: draft.operations.operatingHours.trim() || undefined,
    maxCapacity: parseOptionalPositiveInt(draft.operations.maxCapacity),
    avgResponseMinutes: parseOptionalPositiveInt(draft.operations.avgResponseMinutes),
    channels: {
      whatsapp: draft.publication.whatsapp.trim() || undefined,
      phone: draft.publication.phone.trim() || undefined,
      email: draft.publication.email.trim() || undefined,
      address: draft.publication.address.trim() || undefined,
      website: draft.publication.website.trim() || undefined,
    },
    publicMessages: {
      heroMessage: draft.publication.heroMessage.trim() || undefined,
      intakeMessage: draft.publication.intakeMessage.trim() || undefined,
      availabilityMessage: draft.publication.availabilityMessage.trim() || undefined,
    },
    triagePolicies: {
      intakeCriteria: draft.intake.intakeCriteria.trim() || undefined,
      priorityRules: draft.intake.priorityRules.trim() || undefined,
      disqualificationRules: draft.intake.disqualificationRules.trim() || undefined,
    },
    serviceRules: {
      attendanceMode: 'guidance',
      responseWindowLabel: draft.operations.responseWindowLabel.trim() || undefined,
    },
  }
}

function buildBusinessConfigFromFastTrack(draft: InstitutionalOnboardingDraft): OfficeBusinessConfig {
  const officeName = draft.office.officeName.trim()
  const specialty = draft.fastTrack.mainSpecialty.trim()
  const mainCity = draft.fastTrack.mainCity.trim()
  const contactChannel = draft.fastTrack.contactChannel.trim()
  const basicAvailability = draft.fastTrack.basicAvailability.trim()

  return {
    businessType: 'legal',
    officeName: officeName || undefined,
    institutionalDescription: draft.office.institutionalDescription.trim() || `Ativação operacional mínima de ${officeName || 'escritório jurídico'}.`,
    legalAreas: specialty ? [specialty] : [],
    servedCities: mainCity ? [mainCity] : [],
    attendanceModel: draft.operations.attendanceModel,
    operatingHours: basicAvailability || undefined,
    channels: {
      other: contactChannel || undefined,
    },
    publicMessages: {
      heroMessage: `Atendimento jurídico em ${mainCity || 'sua cidade'} com foco em ${specialty || 'atuação jurídica geral'}.`,
      intakeMessage: 'Contato inicial direto com o escritório para triagem.',
      availabilityMessage: basicAvailability || 'Disponibilidade básica informada no onboarding rápido.',
    },
    triagePolicies: {
      intakeCriteria: 'Triagem inicial por contato direto no canal principal informado.',
    },
    serviceRules: {
      attendanceMode: 'guidance',
      responseWindowLabel: basicAvailability || 'Retorno inicial em janela operacional básica.',
    },
  }
}

function renderChecklistItem(label: string, checked: boolean) {
  return (
    <li className={checked ? 'is-done' : 'is-missing'}>
      <strong>{checked ? 'Em ordem' : 'Falta concluir'}</strong>
      <span>{label}</span>
    </li>
  )
}

function findMatchingProfessionalId(
  payload: OfficeProfessionalPayload,
  existingProfessionals: Array<{ id: string; displayName: string; oabCredential?: string }>,
) {
  const normalizedName = payload.displayName.trim().toLowerCase()
  const normalizedOab = payload.oabCredential?.trim().toLowerCase() ?? ''

  return existingProfessionals.find((professional) => {
    const sameName = professional.displayName.trim().toLowerCase() === normalizedName
    const sameOab = (professional.oabCredential?.trim().toLowerCase() ?? '') === normalizedOab
    return sameName && (!normalizedOab || sameOab)
  })?.id
}

async function upsertOfficeProfessionalsFromDraft(officeId: string, draft: InstitutionalOnboardingDraft) {
  const professionalPayloads = buildProfessionalPayloadsFromDraft(draft)
  if (professionalPayloads.length === 0) {
    return
  }

  const existingProfessionals = (await listOfficeProfessionals(officeId)).professionals
  for (const payload of professionalPayloads) {
    const existingId = findMatchingProfessionalId(payload, existingProfessionals)
    if (existingId) {
      await updateOfficeProfessional(officeId, existingId, payload)
      continue
    }

    await createOfficeProfessional(officeId, payload)
  }
}

async function ensureFastTrackProfessional(officeId: string, draft: InstitutionalOnboardingDraft) {
  const displayName = draft.account.responsibleName.trim()
  if (!displayName) {
    return
  }

  const payload: OfficeProfessionalPayload = {
    displayName,
    email: draft.account.institutionalEmail.trim() || undefined,
    specialties: splitSpecialtiesCsv(draft.fastTrack.mainSpecialty),
    isResponsible: true,
    isPublic: true,
    status: 'active',
  }

  const existingProfessionals = (await listOfficeProfessionals(officeId)).professionals
  const existingId = findMatchingProfessionalId(payload, existingProfessionals)
  if (existingId) {
    await updateOfficeProfessional(officeId, existingId, payload)
    return
  }

  await createOfficeProfessional(officeId, payload)
}

export default function InstitutionalOnboardingWizardPage() {
  const authSession = useAuthSession()
  const [draft, setDraft] = useState<InstitutionalOnboardingDraft>(() => {
    const loaded = readInstitutionalOnboardingDraft()

    if (authSession?.user || authSession?.tenant) {
      return {
        ...loaded,
        account: {
          responsibleName: loaded.account.responsibleName || authSession.user.name || '',
          institutionalEmail: loaded.account.institutionalEmail || authSession.user.email || '',
          tenantName: loaded.account.tenantName || authSession.tenant.name || '',
        },
      }
    }

    return loaded
  })
  const [isPublishing, setIsPublishing] = useState(false)
  const [isFastTrackPublishing, setIsFastTrackPublishing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [onboardingMode, setOnboardingMode] = useState<'complete' | 'fast-track'>(() => (
    draft.activationMode === 'fast-track' || draft.fastTrack.enabled ? 'fast-track' : 'complete'
  ))  

  const readiness = useMemo(() => computeInstitutionalOnboardingReadiness(draft), [draft])
  const professionalReadiness = useMemo(
    () => buildProfessionalReadinessSnapshot(
      draft.team.professionals
        .filter((professional) => professional.displayName.trim().length > 0)
        .map((professional) => ({
          displayName: professional.displayName,
          oabCredential: professional.oabCredential,
          specialties: splitSpecialtiesCsv(professional.specialtiesCsv),
          email: professional.email,
          phone: professional.phone,
          photoUrl: professional.photoUrl,
          bio: professional.bio,
          isResponsible: professional.isResponsible,
          isPublic: professional.isPublic,
          status: 'active' as const,
        })),
    ),
    [draft.team.professionals],
  )
  const operationalFeedback = useMemo(() => buildOperationalFeedbackSnapshot({
    maxCapacity: draft.operations.maxCapacity,
    avgResponseMinutes: draft.operations.avgResponseMinutes,
    responseWindowLabel: draft.operations.responseWindowLabel,
    servedCities: draft.coverage.servedCitiesCsv || draft.fastTrack.mainCity,
    legalAreas: draft.coverage.legalAreasCsv || draft.fastTrack.mainSpecialty,
    priorityRules: draft.intake.priorityRules,
    intakeCriteria: draft.intake.intakeCriteria,
    professionalReadiness,
    heroMessage: draft.publication.heroMessage,
    intakeMessage: draft.publication.intakeMessage,
    availabilityMessage: draft.publication.availabilityMessage || draft.fastTrack.basicAvailability,
    channels: [
      draft.publication.whatsapp,
      draft.publication.phone,
      draft.publication.email,
      draft.publication.website,
      draft.publication.address,
      draft.fastTrack.contactChannel,
    ],
  }), [draft, professionalReadiness])
  const currentStep = WIZARD_STEPS[draft.currentStep] ?? WIZARD_STEPS[0]

  function persist(nextDraft: InstitutionalOnboardingDraft) {
    setDraft(nextDraft)
    writeInstitutionalOnboardingDraft(nextDraft)
  }

  function updateDraft<K extends keyof InstitutionalOnboardingDraft>(section: K, value: InstitutionalOnboardingDraft[K]) {
    persist({
      ...draft,
      [section]: value,
    })
  }

  function updateOnboardingProfessional(
    professionalId: string,
    field: keyof InstitutionalOnboardingProfessionalDraft,
    value: string | boolean,
  ) {
    updateDraft('team', {
      ...draft.team,
      professionals: draft.team.professionals.map((professional) => (
        professional.id === professionalId
          ? { ...professional, [field]: value }
          : professional
      )),
    })
  }

  function addOnboardingProfessional() {
    updateDraft('team', {
      ...draft.team,
      professionals: [
        ...draft.team.professionals,
        createDefaultInstitutionalOnboardingProfessionalDraft({
          isResponsible: false,
          isPublic: true,
        }),
      ],
    })
  }

  function removeOnboardingProfessional(professionalId: string) {
    const remainingProfessionals = draft.team.professionals.filter((professional) => professional.id !== professionalId)
    updateDraft('team', {
      ...draft.team,
      professionals: remainingProfessionals.length > 0
        ? remainingProfessionals
        : [createDefaultInstitutionalOnboardingProfessionalDraft()],
    })
  }

  function goToStep(stepIndex: number) {
    if (stepIndex < 0 || stepIndex >= WIZARD_STEPS.length) {
      return
    }

    persist({
      ...draft,
      currentStep: stepIndex,
    })
  }

  function setActivationMode(nextMode: 'complete' | 'fast-track') {
    setOnboardingMode(nextMode)
    const nextFastTrackStartedAt = nextMode === 'fast-track'
      ? (draft.fastTrack.startedAt ?? new Date().toISOString())
      : draft.fastTrack.startedAt

    persist({
      ...draft,
      activationMode: nextMode,
      fastTrack: {
        ...draft.fastTrack,
        enabled: nextMode === 'fast-track',
        startedAt: nextFastTrackStartedAt,
      },
    })
  }

  async function publishFastTrack() {
    if (!authSession?.token) {
      setErrorMessage('Entre com a conta do escritório para concluir a ativação rápida.')
      return
    }

    const officeName = draft.office.officeName.trim()
    const specialty = draft.fastTrack.mainSpecialty.trim()
    const mainCity = draft.fastTrack.mainCity.trim()
    const contactChannel = draft.fastTrack.contactChannel.trim()
    const basicAvailability = draft.fastTrack.basicAvailability.trim()

    if (!officeName || !specialty || !mainCity || !contactChannel || !basicAvailability) {
      setErrorMessage('Preencha os 5 campos da trilha rápida para ativar em menos de 5 minutos.')
      return
    }

    setIsFastTrackPublishing(true)
    setErrorMessage('')

    try {
      const createdOffice = draft.officeId
        ? null
        : await createAdminOffice({
          name: officeName,
          category: 'legal-services',
          primaryColor: '#1f6feb',
        })

      const officeId = draft.officeId ?? createdOffice?.officeId
      if (!officeId) {
        throw new Error('O escritório foi criado, mas o identificador não foi retornado pelo servidor.')
      }

      await saveOfficeBusinessConfig(officeId, buildBusinessConfigFromFastTrack(draft))
      await ensureFastTrackProfessional(officeId, draft)

      const completedAt = new Date().toISOString()
      const startReference = draft.fastTrack.startedAt ? new Date(draft.fastTrack.startedAt).getTime() : Date.now()
      const activationDurationSeconds = Math.max(0, Math.round((new Date(completedAt).getTime() - startReference) / 1000))

      markInstitutionalOnboardingPublished({ officeId })
      persist({
        ...draft,
        officeId,
        publicationStatus: 'published',
        publishedAt: completedAt,
        activationMode: 'fast-track',
        fastTrack: {
          ...draft.fastTrack,
          enabled: true,
          completedAt,
          activationDurationSeconds,
        },
      })

      const fallbackDestination = LEGAL_ROUTES.admin.escritorio(officeId, 'perfil-publico')
      navigateTo(consumeAuthContinuationReturnTo(fallbackDestination))
    } catch (error) {
      console.error(error)
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível concluir a ativação rápida agora.')
    } finally {
      setIsFastTrackPublishing(false)
    }
  }

  async function publishInstitutionalOnboarding() {
    if (!authSession?.token) {
      setErrorMessage('Entre com a conta do escritório para concluir a publicação.')
      return
    }

    if (readiness.status === 'draft') {
      setErrorMessage('Conclua os pontos pendentes antes de publicar o perfil.')
      return
    }

    if (!draft.compliance.institutionalCommitment || !draft.compliance.legalAccuracy || !draft.compliance.dataGovernance || !draft.compliance.publicationAuthority) {
      setErrorMessage('Revise e confirme todos os compromissos desta etapa antes de publicar.')
      return
    }

    setIsPublishing(true)
    setErrorMessage('')

    try {
      const officeName = draft.office.officeName.trim()
      if (!officeName) {
        throw new Error('Informe o nome oficial do escritório para seguir com a publicação.')
      }

      const createdOffice = draft.officeId
        ? null
        : await createAdminOffice({
          name: officeName,
          category: 'legal-services',
          primaryColor: '#1f6feb',
        })

      const officeId = draft.officeId ?? createdOffice?.officeId
      if (!officeId) {
        throw new Error('O escritório foi criado, mas o identificador não foi retornado pelo servidor.')
      }

      await saveOfficeBusinessConfig(officeId, buildBusinessConfigFromDraft(draft))
      await upsertOfficeProfessionalsFromDraft(officeId, draft)

      markInstitutionalOnboardingPublished({ officeId })
      persist({
        ...draft,
        officeId,
        publicationStatus: 'published',
        publishedAt: new Date().toISOString(),
        currentStep: 7,
      })

      const fallbackDestination = LEGAL_ROUTES.admin.escritorio(officeId, 'perfil-publico')
      navigateTo(consumeAuthContinuationReturnTo(fallbackDestination))
    } catch (error) {
      console.error(error)
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível concluir a publicação agora.')
    } finally {
      setIsPublishing(false)
    }
  }

  const canGoBack = draft.currentStep > 0
  const canGoNext = draft.currentStep < WIZARD_STEPS.length - 1
  const isFastTrackMode = onboardingMode === 'fast-track'

  return (
    <main className="institutional-onboarding">
      <section className="institutional-onboarding__panel">
        <header className="institutional-onboarding__header">
          <p className="institutional-onboarding__kicker">Ativação do escritório</p>
          <h1>Ativação institucional do escritório</h1>
          <p>
            Preencha o essencial do escritório com continuidade de progresso, revisão final e preparo claro para publicação.
          </p>
          <div className="institutional-onboarding__mode-switch" role="tablist" aria-label="Modo de ativação">
            <button
              type="button"
              className={onboardingMode === 'complete' ? 'is-active' : ''}
              aria-selected={onboardingMode === 'complete'}
              onClick={() => setActivationMode('complete')}
            >
              Fluxo completo
            </button>
            <button
              type="button"
              className={onboardingMode === 'fast-track' ? 'is-active' : ''}
              aria-selected={onboardingMode === 'fast-track'}
              onClick={() => setActivationMode('fast-track')}
            >
              Fast Track (menos de 5 min)
            </button>
          </div>
        </header>

        <section className="institutional-onboarding__progress" aria-label="Progresso do onboarding">
          <div>
            <strong>{isFastTrackMode ? 'Trilha rápida de ativação' : `Etapa ${draft.currentStep + 1} de ${WIZARD_STEPS.length}`}</strong>
            <span>{isFastTrackMode ? 'Ativação operacional mínima para escritório pequeno.' : currentStep.title}</span>
          </div>
          <div>
            <strong>Prontidão {readiness.progressPercent}%</strong>
            <span>Status: {draft.publicationStatus === 'published' ? 'publicado' : readiness.status === 'ready' ? 'pronto para publicar' : 'em preparo'}</span>
          </div>
        </section>

        <OperationalFeedbackPanel
          subtitle="Consequências operacionais calculadas por regras determinísticas da configuração atual."
          snapshot={operationalFeedback}
        />

        {!isFastTrackMode ? (
          <ol className="institutional-onboarding__steps" aria-label="Etapas do onboarding institucional">
            {WIZARD_STEPS.map((step, index) => (
              <li key={step.id} className={[index === draft.currentStep ? 'is-current' : '', index < draft.currentStep ? 'is-done' : ''].filter(Boolean).join(' ')}>
                <button type="button" onClick={() => goToStep(index)}>
                  <strong>{step.id}. {step.title}</strong>
                  <span>{step.subtitle}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}

        {isFastTrackMode ? (
          <section className="institutional-onboarding__card">
            <h2>Fast Track para escritórios pequenos</h2>
            <p className="institutional-onboarding__fast-track-copy">
              Preencha apenas os 5 campos essenciais para publicar uma operação mínima agora. O setup avançado fica opcional depois.
            </p>
            <label>
              Nome institucional
              <input value={draft.office.officeName} onChange={(event) => updateDraft('office', { ...draft.office, officeName: event.target.value })} />
            </label>
            <label>
              Especialidade principal
              <input value={draft.fastTrack.mainSpecialty} onChange={(event) => updateDraft('fastTrack', { ...draft.fastTrack, mainSpecialty: event.target.value })} placeholder="Ex: Trabalhista" />
            </label>
            <label>
              Cidade principal
              <input value={draft.fastTrack.mainCity} onChange={(event) => updateDraft('fastTrack', { ...draft.fastTrack, mainCity: event.target.value })} placeholder="Ex: São Paulo" />
            </label>
            <label>
              Canal de contato
              <input value={draft.fastTrack.contactChannel} onChange={(event) => updateDraft('fastTrack', { ...draft.fastTrack, contactChannel: event.target.value })} placeholder="Ex: WhatsApp (11) 99999-9999" />
            </label>
            <label>
              Disponibilidade básica
              <input value={draft.fastTrack.basicAvailability} onChange={(event) => updateDraft('fastTrack', { ...draft.fastTrack, basicAvailability: event.target.value })} placeholder="Ex: Seg-Sex 08:00-18:00" />
            </label>

            <div className="institutional-onboarding__fast-track-actions">
              <button
                type="button"
                className="institutional-onboarding__fast-track-publish"
                disabled={isFastTrackPublishing}
                onClick={() => void publishFastTrack()}
              >
                {isFastTrackPublishing ? 'Ativando operação mínima...' : 'Ativar operação mínima agora'}
              </button>
              <button
                type="button"
                className="institutional-onboarding__ghost"
                onClick={() => {
                  setActivationMode('complete')
                  goToStep(1)
                }}
              >
                Ir para setup avançado opcional
              </button>
            </div>
          </section>
        ) : null}

        {!isFastTrackMode && draft.currentStep === 0 ? (
          <section className="institutional-onboarding__card">
            <h2>Conta institucional</h2>
            <label>
              Responsável institucional
              <input value={draft.account.responsibleName} onChange={(event) => updateDraft('account', { ...draft.account, responsibleName: event.target.value })} />
            </label>
            <label>
              Email institucional
              <input type="email" value={draft.account.institutionalEmail} onChange={(event) => updateDraft('account', { ...draft.account, institutionalEmail: event.target.value })} />
            </label>
            <label>
              Organização
              <input value={draft.account.tenantName} onChange={(event) => updateDraft('account', { ...draft.account, tenantName: event.target.value })} />
            </label>
          </section>
        ) : null}

        {!isFastTrackMode && draft.currentStep === 1 ? (
          <section className="institutional-onboarding__card">
            <h2>Dados do escritório</h2>
            <label>
              Nome oficial do escritório
              <input value={draft.office.officeName} onChange={(event) => updateDraft('office', { ...draft.office, officeName: event.target.value })} />
            </label>
            <label>
              Descrição institucional
              <textarea rows={4} value={draft.office.institutionalDescription} onChange={(event) => updateDraft('office', { ...draft.office, institutionalDescription: event.target.value })} />
            </label>
          </section>
        ) : null}

        {!isFastTrackMode && draft.currentStep === 2 ? (
          <section className="institutional-onboarding__card">
            <h2>Áreas e cobertura</h2>
            <label>
              Áreas jurídicas (separe por vírgula)
              <input value={draft.coverage.legalAreasCsv} onChange={(event) => updateDraft('coverage', { ...draft.coverage, legalAreasCsv: event.target.value })} />
            </label>
            <label>
              Cidades atendidas (separe por vírgula)
              <input value={draft.coverage.servedCitiesCsv} onChange={(event) => updateDraft('coverage', { ...draft.coverage, servedCitiesCsv: event.target.value })} />
            </label>
          </section>
        ) : null}

        {!isFastTrackMode && draft.currentStep === 3 ? (
          <section className="institutional-onboarding__card">
            <h2>Equipe e OAB</h2>
            <p>Cadastre os profissionais que sustentam a operação pública do escritório.</p>
            <div className="institutional-onboarding__stack">
              {draft.team.professionals.map((professional, index) => (
                <article key={professional.id} className="institutional-onboarding__subcard">
                  <div className="institutional-onboarding__subcard-header">
                    <strong>Profissional {index + 1}</strong>
                    {draft.team.professionals.length > 1 ? (
                      <button type="button" className="institutional-onboarding__ghost" onClick={() => removeOnboardingProfessional(professional.id)}>
                        Remover
                      </button>
                    ) : null}
                  </div>
                  <div className="institutional-onboarding__grid-2">
                    <label>
                      Nome completo
                      <input value={professional.displayName} onChange={(event) => updateOnboardingProfessional(professional.id, 'displayName', event.target.value)} />
                    </label>
                    <label>
                      OAB
                      <input value={professional.oabCredential} onChange={(event) => updateOnboardingProfessional(professional.id, 'oabCredential', event.target.value)} placeholder="OAB/SP 123456" />
                    </label>
                    <label>
                      Especialidades (vírgula)
                      <input value={professional.specialtiesCsv} onChange={(event) => updateOnboardingProfessional(professional.id, 'specialtiesCsv', event.target.value)} placeholder="Direito do Trabalho, Previdenciário" />
                    </label>
                    <label>
                      E-mail
                      <input type="email" value={professional.email} onChange={(event) => updateOnboardingProfessional(professional.id, 'email', event.target.value)} />
                    </label>
                    <label>
                      Telefone
                      <input value={professional.phone} onChange={(event) => updateOnboardingProfessional(professional.id, 'phone', event.target.value)} />
                    </label>
                    <label>
                      Foto pública (URL)
                      <input value={professional.photoUrl} onChange={(event) => updateOnboardingProfessional(professional.id, 'photoUrl', event.target.value)} />
                    </label>
                  </div>
                  <label>
                    Bio curta
                    <textarea rows={3} value={professional.bio} onChange={(event) => updateOnboardingProfessional(professional.id, 'bio', event.target.value)} />
                  </label>
                  <div className="institutional-onboarding__grid-2">
                    <label>
                      <input type="checkbox" checked={professional.isResponsible} onChange={(event) => updateOnboardingProfessional(professional.id, 'isResponsible', event.target.checked)} />
                      {' '}Marcar como responsável visível
                    </label>
                    <label>
                      <input type="checkbox" checked={professional.isPublic} onChange={(event) => updateOnboardingProfessional(professional.id, 'isPublic', event.target.checked)} />
                      {' '}Exibir no perfil público
                    </label>
                  </div>
                </article>
              ))}
            </div>
            <button type="button" className="institutional-onboarding__ghost" onClick={addOnboardingProfessional}>
              Adicionar outro profissional
            </button>
          </section>
        ) : null}

        {!isFastTrackMode && draft.currentStep === 4 ? (
          <section className="institutional-onboarding__card">
            <h2>Disponibilidade e SLA</h2>
            <label>
              Modalidade de atendimento
              <select value={draft.operations.attendanceModel} onChange={(event) => updateDraft('operations', { ...draft.operations, attendanceModel: event.target.value as InstitutionalOnboardingDraft['operations']['attendanceModel'] })}>
                <option value="online">Online</option>
                <option value="in_person">Presencial</option>
                <option value="hybrid">Híbrido</option>
              </select>
            </label>
            <label>
              Horários operacionais
              <input value={draft.operations.operatingHours} onChange={(event) => updateDraft('operations', { ...draft.operations, operatingHours: event.target.value })} placeholder="Seg-Sex 08:00-18:00" />
            </label>
            <label>
              Capacidade atual
              <input value={draft.operations.maxCapacity} onChange={(event) => updateDraft('operations', { ...draft.operations, maxCapacity: event.target.value })} />
            </label>
            <label>
              Tempo médio de primeiro retorno (min)
              <input value={draft.operations.avgResponseMinutes} onChange={(event) => updateDraft('operations', { ...draft.operations, avgResponseMinutes: event.target.value })} />
            </label>
            <label>
              Janela pública de retorno
              <input value={draft.operations.responseWindowLabel} onChange={(event) => updateDraft('operations', { ...draft.operations, responseWindowLabel: event.target.value })} placeholder="Retorno inicial em até 2 horas" />
            </label>
          </section>
        ) : null}

        {!isFastTrackMode && draft.currentStep === 5 ? (
          <section className="institutional-onboarding__card">
            <h2>Intake e políticas</h2>
            <label>
              Critérios de intake
              <textarea rows={4} value={draft.intake.intakeCriteria} onChange={(event) => updateDraft('intake', { ...draft.intake, intakeCriteria: event.target.value })} />
            </label>
            <label>
              Regras de prioridade
              <textarea rows={3} value={draft.intake.priorityRules} onChange={(event) => updateDraft('intake', { ...draft.intake, priorityRules: event.target.value })} />
            </label>
            <label>
              Regras de desqualificação
              <textarea rows={3} value={draft.intake.disqualificationRules} onChange={(event) => updateDraft('intake', { ...draft.intake, disqualificationRules: event.target.value })} />
            </label>
          </section>
        ) : null}

        {!isFastTrackMode && draft.currentStep === 6 ? (
          <section className="institutional-onboarding__card">
            <h2>Revisão final</h2>
            <ul className="institutional-onboarding__checklist">
              {renderChecklistItem('Áreas jurídicas consolidadas', readiness.checklist.legalAreas)}
              {renderChecklistItem('Cobertura de cidades consolidada', readiness.checklist.coverage)}
              {renderChecklistItem('Equipe institucional registrada', readiness.checklist.team)}
              {renderChecklistItem('OAB validado por profissional', readiness.checklist.oab)}
              {renderChecklistItem('Disponibilidade e SLA definidos', readiness.checklist.availability)}
              {renderChecklistItem('Política de intake definida', readiness.checklist.intake)}
              {renderChecklistItem('Mensagens públicas completas', readiness.checklist.publicMessages)}
              {renderChecklistItem('Canais de publicação definidos', readiness.checklist.publicationChannels)}
            </ul>

            <div className="institutional-onboarding__compliance">
              <label><input type="checkbox" checked={draft.compliance.institutionalCommitment} onChange={(event) => updateDraft('compliance', { ...draft.compliance, institutionalCommitment: event.target.checked })} /> Confirmo que os dados refletem a operação real do escritório.</label>
              <label><input type="checkbox" checked={draft.compliance.legalAccuracy} onChange={(event) => updateDraft('compliance', { ...draft.compliance, legalAccuracy: event.target.checked })} /> Confirmo que as informações publicadas estão corretas.</label>
              <label><input type="checkbox" checked={draft.compliance.dataGovernance} onChange={(event) => updateDraft('compliance', { ...draft.compliance, dataGovernance: event.target.checked })} /> Confirmo cuidado com governança e privacidade dos dados.</label>
              <label><input type="checkbox" checked={draft.compliance.publicationAuthority} onChange={(event) => updateDraft('compliance', { ...draft.compliance, publicationAuthority: event.target.checked })} /> Confirmo que posso publicar em nome do escritório.</label>
            </div>

            {readiness.missingItems.length > 0 ? (
              <p className="institutional-onboarding__warning">Ainda faltam estes pontos: {readiness.missingItems.join('; ')}.</p>
            ) : (
              <p className="institutional-onboarding__success">Tudo em ordem para seguir para a publicação.</p>
            )}
          </section>
        ) : null}

        {!isFastTrackMode && draft.currentStep === 7 ? (
          <section className="institutional-onboarding__card">
            <h2>Publicação</h2>
            <label>
              Mensagem principal do perfil
              <textarea rows={3} value={draft.publication.heroMessage} onChange={(event) => updateDraft('publication', { ...draft.publication, heroMessage: event.target.value })} />
            </label>
            <label>
              Mensagem inicial de triagem
              <textarea rows={3} value={draft.publication.intakeMessage} onChange={(event) => updateDraft('publication', { ...draft.publication, intakeMessage: event.target.value })} />
            </label>
            <label>
              Mensagem de disponibilidade
              <textarea rows={3} value={draft.publication.availabilityMessage} onChange={(event) => updateDraft('publication', { ...draft.publication, availabilityMessage: event.target.value })} />
            </label>
            <div className="institutional-onboarding__grid-2">
              <label>WhatsApp<input value={draft.publication.whatsapp} onChange={(event) => updateDraft('publication', { ...draft.publication, whatsapp: event.target.value })} /></label>
              <label>Telefone<input value={draft.publication.phone} onChange={(event) => updateDraft('publication', { ...draft.publication, phone: event.target.value })} /></label>
              <label>Email<input type="email" value={draft.publication.email} onChange={(event) => updateDraft('publication', { ...draft.publication, email: event.target.value })} /></label>
              <label>Site<input value={draft.publication.website} onChange={(event) => updateDraft('publication', { ...draft.publication, website: event.target.value })} /></label>
            </div>
            <label>
              Endereço
              <input value={draft.publication.address} onChange={(event) => updateDraft('publication', { ...draft.publication, address: event.target.value })} />
            </label>

            <button type="button" className="institutional-onboarding__publish" disabled={isPublishing} onClick={() => void publishInstitutionalOnboarding()}>
              {isPublishing ? 'Publicando perfil...' : 'Publicar perfil do escritório'}
            </button>
            <button type="button" className="institutional-onboarding__ghost" onClick={() => { clearInstitutionalOnboardingDraft(); navigateTo(LEGAL_ROUTES.admin.home) }}>
              Sair e limpar este rascunho
            </button>
          </section>
        ) : null}

        {errorMessage ? <p className="institutional-onboarding__error">{errorMessage}</p> : null}

        {!isFastTrackMode ? (
          <footer className="institutional-onboarding__actions">
            <button type="button" onClick={() => goToStep(draft.currentStep - 1)} disabled={!canGoBack}>Anterior</button>
            <button type="button" onClick={() => goToStep(draft.currentStep + 1)} disabled={!canGoNext}>Continuar</button>
          </footer>
        ) : null}
      </section>
    </main>
  )
}
