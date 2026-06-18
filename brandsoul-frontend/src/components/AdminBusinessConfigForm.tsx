import React, { useMemo, type ChangeEvent, type FormEvent } from 'react'

void React

import type {
  EntityBusinessConfig,
  EntityBusinessType,
  EntityLegalProfessional,
  EntityOfficeMediaItem,
} from '../backend-bridge/api/adminApi'
import { buildOperationalFeedbackSnapshot } from '../lib/operationalFeedbackEngine'
import type { ProfessionalReadinessSnapshot } from '../lib/professionalReadiness'
import { resolvePublicAssetUrl } from '../lib/publicAssetUrl'
import OperationalFeedbackPanel from './OperationalFeedbackPanel'

export type BusinessConfigUiState = 'loading' | 'error' | 'empty' | 'ready'

export type BusinessConfigFormScope = 'setup' | 'profile' | 'intake' | 'team' | 'coverage' | 'sla' | 'publication'

export type BusinessConfigFormState = {
  businessType: EntityBusinessType
  officeName: string
  institutionalDescription: string
  legalAreas: string
  servedCities: string
  attendanceModel: 'online' | 'in_person' | 'hybrid'
  operatingHours: string
  maxCapacity: string
  avgResponseMinutes: string
  responseWindowLabel: string
  whatsapp: string
  phone: string
  email: string
  address: string
  website: string
  otherContact: string
  teamRoster: string
  responsibleEnabled: boolean
  responsiblePhotoUrl: string
  responsibleFullName: string
  responsibleOab: string
  responsibleSpecialties: string
  responsibleYearsOfExperience: string
  responsibleShortBio: string
  officeGallery: EntityOfficeMediaItem[]
  institutionalVideoMode: 'external' | 'uploaded'
  institutionalVideoUrl: string
  institutionalVideoTitle: string
  institutionalVideoIntro: string
  trustEvidenceEnabled: boolean
  trustEvidenceApprovedCaseIds: string[]
  heroMessage: string
  intakeMessage: string
  availabilityMessage: string
  intakeCriteria: string
  priorityRules: string
  disqualificationRules: string
}

export const DEFAULT_FORM_STATE: BusinessConfigFormState = {
  businessType: 'legal',
  officeName: '',
  institutionalDescription: '',
  legalAreas: '',
  servedCities: '',
  attendanceModel: 'hybrid',
  operatingHours: '',
  maxCapacity: '',
  avgResponseMinutes: '',
  responseWindowLabel: '',
  whatsapp: '',
  phone: '',
  email: '',
  address: '',
  website: '',
  otherContact: '',
  teamRoster: '',
  responsibleEnabled: false,
  responsiblePhotoUrl: '',
  responsibleFullName: '',
  responsibleOab: '',
  responsibleSpecialties: '',
  responsibleYearsOfExperience: '',
  responsibleShortBio: '',
  officeGallery: [],
  institutionalVideoMode: 'external',
  institutionalVideoUrl: '',
  institutionalVideoTitle: '',
  institutionalVideoIntro: '',
  trustEvidenceEnabled: false,
  trustEvidenceApprovedCaseIds: [],
  heroMessage: '',
  intakeMessage: '',
  availabilityMessage: '',
  intakeCriteria: '',
  priorityRules: '',
  disqualificationRules: '',
}

function parseCommaList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function formatCommaList(value: string[] | undefined) {
  return value && value.length > 0 ? value.join(', ') : ''
}

function parseOptionalPositiveInt(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = Number.parseInt(trimmed, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function parseCredentials(value: string) {
  return value
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseTeamRoster(value: string): EntityLegalProfessional[] {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const parsedMembers: Array<EntityLegalProfessional | null> = lines
    .map((line, index) => {
      const [namePart, rolePart, oabPart, credentialsPart] = line.split('|').map((part) => part.trim())
      if (!namePart) {
        return null
      }

      const credentials = credentialsPart ? parseCredentials(credentialsPart) : []

      return {
        id: `professional-${index + 1}`,
        name: namePart,
        role: rolePart || undefined,
        oabCredential: oabPart || undefined,
        credentials: credentials.length > 0 ? credentials : undefined,
      }
    })

  return parsedMembers.filter((member): member is EntityLegalProfessional => member !== null)
}

function formatTeamRoster(value: EntityLegalProfessional[] | undefined) {
  if (!value || value.length === 0) {
    return ''
  }

  return value
    .map((member) => {
      const credentials = member.credentials && member.credentials.length > 0
        ? member.credentials.join('; ')
        : ''

      return [
        member.name,
        member.role ?? '',
        member.oabCredential ?? '',
        credentials,
      ].join(' | ').trim()
    })
    .join('\n')
}

function resolveResponsibleFromTeam(team: EntityLegalProfessional[] | undefined) {
  return (team ?? []).find((member) => member.isResponsible === true)
}

function hydrateLegacyResponsibleIntoTeam(config: EntityBusinessConfig | null) {
  const baseTeam = [...(config?.team ?? [])]
  const responsibleFromTeam = resolveResponsibleFromTeam(baseTeam)
  const legacyResponsible = config?.responsibleProfessional

  if (responsibleFromTeam || !legacyResponsible?.fullName?.trim()) {
    return baseTeam
  }

  return [
    {
      id: 'responsible-professional',
      name: legacyResponsible.fullName.trim(),
      role: 'Advogada responsável',
      oabCredential: legacyResponsible.oabCredential?.trim() || undefined,
      photoUrl: legacyResponsible.photoUrl?.trim() || undefined,
      specialties: legacyResponsible.specialties?.map((item) => item.trim()).filter((item) => item.length > 0),
      yearsOfExperience: legacyResponsible.yearsOfExperience,
      shortBio: legacyResponsible.shortBio?.trim() || undefined,
      isResponsible: true,
      isPublic: true,
      status: 'active' as const,
    },
    ...baseTeam,
  ]
}

function mapAttendanceModeFromServiceMode(value: EntityBusinessConfig['serviceRules'] extends { attendanceMode?: infer T } ? T : string | undefined) {
  if (value === 'guidance') {
    return 'online'
  }

  if (value === 'support') {
    return 'in_person'
  }

  return 'hybrid'
}

function mapAttendanceModeToServiceMode(value: BusinessConfigFormState['attendanceModel']) {
  if (value === 'online') {
    return 'guidance' as const
  }

  if (value === 'in_person') {
    return 'support' as const
  }

  return 'mixed' as const
}

export function mapConfigToFormState(config: EntityBusinessConfig | null): BusinessConfigFormState {
  if (!config) {
    return DEFAULT_FORM_STATE
  }

  const hydratedTeam = hydrateLegacyResponsibleIntoTeam(config)
  const responsible = resolveResponsibleFromTeam(hydratedTeam)

  return {
    businessType: config.businessType,
    officeName: config.officeName ?? '',
    institutionalDescription: config.institutionalDescription ?? config.description ?? '',
    legalAreas: formatCommaList(config.legalAreas),
    servedCities: formatCommaList(config.servedCities),
    attendanceModel: config.attendanceModel ?? mapAttendanceModeFromServiceMode(config.serviceRules?.attendanceMode),
    operatingHours: config.operatingHours ?? '',
    maxCapacity: typeof config.maxCapacity === 'number' ? String(config.maxCapacity) : '',
    avgResponseMinutes: typeof config.avgResponseMinutes === 'number' ? String(config.avgResponseMinutes) : '',
    responseWindowLabel: config.serviceRules?.responseWindowLabel ?? '',
    whatsapp: config.channels?.whatsapp ?? '',
    phone: config.channels?.phone ?? '',
    email: config.channels?.email ?? '',
    address: config.channels?.address ?? '',
    website: config.channels?.website ?? '',
    otherContact: config.channels?.other ?? '',
    teamRoster: formatTeamRoster(hydratedTeam),
    responsibleEnabled: Boolean(responsible),
    responsiblePhotoUrl: responsible?.photoUrl ?? '',
    responsibleFullName: responsible?.name ?? '',
    responsibleOab: responsible?.oabCredential ?? '',
    responsibleSpecialties: formatCommaList(responsible?.specialties),
    responsibleYearsOfExperience: typeof responsible?.yearsOfExperience === 'number' ? String(responsible.yearsOfExperience) : '',
    responsibleShortBio: responsible?.shortBio ?? '',
    officeGallery: config.officeGallery ?? [],
    institutionalVideoMode: config.institutionalVideo?.mode ?? 'external',
    institutionalVideoUrl: config.institutionalVideo?.url ?? '',
    institutionalVideoTitle: config.institutionalVideo?.title ?? '',
    institutionalVideoIntro: config.institutionalVideo?.intro ?? '',
    trustEvidenceEnabled: config.trustEvidence?.enabled === true,
    trustEvidenceApprovedCaseIds: config.trustEvidence?.approvedCaseIds ?? [],
    heroMessage: config.publicMessages?.heroMessage ?? '',
    intakeMessage: config.publicMessages?.intakeMessage ?? '',
    availabilityMessage: config.publicMessages?.availabilityMessage ?? '',
    intakeCriteria: config.triagePolicies?.intakeCriteria ?? '',
    priorityRules: config.triagePolicies?.priorityRules ?? '',
    disqualificationRules: config.triagePolicies?.disqualificationRules ?? '',
  }
}

export function mapFormStateToConfig(form: BusinessConfigFormState): EntityBusinessConfig {
  const legalAreas = parseCommaList(form.legalAreas)
  const servedCities = parseCommaList(form.servedCities)
  const team: EntityLegalProfessional[] = parseTeamRoster(form.teamRoster).map((member) => ({
    ...member,
    isResponsible: undefined,
    isPublic: undefined,
  }))
  const responsibleSpecialties = parseCommaList(form.responsibleSpecialties)
  const responsibleProfessional = {
    photoUrl: form.responsiblePhotoUrl.trim() || undefined,
    name: form.responsibleFullName.trim() || undefined,
    oabCredential: form.responsibleOab.trim() || undefined,
    specialties: responsibleSpecialties.length > 0 ? responsibleSpecialties : undefined,
    yearsOfExperience: parseOptionalPositiveInt(form.responsibleYearsOfExperience),
    shortBio: form.responsibleShortBio.trim() || undefined,
  }
  const hasResponsibleProfessional = form.responsibleEnabled && Object.values(responsibleProfessional).some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0
    }

    return typeof value !== 'undefined'
  })

  if (hasResponsibleProfessional) {
    const responsibleIndex = team.findIndex((member) => {
      const sameName = responsibleProfessional.name && member.name.trim() === responsibleProfessional.name
      const sameOab = responsibleProfessional.oabCredential && member.oabCredential?.trim() === responsibleProfessional.oabCredential
      return sameName || sameOab
    })

    const existing = responsibleIndex >= 0 ? team[responsibleIndex] : undefined
    const mergedResponsible: EntityLegalProfessional = {
      id: existing?.id ?? 'responsible-professional',
      name: responsibleProfessional.name ?? existing?.name ?? 'Profissional responsável',
      role: existing?.role ?? 'Advogada responsável',
      oabCredential: responsibleProfessional.oabCredential ?? existing?.oabCredential,
      credentials: existing?.credentials,
      photoUrl: responsibleProfessional.photoUrl,
      specialties: responsibleProfessional.specialties,
      yearsOfExperience: responsibleProfessional.yearsOfExperience,
      shortBio: responsibleProfessional.shortBio,
      status: existing?.status ?? 'active',
      email: existing?.email,
      phone: existing?.phone,
      isResponsible: true,
      isPublic: true,
    }

    if (responsibleIndex >= 0) {
      team[responsibleIndex] = mergedResponsible
    } else {
      team.unshift(mergedResponsible)
    }
  }

  return {
    businessType: 'legal',
    officeName: form.officeName.trim() || undefined,
    description: form.institutionalDescription.trim() || undefined,
    institutionalDescription: form.institutionalDescription.trim() || undefined,
    legalAreas: legalAreas.length > 0 ? legalAreas : undefined,
    servedCities: servedCities.length > 0 ? servedCities : undefined,
    attendanceModel: form.attendanceModel,
    operatingHours: form.operatingHours.trim() || undefined,
    maxCapacity: parseOptionalPositiveInt(form.maxCapacity),
    avgResponseMinutes: parseOptionalPositiveInt(form.avgResponseMinutes),
    channels: {
      whatsapp: form.whatsapp.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      website: form.website.trim() || undefined,
      other: form.otherContact.trim() || undefined,
    },
    team: team.length > 0 ? team : undefined,
    officeGallery: form.officeGallery.length > 0
      ? form.officeGallery.map((item, index) => ({
        id: item.id,
        url: item.url,
        isCover: item.isCover === true || (index === 0 && !form.officeGallery.some((candidate) => candidate.isCover === true)) ? true : undefined,
      }))
      : [],
    institutionalVideo: form.institutionalVideoUrl.trim()
      ? {
        mode: form.institutionalVideoMode,
        provider: form.institutionalVideoMode === 'uploaded'
          ? 'upload'
          : form.institutionalVideoUrl.includes('youtu')
            ? 'youtube'
            : form.institutionalVideoUrl.includes('vimeo')
              ? 'vimeo'
              : undefined,
        url: form.institutionalVideoUrl.trim(),
        title: form.institutionalVideoTitle.trim() || undefined,
        intro: form.institutionalVideoIntro.trim() || undefined,
      }
      : null,
    trustEvidence: {
      enabled: form.trustEvidenceEnabled,
      approvedCaseIds: form.trustEvidenceApprovedCaseIds.length > 0 ? form.trustEvidenceApprovedCaseIds : undefined,
    },
    publicMessages: {
      heroMessage: form.heroMessage.trim() || undefined,
      intakeMessage: form.intakeMessage.trim() || undefined,
      availabilityMessage: form.availabilityMessage.trim() || undefined,
    },
    triagePolicies: {
      intakeCriteria: form.intakeCriteria.trim() || undefined,
      priorityRules: form.priorityRules.trim() || undefined,
      disqualificationRules: form.disqualificationRules.trim() || undefined,
    },
    serviceRules: {
      attendanceMode: mapAttendanceModeToServiceMode(form.attendanceModel),
      responseWindowLabel: form.responseWindowLabel.trim() || undefined,
    },
  }
}

type AdminBusinessConfigFormProps = {
  officeId: string
  uiState: BusinessConfigUiState
  formState: BusinessConfigFormState
  error?: string | null
  successMessage?: string | null
  isSaving: boolean
  isUploadingMedia?: boolean
  isUploadingInstitutionalVideo?: boolean
  trustEvidenceCandidates?: Array<{
    caseId: string
    city?: string
    serviceType?: string
    review: string
    rating: number
    firstName?: string
    approved: boolean
  }>
  scope?: BusinessConfigFormScope
  onTextField: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  onOfficeMediaUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onOfficeMediaMove: (mediaId: string, direction: 'left' | 'right') => void
  onOfficeMediaSetCover: (mediaId: string) => void
  onOfficeMediaRemove: (mediaId: string) => void
  onInstitutionalVideoUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onTrustEvidenceToggle: (enabled: boolean) => void
  onTrustEvidenceApprovalToggle: (caseId: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  professionalReadinessSnapshot?: ProfessionalReadinessSnapshot
}

function OfficeGalleryPreviewImage({
  src,
  alt,
}: {
  src: string | undefined
  alt: string
}) {
  const [failedToLoad, setFailedToLoad] = React.useState(false)

  if (!src || failedToLoad) {
    return (
      <div className="admin-office-gallery-item__fallback" role="status" aria-live="polite">
        <p>Imagem enviada, mas não foi possível carregar a prévia.</p>
        <small>Verifique a URL do arquivo.</small>
      </div>
    )
  }

  return <img src={src} alt={alt} onError={() => setFailedToLoad(true)} />
}

export default function AdminBusinessConfigForm({
  officeId,
  uiState,
  formState,
  error,
  successMessage,
  isSaving,
  isUploadingMedia = false,
  isUploadingInstitutionalVideo = false,
  trustEvidenceCandidates = [],
  scope = 'setup',
  onTextField,
  onOfficeMediaUpload,
  onOfficeMediaMove,
  onOfficeMediaSetCover,
  onOfficeMediaRemove,
  onInstitutionalVideoUpload,
  onTrustEvidenceToggle,
  onTrustEvidenceApprovalToggle,
  onSubmit,
  professionalReadinessSnapshot,
}: AdminBusinessConfigFormProps) {
  const operationalFeedback = useMemo(() => buildOperationalFeedbackSnapshot({
    maxCapacity: formState.maxCapacity,
    avgResponseMinutes: formState.avgResponseMinutes,
    responseWindowLabel: formState.responseWindowLabel,
    servedCities: formState.servedCities,
    legalAreas: formState.legalAreas,
    priorityRules: formState.priorityRules,
    intakeCriteria: formState.intakeCriteria,
    professionalReadiness: professionalReadinessSnapshot,
    heroMessage: formState.heroMessage,
    intakeMessage: formState.intakeMessage,
    availabilityMessage: formState.availabilityMessage,
    channels: [
      formState.whatsapp,
      formState.phone,
      formState.email,
      formState.address,
      formState.website,
      formState.otherContact,
    ],
  }), [formState, professionalReadinessSnapshot])

  const scopeLabel = scope === 'setup'
    ? 'Base do escritório'
    : scope === 'profile'
      ? 'Perfil público'
      : scope === 'intake'
        ? 'Triagem'
        : scope === 'team'
          ? 'Equipe'
          : scope === 'coverage'
            ? 'Cobertura'
            : scope === 'sla'
              ? 'Disponibilidade e SLA'
              : 'Publicação'

  return (
    <section className="admin-card admin-config-card">
      <div className="admin-card-header">
        <div>
          <h2>Ajustes desta seção</h2>
          <p className="admin-diagnosis-meta">
            {uiState === 'empty' ? 'Esta seção ainda não recebeu informações.' : 'Informações carregadas e prontas para revisão.'}
          </p>
        </div>
        <span>{officeId}</span>
      </div>

      <div className="admin-form-intro">
        <p className="admin-form-intro__eyebrow">{scopeLabel}</p>
        <p className="admin-form-intro__copy">Edite apenas o necessário. A leitura de prontidão fica acima para ajudar você a decidir o que realmente merece ajuste agora.</p>
      </div>

      <OperationalFeedbackPanel
        subtitle="Veja como esta seção afeta capacidade, prazo de resposta, cobertura, equipe, triagem e publicação."
        snapshot={operationalFeedback}
      />

      {error ? <div className="admin-feedback admin-feedback--error">{error}</div> : null}
      {successMessage ? <div className="admin-feedback">{successMessage}</div> : null}

      <form className="admin-form" onSubmit={onSubmit}>
        {(scope === 'setup' || scope === 'profile') ? (
          <section className="admin-diagnosis-section admin-form-section">
            <h3>Perfil institucional</h3>
            <p className="admin-form-section__hint">Defina nome e narrativa-base do escritório. Essa camada sustenta leitura pública e entendimento interno.</p>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>Nome do escritório</span>
                <input name="officeName" value={formState.officeName} onChange={onTextField} placeholder="Ex: Almeida & Costa Advocacia" />
              </label>
            </div>
            <label className="admin-field">
              <span>Descrição institucional</span>
              <textarea
                name="institutionalDescription"
                value={formState.institutionalDescription}
                onChange={onTextField}
                rows={4}
                placeholder="Descreva proposta institucional, posicionamento e contexto de atendimento."
              />
            </label>
          </section>
        ) : null}

        {(scope === 'coverage') ? (
          <section className="admin-diagnosis-section admin-form-section">
            <h3>Cobertura regional</h3>
            <p className="admin-form-section__hint">Registre onde e em que frentes o escritório realmente atende. Evite amplitude imprecisa.</p>
            <label className="admin-field">
              <span>Áreas jurídicas (separe por vírgula)</span>
              <input name="legalAreas" value={formState.legalAreas} onChange={onTextField} placeholder="Trabalhista, Cível, Empresarial" />
            </label>
            <label className="admin-field">
              <span>Cidades atendidas (separe por vírgula)</span>
              <input name="servedCities" value={formState.servedCities} onChange={onTextField} placeholder="São Paulo, Campinas, Santos" />
            </label>
            <label className="admin-field">
              <span>Modalidade de atendimento</span>
              <select name="attendanceModel" value={formState.attendanceModel} onChange={onTextField}>
                <option value="hybrid">Online e presencial</option>
                <option value="online">Apenas online</option>
                <option value="in_person">Apenas presencial</option>
              </select>
            </label>
          </section>
        ) : null}

        {(scope === 'sla') ? (
          <section className="admin-diagnosis-section admin-form-section">
            <h3>SLA e disponibilidade</h3>
            <p className="admin-form-section__hint">Descreva como o escritório atende hoje, com linguagem simples e expectativa de retorno compreensível.</p>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>Horários de atendimento</span>
                <input name="operatingHours" value={formState.operatingHours} onChange={onTextField} placeholder="Seg-Sex 08:30-18:30" />
              </label>
              <label className="admin-field">
                <span>Tempo médio de resposta (minutos)</span>
                <input name="avgResponseMinutes" value={formState.avgResponseMinutes} onChange={onTextField} placeholder="120" inputMode="numeric" />
              </label>
              <label className="admin-field">
                <span>Capacidade máxima (casos ativos)</span>
                <input name="maxCapacity" value={formState.maxCapacity} onChange={onTextField} placeholder="80" inputMode="numeric" />
              </label>
              <label className="admin-field">
                <span>Janela de resposta pública</span>
                <input name="responseWindowLabel" value={formState.responseWindowLabel} onChange={onTextField} placeholder="Resposta inicial em até 2 horas úteis" />
              </label>
            </div>
          </section>
        ) : null}

        {(scope === 'profile' || scope === 'publication') ? (
          <section className="admin-diagnosis-section admin-form-section">
            <h3>Mídia do escritório</h3>
            <p className="admin-form-section__hint">Use de 3 a 5 imagens para mostrar presença real: fachada, recepção, sala de reunião ou ambiente institucional. Escolha uma capa e mantenha só o que reforça credibilidade.</p>
            <label className="admin-field">
              <span>Adicionar imagens</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onOfficeMediaUpload} disabled={isUploadingMedia || formState.officeGallery.length >= 5} />
            </label>
            <p className="admin-form-section__hint">
              {isUploadingMedia
                ? 'Enviando imagens para a galeria do escritório...'
                : `Galeria atual: ${formState.officeGallery.length}/5 imagem(ns).`}
            </p>
            {formState.officeGallery.length > 0 ? (
              <div className="admin-office-gallery-grid" aria-label="Galeria do escritório">
                {formState.officeGallery.map((item, index) => (
                  <article key={item.id} className={`admin-office-gallery-item ${item.isCover ? 'admin-office-gallery-item--cover' : ''}`}>
                    <OfficeGalleryPreviewImage
                      src={resolvePublicAssetUrl(item.url)}
                      alt={`Imagem institucional ${index + 1} do escritório`}
                    />
                    <div className="admin-office-gallery-item__actions">
                      <button type="button" className="admin-button admin-button--ghost" onClick={() => onOfficeMediaMove(item.id, 'left')} disabled={index === 0}>Mover à esquerda</button>
                      <button type="button" className="admin-button admin-button--ghost" onClick={() => onOfficeMediaMove(item.id, 'right')} disabled={index === formState.officeGallery.length - 1}>Mover à direita</button>
                      <button type="button" className="admin-button admin-button--secondary" onClick={() => onOfficeMediaSetCover(item.id)}>{item.isCover ? 'Imagem de capa' : 'Definir como capa'}</button>
                      <button type="button" className="admin-button admin-button--ghost" onClick={() => onOfficeMediaRemove(item.id)}>Remover</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {scope === 'publication' ? (
          <section className="admin-diagnosis-section admin-form-section">
            <h3>Prova social verificada</h3>
            <p className="admin-form-section__hint">Exiba apenas feedback real de clientes que encerraram o atendimento dentro da plataforma. Nada aparece no perfil público sem habilitação e aprovação explícita.</p>
            <label className="admin-field admin-field--checkbox">
              <input
                type="checkbox"
                checked={formState.trustEvidenceEnabled}
                onChange={(event) => onTrustEvidenceToggle(event.target.checked)}
              />
              <span>Exibir experiências verificadas de clientes no perfil público</span>
            </label>
            <p className="admin-form-section__hint">
              {trustEvidenceCandidates.length > 0
                ? `${trustEvidenceCandidates.length} feedback(s) elegível(is) para revisão.`
                : 'Ainda não existem feedbacks elegíveis de clientes reais para publicar.'}
            </p>
            {trustEvidenceCandidates.length > 0 ? (
              <div className="admin-trust-evidence-list" aria-label="Experiências verificadas elegíveis">
                {trustEvidenceCandidates.map((candidate) => (
                  <article key={candidate.caseId} className="admin-trust-evidence-item">
                    <div className="admin-trust-evidence-item__header">
                      <strong>{candidate.firstName ? `${candidate.firstName} · ` : ''}{candidate.serviceType ?? 'Atendimento jurídico'}</strong>
                      <span>{candidate.rating}/5</span>
                    </div>
                    <p>{candidate.review}</p>
                    <p className="admin-form-section__hint">
                      {candidate.city ? `${candidate.city} · ` : ''}Caso {candidate.caseId}
                    </p>
                    <label className="admin-field admin-field--checkbox">
                      <input
                        type="checkbox"
                        checked={candidate.approved}
                        onChange={() => onTrustEvidenceApprovalToggle(candidate.caseId)}
                      />
                      <span>{candidate.approved ? 'Aprovado para exibição pública' : 'Aprovar para exibição pública'}</span>
                    </label>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {(scope === 'profile' || scope === 'publication') ? (
          <section className="admin-diagnosis-section admin-form-section">
            <h3>Vídeo institucional</h3>
            <p className="admin-form-section__hint">Use um vídeo curto, humano e direto para apresentar o escritório, o responsável ou a forma de atendimento. Evite linguagem publicitária.</p>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>Origem do vídeo</span>
                <select name="institutionalVideoMode" value={formState.institutionalVideoMode} onChange={onTextField}>
                  <option value="external">YouTube ou Vimeo</option>
                  <option value="uploaded">Vídeo enviado pelo escritório</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{formState.institutionalVideoMode === 'uploaded' ? 'URL do vídeo enviado' : 'URL do YouTube ou Vimeo'}</span>
                <input
                  name="institutionalVideoUrl"
                  value={formState.institutionalVideoUrl}
                  onChange={onTextField}
                  placeholder={formState.institutionalVideoMode === 'uploaded' ? '/assets/...' : 'https://www.youtube.com/watch?v=...'}
                />
              </label>
              <label className="admin-field">
                <span>Título público</span>
                <input name="institutionalVideoTitle" value={formState.institutionalVideoTitle} onChange={onTextField} placeholder="Conheça nosso escritório" />
              </label>
            </div>
            <label className="admin-field">
              <span>Introdução curta</span>
              <textarea name="institutionalVideoIntro" value={formState.institutionalVideoIntro} onChange={onTextField} rows={3} placeholder="Uma apresentação breve sobre quem atende, como o escritório trabalha e como pode ajudar." />
            </label>
            <label className="admin-field">
              <span>Enviar vídeo institucional (MP4 ou WEBM)</span>
              <input type="file" accept="video/mp4,video/webm" onChange={onInstitutionalVideoUpload} disabled={isUploadingInstitutionalVideo} />
            </label>
            <p className="admin-form-section__hint">
              {isUploadingInstitutionalVideo
                ? 'Enviando vídeo institucional...'
                : formState.institutionalVideoUrl.trim()
                  ? 'Vídeo institucional pronto para revisão pública.'
                  : 'Você pode usar YouTube, Vimeo ou um vídeo enviado pelo próprio escritório.'}
            </p>
            {!isUploadingInstitutionalVideo && !formState.institutionalVideoUrl.trim() && (formState.institutionalVideoTitle.trim() || formState.institutionalVideoIntro.trim()) ? (
              <p className="admin-form-section__hint">Vídeo será removido ao salvar.</p>
            ) : null}
          </section>
        ) : null}

        {(scope === 'profile' || scope === 'publication') ? (
          <section className="admin-diagnosis-section admin-form-section">
            <h3>Canais de contato</h3>
            <p className="admin-form-section__hint">Mostre apenas canais que a equipe consegue sustentar com consistência. Clareza aqui aumenta confiança.</p>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>WhatsApp</span>
                <input name="whatsapp" value={formState.whatsapp} onChange={onTextField} placeholder="+55 11 9...." />
              </label>
              <label className="admin-field">
                <span>Telefone</span>
                <input name="phone" value={formState.phone} onChange={onTextField} placeholder="+55 11 ...." />
              </label>
              <label className="admin-field">
                <span>Email</span>
                <input name="email" value={formState.email} onChange={onTextField} placeholder="contato@escritório.com.br" />
              </label>
              <label className="admin-field">
                <span>Website</span>
                <input name="website" value={formState.website} onChange={onTextField} placeholder="https://..." />
              </label>
              <label className="admin-field">
                <span>Endereço</span>
                <input name="address" value={formState.address} onChange={onTextField} placeholder="Rua..., cidade..." />
              </label>
              <label className="admin-field">
                <span>Outros canais</span>
                <input name="otherContact" value={formState.otherContact} onChange={onTextField} placeholder="Instagram, secretaria, plantão..." />
              </label>
            </div>
          </section>
        ) : null}

        {(scope === 'team') ? (
          <section className="admin-diagnosis-section admin-form-section">
            <h3>Gestão de profissionais</h3>
            <p className="admin-form-section__hint">Registre a equipe e marque quem aparece como responsável visível no perfil público. O responsável agora é um profissional da equipe, não um cadastro separado.</p>
            <label className="admin-field">
              <span>Profissionais (um por linha: Nome | Função | OAB | Credenciais separados por ;)</span>
              <textarea
                name="teamRoster"
                value={formState.teamRoster}
                onChange={onTextField}
                rows={6}
                placeholder={[
                  'Dra. Ana Silva | Sócia | OAB/SP 123456 | Direito do Trabalho; Mediação',
                  'Dr. Bruno Costa | Coordenador de Intake | OAB/SP 987654 | Cível; Contencioso',
                ].join('\n')}
              />
            </label>
            <label className="admin-field">
              <span>
                <input
                  type="checkbox"
                  name="responsibleEnabled"
                  checked={formState.responsibleEnabled}
                  onChange={onTextField}
                />
                {' '}Marcar profissional responsável
              </span>
            </label>
            {formState.responsibleEnabled ? (
              <>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Foto pública (URL)</span>
                    <input name="responsiblePhotoUrl" value={formState.responsiblePhotoUrl} onChange={onTextField} placeholder="https://..." />
                  </label>
                  <label className="admin-field">
                    <span>Nome completo</span>
                    <input name="responsibleFullName" value={formState.responsibleFullName} onChange={onTextField} placeholder="Dra. Ana Silva" />
                  </label>
                  <label className="admin-field">
                    <span>OAB</span>
                    <input name="responsibleOab" value={formState.responsibleOab} onChange={onTextField} placeholder="OAB/SP 123456" />
                  </label>
                  <label className="admin-field">
                    <span>Especialidades (separe por vírgula)</span>
                    <input name="responsibleSpecialties" value={formState.responsibleSpecialties} onChange={onTextField} placeholder="Direito do Trabalho, Direito Previdenciário" />
                  </label>
                  <label className="admin-field">
                    <span>Anos de experiência</span>
                    <input name="responsibleYearsOfExperience" value={formState.responsibleYearsOfExperience} onChange={onTextField} placeholder="12" inputMode="numeric" />
                  </label>
                </div>
                <label className="admin-field">
                  <span>Breve apresentação</span>
                  <textarea
                    name="responsibleShortBio"
                    value={formState.responsibleShortBio}
                    onChange={onTextField}
                    rows={3}
                    placeholder="Atuação jurídica focada em orientação clara, triagem responsável e acompanhamento próximo dos clientes."
                  />
                </label>
              </>
            ) : null}
          </section>
        ) : null}

        {(scope === 'profile' || scope === 'intake' || scope === 'publication') ? (
          <section className="admin-diagnosis-section admin-form-section">
            <h3>Mensagens públicas</h3>
            <p className="admin-form-section__hint">Escreva como o escritório realmente se apresenta e responde. Evite promessas vagas ou linguagem excessivamente formal.</p>
            {(scope === 'profile' || scope === 'publication') ? (
              <label className="admin-field">
                <span>Mensagem institucional principal</span>
                <textarea name="heroMessage" value={formState.heroMessage} onChange={onTextField} rows={3} placeholder="Mensagem exibida no perfil público do escritório." />
              </label>
            ) : null}
            {(scope === 'intake' || scope === 'publication') ? (
              <label className="admin-field">
                <span>Mensagem de triagem</span>
                <textarea name="intakeMessage" value={formState.intakeMessage} onChange={onTextField} rows={3} placeholder="Mensagem introdutória para quem inicia triagem." />
              </label>
            ) : null}
            <label className="admin-field">
              <span>Mensagem de disponibilidade/SLA</span>
              <textarea name="availabilityMessage" value={formState.availabilityMessage} onChange={onTextField} rows={2} placeholder="Compromisso público de retorno e disponibilidade." />
            </label>
          </section>
        ) : null}

        {(scope === 'intake') ? (
          <section className="admin-diagnosis-section admin-form-section">
            <h3>Políticas de triagem</h3>
            <p className="admin-form-section__hint">Defina o necessário para orientar a entrada dos casos sem transformar a triagem em uma barreira.</p>
            <label className="admin-field">
              <span>Critérios de intake</span>
              <textarea name="intakeCriteria" value={formState.intakeCriteria} onChange={onTextField} rows={3} placeholder="Quais informações mínimas são exigidas para iniciar triagem." />
            </label>
            <label className="admin-field">
              <span>Regras de prioridade</span>
              <textarea name="priorityRules" value={formState.priorityRules} onChange={onTextField} rows={3} placeholder="Como urgências e filas são priorizadas." />
            </label>
            <label className="admin-field">
              <span>Regras de impedimento/encaminhamento</span>
              <textarea name="disqualificationRules" value={formState.disqualificationRules} onChange={onTextField} rows={3} placeholder="Quando o caso não deve seguir para o escritório e precisa de encaminhamento." />
            </label>
          </section>
        ) : null}

        <div className="admin-form-footer">
          <p className="admin-form-footer__note">Ao salvar, você atualiza apenas esta seção. O restante da cabine continua como está.</p>
          <div className="admin-actions">
          <button type="submit" className="admin-button" disabled={isSaving}>
            {isSaving ? 'Salvando ajustes...' : 'Salvar ajustes desta seção'}
          </button>
          </div>
        </div>
      </form>
    </section>
  )
}
