import { useEffect, useMemo, useState } from 'react'
import React, { type ChangeEvent, type FormEvent } from 'react'

void React

import {
  createOfficeProfessional,
  deactivateOfficeProfessional,
  getOfficeBusinessConfig,
  listOfficeCases,
  listOfficeProfessionals,
  saveOfficeBusinessConfig,
  updateOfficeProfessional,
  uploadOfficeInstitutionalVideo,
  uploadOfficeMedia,
  type AdminLegalCase,
  type OfficeMediaItem,
  type OfficeProfessional,
  type OfficeProfessionalPayload,
} from '../backend-bridge/api/adminApi'
import { LEGAL_ROUTES } from '../app/routes/legalRoutes'
import { readFilesAsDataUrls } from '../lib/media'
import AdminBusinessConfigForm, {
  DEFAULT_FORM_STATE,
  mapConfigToFormState,
  mapFormStateToConfig,
  type BusinessConfigFormScope,
  type BusinessConfigFormState,
  type BusinessConfigUiState,
} from '../components/AdminBusinessConfigForm'
import AdminOfficeLayout from '../components/AdminOfficeLayout'
import FeedbackBanner from '../components/FeedbackBanner'
import StatusChip from '../components/StatusChip'
import SurfaceCard from '../components/SurfaceCard'
import { resolvePublicAssetUrl } from '../lib/publicAssetUrl'
import { buildProfessionalReadinessSnapshot } from '../lib/professionalReadiness'
import { evaluatePublicationQualityScore } from '../lib/publicationQualityScore'

type AdminCabinSection = 'visao-geral' | 'triagem' | 'equipe' | 'cobertura' | 'disponibilidade' | 'perfil-publico' | 'publicacao' | 'configuracoes'

type AdminOfficeCabinPageProps = {
  officeId: string
  section: AdminCabinSection
}

type ProfessionalDraft = {
  displayName: string
  email: string
  phone: string
  photoUrl: string
  oabCredential: string
  specialties: string
  bio: string
  isResponsible: boolean
  isPublic: boolean
  status: 'active' | 'inactive' | 'suspended'
}

type SectionMeta = {
  title: string
  subtitle: string
  scope: BusinessConfigFormScope | null
}

const SECTION_META: Record<AdminCabinSection, SectionMeta> = {
  'visao-geral': {
    title: 'Visão Geral',
    subtitle: 'Acompanhe prontidão, publicação, capacidade e pontos pendentes antes de entrar nos ajustes.',
    scope: null,
  },
  triagem: {
    title: 'Triagem',
    subtitle: 'Veja se a entrada de casos está clara para o cliente e segura para a equipe antes de ajustar as regras.',
    scope: 'intake',
  },
  equipe: {
    title: 'Equipe',
    subtitle: 'Acompanhe quem está mapeado, o que ainda falta e se a equipe já sustenta a operação pública.',
    scope: 'team',
  },
  cobertura: {
    title: 'Cobertura',
    subtitle: 'Entenda se a cobertura já está ampla o suficiente para receber clientes sem criar expectativas erradas.',
    scope: 'coverage',
  },
  disponibilidade: {
    title: 'Disponibilidade',
    subtitle: 'Veja se a capacidade, o prazo de resposta e os horários já estão claros para a operação e para o público.',
    scope: 'sla',
  },
  'perfil-publico': {
    title: 'Perfil Público',
    subtitle: 'Revise o que o cliente vai ler antes de entrar em contato com o escritório.',
    scope: 'profile',
  },
  publicacao: {
    title: 'Publicação',
    subtitle: 'Confirme o que ainda falta antes de colocar o perfil no ar com segurança.',
    scope: 'publication',
  },
  configuracoes: {
    title: 'Configurações',
    subtitle: 'Ajustes de base do escritório, separados da rotina diária e da publicação pública.',
    scope: 'setup',
  },
}

function toCsvCount(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .length
}

type PublicationReadiness = {
  status: 'published' | 'draft' | 'unpublished'
  missingItems: string[]
}

type TrustEvidenceCandidate = {
  caseId: string
  city?: string
  serviceType?: string
  review: string
  rating: number
  firstName?: string
  approved: boolean
}

function toPublicationReadiness(
  formState: BusinessConfigFormState,
  professionalReadiness: ReturnType<typeof buildProfessionalReadinessSnapshot>,
): PublicationReadiness {
  const hasIdentity = formState.officeName.trim().length > 0 && formState.institutionalDescription.trim().length > 0
  const hasCoverage = toCsvCount(formState.legalAreas) > 0 && toCsvCount(formState.servedCities) > 0
  const hasMessages = formState.heroMessage.trim().length > 0
    && formState.intakeMessage.trim().length > 0
    && formState.availabilityMessage.trim().length > 0
  const hasChannel = [
    formState.whatsapp,
    formState.phone,
    formState.email,
    formState.address,
    formState.website,
    formState.otherContact,
  ].some((value) => value.trim().length > 0)
  const hasIntakePolicy = formState.intakeCriteria.trim().length > 0
  const hasPublicProfessional = professionalReadiness.isKnown && professionalReadiness.hasPublicProfessional
  const hasResponsibleProfessional = professionalReadiness.isKnown && professionalReadiness.hasResponsibleProfessional
  const hasProfessionalOab = professionalReadiness.isKnown && professionalReadiness.hasOabCredential
  const hasProfessionalSpecialty = professionalReadiness.isKnown && professionalReadiness.hasSpecialtyCoverage
  const hasHumanTrustProfile = professionalReadiness.isKnown && professionalReadiness.hasHumanTrustProfile

  const missingItems = [
    hasIdentity ? null : 'Perfil institucional incompleto',
    hasCoverage ? null : 'Cobertura jurídica incompleta',
    hasMessages ? null : 'Mensagens públicas incompletas',
    hasChannel ? null : 'Canais públicos ausentes',
    hasIntakePolicy ? null : 'Política de triagem ausente',
    professionalReadiness.isKnown ? null : 'Leitura profissional ainda não confirmada',
    hasPublicProfessional ? null : 'Profissional público ausente',
    hasResponsibleProfessional ? null : 'Responsável visível ausente',
    hasProfessionalOab ? null : 'OAB profissional ausente',
    hasProfessionalSpecialty ? null : 'Especialidades profissionais ausentes',
    hasHumanTrustProfile ? null : 'Perfil humano do responsável incompleto',
  ].filter((item): item is string => item !== null)

  return {
    status: missingItems.length === 0 ? 'published' : hasChannel || hasMessages ? 'draft' : 'unpublished',
    missingItems,
  }
}

function resolveSectionReadiness(
  section: AdminCabinSection,
  formState: BusinessConfigFormState,
  professionalReadiness: ReturnType<typeof buildProfessionalReadinessSnapshot>,
) {
  if (section === 'triagem') {
    return formState.intakeCriteria.trim() ? 'Triagem pronta para orientar a entrada' : 'Triagem ainda precisa de orientação'
  }

  if (section === 'equipe') {
    return professionalReadiness.isKnown
      ? professionalReadiness.hasResponsibleProfessional
        ? 'Responsável visível e equipe canônica confirmada'
        : professionalReadiness.totalProfessionals > 0
          ? 'Equipe ativa, mas ainda sem responsável visível'
          : 'Equipe ainda não mapeada'
      : 'Equipe em verificação'
  }

  if (section === 'cobertura') {
    return toCsvCount(formState.legalAreas) > 0 && toCsvCount(formState.servedCities) > 0
      ? 'Cobertura definida'
      : 'Cobertura incompleta'
  }

  if (section === 'disponibilidade') {
    return formState.avgResponseMinutes.trim() || formState.operatingHours.trim()
      ? 'Disponibilidade clara para a equipe e para o público'
      : 'Disponibilidade ainda não informada'
  }

  if (section === 'perfil-publico') {
    return formState.officeName.trim() && formState.heroMessage.trim()
      ? 'Perfil com base institucional'
      : 'Perfil ainda incompleto'
  }

  if (section === 'publicacao') {
    return toPublicationReadiness(formState, professionalReadiness).status === 'published' ? 'Perfil pronto para publicação' : 'Perfil em preparação'
  }

  if (section === 'configuracoes') {
    return 'Governança de setup'
  }

  return 'Operação em leitura'
}

function normalizeFirstName(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.includes('@')) {
    return undefined
  }

  const firstToken = trimmed.split(/\s+/)[0]?.trim()
  if (!firstToken || ['cliente', 'participante', 'operador'].includes(firstToken.toLowerCase())) {
    return undefined
  }

  return firstToken
}

function buildProfessionalInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? '').join('')
  return initials || 'BS'
}

const EMPTY_PROFESSIONAL_DRAFT: ProfessionalDraft = {
  displayName: '',
  email: '',
  phone: '',
  photoUrl: '',
  oabCredential: '',
  specialties: '',
  bio: '',
  isResponsible: false,
  isPublic: true,
  status: 'active',
}

function mapProfessionalToDraft(professional: OfficeProfessional): ProfessionalDraft {
  return {
    displayName: professional.displayName,
    email: professional.email ?? '',
    phone: professional.phone ?? '',
    photoUrl: professional.photoUrl ?? '',
    oabCredential: professional.oabCredential ?? '',
    specialties: professional.specialties.join(', '),
    bio: professional.bio ?? '',
    isResponsible: professional.isResponsible,
    isPublic: professional.isPublic,
    status: professional.status,
  }
}

function mapDraftToProfessionalPayload(draft: ProfessionalDraft): OfficeProfessionalPayload {
  return {
    displayName: draft.displayName.trim(),
    email: draft.email.trim() || undefined,
    phone: draft.phone.trim() || undefined,
    photoUrl: draft.photoUrl.trim() || undefined,
    oabCredential: draft.oabCredential.trim() || undefined,
    specialties: draft.specialties.split(',').map((item) => item.trim()).filter((item) => item.length > 0),
    bio: draft.bio.trim() || undefined,
    isResponsible: draft.isResponsible,
    isPublic: draft.isPublic,
    status: draft.status,
  }
}

function buildTrustEvidenceCandidates(cases: AdminLegalCase[], approvedCaseIds: string[]): TrustEvidenceCandidate[] {
  const approved = new Set(approvedCaseIds)

  return cases
    .filter((caseItem) => caseItem.status === 'closed' && typeof caseItem.outcome?.rating === 'number' && typeof caseItem.outcome?.feedback === 'string' && caseItem.outcome.feedback.trim().length > 0)
    .filter((caseItem) => caseItem.outcome?.verifiedClientFeedback === true)
    .map((caseItem) => ({
      caseId: caseItem.id,
      city: caseItem.city,
      serviceType: caseItem.practiceArea,
      review: caseItem.outcome?.feedback?.trim() ?? '',
      rating: caseItem.outcome?.rating ?? 0,
      firstName: caseItem.outcome?.firstName ?? normalizeFirstName(caseItem.outcome?.closedBy),
      approved: approved.has(caseItem.id),
    }))
}

type ReadinessMetric = {
  label: string
  value: string
  tone: 'healthy' | 'attention' | 'risk'
}

type ReadinessLayer = {
  eyebrow: string
  title: string
  detail: string
  metrics: ReadinessMetric[]
  risks: string[]
  nextStep: string
}

function resolveReadinessLayer(
  section: AdminCabinSection,
  formState: BusinessConfigFormState,
  professionalReadiness: ReturnType<typeof buildProfessionalReadinessSnapshot>,
  publicationReadiness: PublicationReadiness,
  publicationQuality: { score: number; missingItems: string[] },
) : ReadinessLayer {
  const legalAreasCount = toCsvCount(formState.legalAreas)
  const citiesCount = toCsvCount(formState.servedCities)
  const teamCount = professionalReadiness.totalProfessionals
  const publicCount = professionalReadiness.publicProfessionals
  const responsibleCount = professionalReadiness.responsibleProfessionals
  const oabCount = professionalReadiness.professionalsWithOab
  const hasResponsible = professionalReadiness.hasResponsibleProfessional
  const hasResponsibleOab = professionalReadiness.hasOabCredential
  const channelsCount = [
    formState.whatsapp,
    formState.phone,
    formState.email,
    formState.address,
    formState.website,
    formState.otherContact,
  ].filter((value) => value.trim().length > 0).length

  if (section === 'triagem') {
    const hasCriteria = formState.intakeCriteria.trim().length > 0
    const hasPriority = formState.priorityRules.trim().length > 0
    const hasMessage = formState.intakeMessage.trim().length > 0
    return {
      eyebrow: 'Prontidão operacional',
      title: hasCriteria && hasMessage ? 'A triagem já consegue orientar a entrada dos clientes.' : 'Ainda faltam definições antes de abrir a triagem com segurança.',
      detail: 'Antes de editar campos, confirme se a equipe já tem critério, mensagem de entrada e regra básica de prioridade.',
      metrics: [
        { label: 'Critérios de entrada', value: hasCriteria ? 'Definidos' : 'Pendentes', tone: hasCriteria ? 'healthy' : 'risk' },
        { label: 'Mensagem de triagem', value: hasMessage ? 'Pronta' : 'Pendente', tone: hasMessage ? 'healthy' : 'attention' },
        { label: 'Priorização', value: hasPriority ? 'Orientada' : 'Sem regra', tone: hasPriority ? 'healthy' : 'attention' },
      ],
      risks: [
        !hasCriteria ? 'Sem critérios mínimos, a triagem pode receber casos sem contexto suficiente.' : '',
        !hasMessage ? 'Sem mensagem de abertura, o cliente começa a triagem com menos clareza.' : '',
      ].filter(Boolean),
      nextStep: hasCriteria ? 'Revise prioridades e impedimentos para reduzir retrabalho.' : 'Defina primeiro os critérios mínimos de entrada.',
    }
  }

  if (section === 'equipe') {
    return {
      eyebrow: 'Prontidão operacional',
      title: !professionalReadiness.isKnown
        ? 'A leitura profissional ainda está em verificação.'
        : hasResponsible
          ? 'O perfil já mostra um responsável jurídico visível para o público.'
          : teamCount > 0
            ? 'A equipe já existe, mas ainda falta um responsável visível.'
            : 'A equipe ainda não está visível para sustentar a operação.',
      detail: 'Antes do formulário, confirme se o responsável público e quem recebe triagem já estão minimamente mapeados.',
      metrics: [
        { label: 'Responsável visível', value: hasResponsible ? 'Definido' : professionalReadiness.isKnown ? 'Pendente' : 'Em verificação', tone: hasResponsible ? 'healthy' : professionalReadiness.isKnown ? 'risk' : 'attention' },
        { label: 'Profissionais', value: professionalReadiness.isKnown ? `${teamCount}` : '—', tone: professionalReadiness.isKnown && teamCount > 0 ? 'healthy' : professionalReadiness.isKnown ? 'risk' : 'attention' },
        { label: 'OAB informado', value: hasResponsibleOab ? 'Confirmado' : professionalReadiness.isKnown ? `${oabCount}` : 'Em verificação', tone: hasResponsibleOab || oabCount > 0 ? 'healthy' : professionalReadiness.isKnown ? 'attention' : 'attention' },
        { label: 'Cobertura humana', value: teamCount >= 2 ? 'Saudável' : teamCount === 1 ? 'Enxuta' : 'Ausente', tone: teamCount >= 2 ? 'healthy' : teamCount === 1 ? 'attention' : 'risk' },
      ],
      risks: [
        !professionalReadiness.isKnown ? 'Sem leitura canônica de profissionais, a cabine ainda não confirma a prontidão humana do escritório.' : '',
        !hasResponsible ? 'Sem responsável visível, o perfil público ainda parece anônimo.' : '',
        teamCount === 0 ? 'Sem equipe mapeada, a cabine parece configurada mas não operacional.' : '',
        !hasResponsibleOab && oabCount === 0 ? 'Sem OAB informado, a confiança do cadastro profissional fica mais fraca.' : '',
      ].filter(Boolean),
      nextStep: hasResponsible ? 'Revise equipe, papéis e OAB para sustentar o responsável público com operação real.' : 'Cadastre primeiro a pessoa responsável que deve aparecer no perfil público.',
    }
  }

  if (section === 'cobertura') {
    const hasCoverage = legalAreasCount > 0 && citiesCount > 0
    return {
      eyebrow: 'Prontidão operacional',
      title: hasCoverage ? 'A cobertura já dá base para receber buscas relevantes.' : 'A cobertura ainda está curta para sustentar a descoberta pública.',
      detail: 'Cobertura boa reduz busca vazia, melhora alinhamento do cliente e evita exposição imprecisa.',
      metrics: [
        { label: 'Áreas jurídicas', value: `${legalAreasCount}`, tone: legalAreasCount > 0 ? 'healthy' : 'risk' },
        { label: 'Cidades atendidas', value: `${citiesCount}`, tone: citiesCount > 0 ? 'healthy' : 'risk' },
        { label: 'Modalidade', value: formState.attendanceModel === 'hybrid' ? 'Híbrida' : formState.attendanceModel === 'online' ? 'Online' : 'Presencial', tone: 'attention' },
      ],
      risks: [
        legalAreasCount === 0 ? 'Sem áreas jurídicas, a busca perde aderência.' : '',
        citiesCount === 0 ? 'Sem cidades atendidas, o perfil pode parecer genérico demais.' : '',
      ].filter(Boolean),
      nextStep: hasCoverage ? 'Refine apenas onde o escritório realmente atende hoje.' : 'Defina áreas e cidades antes de ampliar a publicação.',
    }
  }

  if (section === 'disponibilidade') {
    const hasHours = formState.operatingHours.trim().length > 0
    const hasCapacity = formState.maxCapacity.trim().length > 0
    const hasSla = formState.avgResponseMinutes.trim().length > 0 || formState.responseWindowLabel.trim().length > 0
    return {
      eyebrow: 'Prontidão operacional',
      title: hasHours && hasSla ? 'A operação já transmite disponibilidade de forma confiável.' : 'Ainda faltam sinais claros de capacidade e resposta.',
      detail: 'Disponibilidade e SLA precisam aparecer primeiro para que a equipe e o cliente entendam o ritmo real do escritório.',
      metrics: [
        { label: 'Horários', value: hasHours ? 'Informados' : 'Pendentes', tone: hasHours ? 'healthy' : 'attention' },
        { label: 'Capacidade', value: hasCapacity ? `${formState.maxCapacity.trim()} casos` : 'Não informada', tone: hasCapacity ? 'healthy' : 'attention' },
        { label: 'Prazo inicial', value: formState.responseWindowLabel.trim() || 'Pendente', tone: hasSla ? 'healthy' : 'risk' },
      ],
      risks: [
        !hasSla ? 'Sem prazo inicial, o cliente entra sem expectativa de resposta.' : '',
        !hasCapacity ? 'Sem capacidade declarada, a operação perde leitura preventiva.' : '',
      ].filter(Boolean),
      nextStep: hasHours && hasSla ? 'Ajuste capacidade e horário fino apenas se a rotina mudou.' : 'Defina horário e prazo inicial antes de seguir para publicação.',
    }
  }

  if (section === 'perfil-publico') {
    const hasIdentity = formState.officeName.trim().length > 0
    const hasDescription = formState.institutionalDescription.trim().length > 0
    const hasHero = formState.heroMessage.trim().length > 0
    return {
      eyebrow: 'Prontidão pública',
      title: hasIdentity && hasHero ? 'O perfil já transmite quem é o escritório e como ele atende.' : 'O perfil ainda não explica bem o escritório para quem chega pela primeira vez.',
      detail: 'Antes dos campos, confirme se nome, narrativa e mensagem principal já passam confiança suficiente.',
      metrics: [
        { label: 'Nome público', value: hasIdentity ? 'Definido' : 'Pendente', tone: hasIdentity ? 'healthy' : 'risk' },
        { label: 'Descrição', value: hasDescription ? 'Pronta' : 'Pendente', tone: hasDescription ? 'healthy' : 'attention' },
        { label: 'Mensagem principal', value: hasHero ? 'Pronta' : 'Pendente', tone: hasHero ? 'healthy' : 'attention' },
      ],
      risks: [
        !hasIdentity ? 'Sem nome público, o perfil não fica pronto para ir ao ar.' : '',
        !hasHero ? 'Sem mensagem principal, o cliente entende menos o posicionamento do escritório.' : '',
      ].filter(Boolean),
      nextStep: hasIdentity ? 'Refine a narrativa principal para deixar o perfil mais confiável e direto.' : 'Defina primeiro o nome público e a mensagem principal do escritório.',
    }
  }

  if (section === 'publicacao') {
    return {
      eyebrow: 'Prontidão para publicação',
      title: publicationReadiness.status === 'published'
        ? 'Seu escritório está pronto para receber clientes.'
        : publicationReadiness.status === 'draft'
          ? 'Existem ajustes pendentes antes da publicação.'
          : 'Ainda falta base mínima para publicar o perfil com segurança.',
      detail: 'Antes do formulário, veja se a operação já sustenta o que vai aparecer na camada pública.',
      metrics: [
        { label: 'Status', value: publicationReadiness.status === 'published' ? 'Pronto' : publicationReadiness.status === 'draft' ? 'Em preparo' : 'Não publicado', tone: publicationReadiness.status === 'published' ? 'healthy' : publicationReadiness.status === 'draft' ? 'attention' : 'risk' },
        { label: 'Qualidade', value: `${publicationQuality.score}/100`, tone: publicationQuality.score >= 85 ? 'healthy' : publicationQuality.score >= 65 ? 'attention' : 'risk' },
        { label: 'Canais públicos', value: `${channelsCount}`, tone: channelsCount > 0 ? 'healthy' : 'risk' },
        { label: 'Profissionais públicos', value: professionalReadiness.isKnown ? `${publicCount}` : 'Em verificação', tone: professionalReadiness.isKnown && publicCount > 0 ? 'healthy' : professionalReadiness.isKnown ? 'attention' : 'attention' },
        { label: 'Responsável visível', value: responsibleCount > 0 ? 'Definido' : professionalReadiness.isKnown ? 'Pendente' : 'Em verificação', tone: responsibleCount > 0 ? 'healthy' : professionalReadiness.isKnown ? 'risk' : 'attention' },
      ],
      risks: publicationReadiness.missingItems,
      nextStep: publicationReadiness.status === 'published' ? 'Revise mensagens e canais apenas se quiser elevar o padrão do perfil.' : 'Feche os pontos pendentes antes de colocar o perfil no ar.',
    }
  }

  return {
    eyebrow: 'Leitura de base',
    title: 'Esta área reúne ajustes estruturais do escritório.',
    detail: 'Use esta seção para manter a base atualizada sem misturar configuração com operação diária.',
    metrics: [
      { label: 'Nome público', value: formState.officeName.trim() ? 'Definido' : 'Pendente', tone: formState.officeName.trim() ? 'healthy' : 'attention' },
      { label: 'Cobertura', value: `${legalAreasCount} áreas / ${citiesCount} cidades`, tone: legalAreasCount > 0 && citiesCount > 0 ? 'healthy' : 'attention' },
      { label: 'Equipe', value: professionalReadiness.isKnown ? `${teamCount} pessoa(s)` : 'Em verificação', tone: professionalReadiness.isKnown && teamCount > 0 ? 'healthy' : 'attention' },
    ],
    risks: [],
    nextStep: 'Use Triagem, Equipe, Cobertura e Disponibilidade para operar no dia a dia.',
  }
}

function resolvePublicationQualityTone(score: number) {
  if (score >= 90) {
    return 'success' as const
  }

  if (score >= 70) {
    return 'neutral' as const
  }

  if (score >= 50) {
    return 'warning' as const
  }

  return 'danger' as const
}

export default function AdminOfficeCabinPage({ officeId, section }: AdminOfficeCabinPageProps) {
  const meta = SECTION_META[section]
  const [uiState, setUiState] = useState<BusinessConfigUiState>('loading')
  const [formState, setFormState] = useState<BusinessConfigFormState>(DEFAULT_FORM_STATE)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [isUploadingInstitutionalVideo, setIsUploadingInstitutionalVideo] = useState(false)
  const [isUploadingProfessionalPhoto, setIsUploadingProfessionalPhoto] = useState(false)
  const [officeCases, setOfficeCases] = useState<AdminLegalCase[]>([])
  const [officeProfessionals, setOfficeProfessionals] = useState<OfficeProfessional[]>([])
  const [officeProfessionalsLoaded, setOfficeProfessionalsLoaded] = useState(false)
  const [professionalDraft, setProfessionalDraft] = useState<ProfessionalDraft>(EMPTY_PROFESSIONAL_DRAFT)
  const [editingProfessionalId, setEditingProfessionalId] = useState<string | null>(null)
  const [isSavingProfessional, setIsSavingProfessional] = useState(false)

  useEffect(() => {
    async function loadBusinessConfig() {
      try {
        setUiState('loading')
        setError(null)
        setSuccessMessage(null)

        const [payload, casesPayload, professionalsPayload] = await Promise.all([
          getOfficeBusinessConfig(officeId),
          section === 'publicacao' ? listOfficeCases(officeId) : Promise.resolve({ cases: [] as AdminLegalCase[] }),
          listOfficeProfessionals(officeId).catch(() => null),
        ])
        setFormState(mapConfigToFormState(payload.businessConfig))
        setOfficeCases(casesPayload.cases)
        setOfficeProfessionals(professionalsPayload?.professionals ?? [])
        setOfficeProfessionalsLoaded(Boolean(professionalsPayload))
        setUiState(payload.businessConfig ? 'ready' : 'empty')
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Não foi possível carregar esta seção agora.')
        setUiState('error')
      }
    }

    void loadBusinessConfig()
  }, [officeId, section])

  const professionalReadiness = useMemo(
    () => buildProfessionalReadinessSnapshot(officeProfessionalsLoaded ? officeProfessionals : undefined),
    [officeProfessionals, officeProfessionalsLoaded],
  )

  const overviewCards = useMemo(() => {
    return [
      {
        title: 'Triagem',
        value: formState.intakeCriteria.trim() ? 'Política definida' : 'Política pendente',
        actionHref: LEGAL_ROUTES.admin.escritorio(officeId, 'triagem'),
        actionLabel: 'Abrir Triagem',
      },
      {
        title: 'Equipe',
        value: professionalReadiness.isKnown
          ? `${professionalReadiness.totalProfessionals} profissional(is) mapeado(s)`
          : 'Profissionais em verificação',
        actionHref: LEGAL_ROUTES.admin.escritorio(officeId, 'equipe'),
        actionLabel: 'Abrir Equipe',
      },
      {
        title: 'Cobertura',
        value: `${toCsvCount(formState.legalAreas)} área(s) jurídica(s) e ${toCsvCount(formState.servedCities)} cidade(s)`,
        actionHref: LEGAL_ROUTES.admin.escritorio(officeId, 'cobertura'),
        actionLabel: 'Abrir Cobertura Regional',
      },
      {
        title: 'SLA',
        value: formState.avgResponseMinutes.trim()
          ? `Resposta média em ${formState.avgResponseMinutes.trim()} minuto(s)`
          : 'Tempo médio de resposta pendente',
        actionHref: LEGAL_ROUTES.admin.escritorio(officeId, 'disponibilidade'),
        actionLabel: 'Abrir Disponibilidade',
      },
      {
        title: 'Perfil Público',
        value: formState.officeName.trim() || 'Nome institucional pendente',
        actionHref: LEGAL_ROUTES.admin.escritorio(officeId, 'perfil-publico'),
        actionLabel: 'Abrir Perfil Público',
      },
      {
        title: 'Publicação',
        value: 'Camada editorial de mensagens e canais públicos',
        actionHref: LEGAL_ROUTES.admin.escritorio(officeId, 'publicacao'),
        actionLabel: 'Abrir Publicação',
      },
      {
        title: 'Configurações',
        value: 'Setup institucional e governança da cabine',
        actionHref: LEGAL_ROUTES.admin.escritorio(officeId, 'configuracoes'),
        actionLabel: 'Abrir Configurações',
      },
    ]
  }, [officeId, formState, professionalReadiness])

  const publicationReadiness = useMemo(
    () => toPublicationReadiness(formState, professionalReadiness),
    [formState, professionalReadiness],
  )
  const publicationQuality = useMemo(
    () => evaluatePublicationQualityScore({
      officeName: formState.officeName,
      institutionalDescription: formState.institutionalDescription,
      legalAreas: formState.legalAreas,
      servedCities: formState.servedCities,
      operatingHours: formState.operatingHours,
      avgResponseMinutes: formState.avgResponseMinutes,
      responseWindowLabel: formState.responseWindowLabel,
      whatsapp: formState.whatsapp,
      phone: formState.phone,
      email: formState.email,
      address: formState.address,
      website: formState.website,
      otherContact: formState.otherContact,
      heroMessage: formState.heroMessage,
      intakeMessage: formState.intakeMessage,
      availabilityMessage: formState.availabilityMessage,
      intakeCriteria: formState.intakeCriteria,
      publicationStatus: publicationReadiness.status,
      professionalReadiness,
    }),
    [formState, professionalReadiness, publicationReadiness.status],
  )
  const sectionReadiness = useMemo(
    () => resolveSectionReadiness(section, formState, professionalReadiness),
    [formState, professionalReadiness, section],
  )
  const readinessLayer = useMemo(
    () => resolveReadinessLayer(section, formState, professionalReadiness, publicationReadiness, publicationQuality),
    [formState, professionalReadiness, publicationQuality, publicationReadiness, section],
  )
  const trustEvidenceCandidates = useMemo(
    () => buildTrustEvidenceCandidates(officeCases, formState.trustEvidenceApprovedCaseIds),
    [formState.trustEvidenceApprovedCaseIds, officeCases],
  )

  function handleTextField(event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name } = event.target
    const value = event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
      ? event.target.checked
      : event.target.value
    setFormState((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleProfessionalDraftField(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name } = event.target
    const value = event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
      ? event.target.checked
      : event.target.value
    setProfessionalDraft((current) => ({
      ...current,
      [name]: value,
    }))
  }

  async function handleProfessionalPhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      setIsUploadingProfessionalPhoto(true)
      setError(null)
      setSuccessMessage(null)

      const [dataUrl] = await readFilesAsDataUrls([file], 1)
      if (!dataUrl) {
        throw new Error('Não foi possível ler esta imagem.')
      }

      const payload = await uploadOfficeMedia(officeId, {
        fileName: file.name,
        dataUrl,
      })

      setProfessionalDraft((current) => ({
        ...current,
        photoUrl: payload.media.url,
      }))
      setSuccessMessage('Foto do profissional enviada com sucesso.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível enviar a foto agora.')
    } finally {
      setIsUploadingProfessionalPhoto(false)
      event.target.value = ''
    }
  }

  async function handleOfficeMediaUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) {
      return
    }

    const remainingSlots = Math.max(0, 5 - formState.officeGallery.length)
    if (remainingSlots === 0) {
      setError('A galeria do escritório aceita até 5 imagens.')
      event.target.value = ''
      return
    }

    try {
      setIsUploadingMedia(true)
      setError(null)
      setSuccessMessage(null)

      const selectedFiles = Array.from(files).slice(0, remainingSlots)
      const dataUrls = await readFilesAsDataUrls(selectedFiles, remainingSlots)
      const uploadedMedia: OfficeMediaItem[] = []

      for (const [index, dataUrl] of dataUrls.entries()) {
        const file = selectedFiles[index]
        if (!file || !dataUrl) {
          continue
        }

        const payload = await uploadOfficeMedia(officeId, {
          fileName: file.name,
          dataUrl,
        })

        uploadedMedia.push(payload.media)
      }

      setFormState((current) => {
        const gallery = [
          ...current.officeGallery,
          ...uploadedMedia.map((item) => ({
            ...item,
            isCover: false,
          })),
        ].slice(0, 5)

        const hasExplicitCover = gallery.some((item) => item.isCover === true)
        return {
          ...current,
          officeGallery: gallery.map((item, index) => ({
            ...item,
            isCover: item.isCover === true || (!hasExplicitCover && index === 0),
          })),
        }
      })
      setSuccessMessage('Mídia do escritório adicionada à galeria da seção.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível enviar as imagens agora.')
    } finally {
      setIsUploadingMedia(false)
      event.target.value = ''
    }
  }

  function handleOfficeMediaMove(mediaId: string, direction: 'left' | 'right') {
    setFormState((current) => {
      const index = current.officeGallery.findIndex((item) => item.id === mediaId)
      if (index < 0) {
        return current
      }

      const nextIndex = direction === 'left' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= current.officeGallery.length) {
        return current
      }

      const gallery = [...current.officeGallery]
      const [item] = gallery.splice(index, 1)
      gallery.splice(nextIndex, 0, item)
      return {
        ...current,
        officeGallery: gallery,
      }
    })
  }

  function handleOfficeMediaSetCover(mediaId: string) {
    setFormState((current) => ({
      ...current,
      officeGallery: current.officeGallery.map((item) => ({
        ...item,
        isCover: item.id === mediaId,
      })),
    }))
  }

  function handleOfficeMediaRemove(mediaId: string) {
    setFormState((current) => {
      const gallery = current.officeGallery.filter((item) => item.id !== mediaId)
      const hasExplicitCover = gallery.some((item) => item.isCover === true)
      return {
        ...current,
        officeGallery: gallery.map((item, index) => ({
          ...item,
          isCover: item.isCover === true || (!hasExplicitCover && index === 0),
        })),
      }
    })
  }

  async function handleInstitutionalVideoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      setIsUploadingInstitutionalVideo(true)
      setError(null)
      setSuccessMessage(null)

      const [dataUrl] = await readFilesAsDataUrls([file], 1)
      if (!dataUrl) {
        throw new Error('Não foi possível ler o vídeo selecionado.')
      }

      const payload = await uploadOfficeInstitutionalVideo(officeId, {
        fileName: file.name,
        dataUrl,
      })

      setFormState((current) => ({
        ...current,
        institutionalVideoMode: 'uploaded',
        institutionalVideoUrl: payload.video.url,
      }))
      setSuccessMessage('Vídeo institucional enviado para esta seção.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível enviar o vídeo agora.')
    } finally {
      setIsUploadingInstitutionalVideo(false)
      event.target.value = ''
    }
  }

  function handleTrustEvidenceToggle(enabled: boolean) {
    setFormState((current) => ({
      ...current,
      trustEvidenceEnabled: enabled,
    }))
  }

  function handleTrustEvidenceApprovalToggle(caseId: string) {
    setFormState((current) => {
      const approved = new Set(current.trustEvidenceApprovedCaseIds)
      if (approved.has(caseId)) {
        approved.delete(caseId)
      } else {
        approved.add(caseId)
      }

      return {
        ...current,
        trustEvidenceApprovedCaseIds: Array.from(approved),
      }
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setIsSaving(true)
      setError(null)
      setSuccessMessage(null)

      const nextConfig = mapFormStateToConfig(formState)
      if (meta.scope !== 'team') {
        delete nextConfig.team
        delete nextConfig.responsibleProfessional
      }

      const payload = await saveOfficeBusinessConfig(officeId, nextConfig)
      setFormState(mapConfigToFormState(payload.businessConfig))
      setUiState('ready')
      setSuccessMessage('A seção foi atualizada com sucesso.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível salvar os ajustes agora.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleProfessionalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setIsSavingProfessional(true)
      setError(null)
      setSuccessMessage(null)
      const payload = mapDraftToProfessionalPayload(professionalDraft)

      if (editingProfessionalId) {
        await updateOfficeProfessional(officeId, editingProfessionalId, payload)
        setSuccessMessage('Profissional atualizado com sucesso.')
      } else {
        await createOfficeProfessional(officeId, payload)
        setSuccessMessage('Profissional adicionado com sucesso.')
      }

      const professionalsPayload = await listOfficeProfessionals(officeId)
      setOfficeProfessionals(professionalsPayload.professionals)
      setFormState((current) => ({
        ...current,
        teamRoster: professionalsPayload.professionals.map((professional) => [
          professional.displayName,
          professional.isResponsible ? 'Responsável visível' : '',
          professional.oabCredential ?? '',
          professional.specialties.join('; '),
        ].join(' | ').trim()).join('\n'),
      }))
      setProfessionalDraft(EMPTY_PROFESSIONAL_DRAFT)
      setEditingProfessionalId(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível salvar o profissional agora.')
    } finally {
      setIsSavingProfessional(false)
    }
  }

  async function handleProfessionalDeactivate(professionalId: string) {
    try {
      setError(null)
      setSuccessMessage(null)
      await deactivateOfficeProfessional(officeId, professionalId)
      const professionalsPayload = await listOfficeProfessionals(officeId)
      setOfficeProfessionals(professionalsPayload.professionals)
      setSuccessMessage('Profissional desativado com sucesso.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível desativar o profissional agora.')
    }
  }

  function startProfessionalEdit(professional: OfficeProfessional) {
    setEditingProfessionalId(professional.id)
    setProfessionalDraft(mapProfessionalToDraft(professional))
    setError(null)
    setSuccessMessage(null)
  }

  return (
    <AdminOfficeLayout
      officeId={officeId}
      section={section}
      title={meta.title}
      subtitle={meta.subtitle}
    >
      {uiState === 'loading' ? (
        <SurfaceCard tone="admin" className="admin-card">
          <FeedbackBanner>Preparando esta seção da cabine...</FeedbackBanner>
        </SurfaceCard>
      ) : null}

      {uiState === 'error' ? (
        <SurfaceCard tone="admin" className="admin-card">
          <FeedbackBanner tone="error">{error ?? 'Não foi possível abrir esta seção agora.'}</FeedbackBanner>
        </SurfaceCard>
      ) : null}

      {(uiState === 'ready' || uiState === 'empty') && section === 'visao-geral' ? (
        <SurfaceCard tone="admin" className="admin-card">
          {successMessage ? <FeedbackBanner tone="success">{successMessage}</FeedbackBanner> : null}
          {error ? <FeedbackBanner tone="error">{error}</FeedbackBanner> : null}

          <div className="admin-card-header">
            <h2>Comando da cabine</h2>
            <span>{formState.officeName.trim() || officeId}</span>
          </div>

          <p className="admin-diagnosis-copy">
            Comece por saúde, prontidão e risco. Entre nos ajustes só depois de entender o que já está pronto para operar ou publicar.
          </p>

          <div className="admin-readiness-layer admin-readiness-layer--overview">
            <div className="admin-readiness-layer__copy">
              <p className="admin-readiness-layer__eyebrow">Prontidão operacional</p>
              <h3>
                {publicationReadiness.status === 'published'
                  ? 'Seu escritório está pronto para receber clientes.'
                  : publicationReadiness.status === 'draft'
                    ? 'Existem ajustes pendentes antes da publicação.'
                    : 'A operação já existe, mas ainda falta base para abrir o perfil com segurança.'}
              </h3>
              <p>
                Veja abaixo o que está saudável, o que ainda exige atenção e onde vale agir primeiro.
              </p>
            </div>
            <div className="admin-readiness-layer__metrics">
              <article className="admin-readiness-metric admin-readiness-metric--healthy">
                <span>Publicação</span>
                <strong>{publicationReadiness.status === 'published' ? 'Pronta' : publicationReadiness.status === 'draft' ? 'Em preparo' : 'Pendente'}</strong>
              </article>
              <article className={`admin-readiness-metric admin-readiness-metric--${publicationQuality.score >= 85 ? 'healthy' : publicationQuality.score >= 65 ? 'attention' : 'risk'}`}>
                <span>Qualidade do perfil</span>
                <strong>{publicationQuality.score}/100</strong>
              </article>
              <article className={`admin-readiness-metric admin-readiness-metric--${professionalReadiness.isKnown && professionalReadiness.totalProfessionals > 0 ? 'healthy' : 'attention'}`}>
                <span>Equipe mapeada</span>
                <strong>{professionalReadiness.isKnown ? `${professionalReadiness.totalProfessionals} pessoa(s)` : 'Em verificação'}</strong>
              </article>
              <article className={`admin-readiness-metric admin-readiness-metric--${formState.responseWindowLabel.trim() || formState.avgResponseMinutes.trim() ? 'healthy' : 'risk'}`}>
                <span>Resposta inicial</span>
                <strong>{formState.responseWindowLabel.trim() || 'Pendente'}</strong>
              </article>
            </div>
          </div>

          <div className="admin-domain-grid">
            {overviewCards.map((card) => (
              <article key={card.title} className="admin-domain-card">
                <strong>{card.title}</strong>
                <p>{card.value}</p>
                <a className="admin-inline-link" href={card.actionHref}>{card.actionLabel}</a>
              </article>
            ))}
          </div>
        </SurfaceCard>
      ) : null}

      {(uiState === 'ready' || uiState === 'empty') && meta.scope ? (
        <>
          <SurfaceCard tone="admin" className="admin-card">
            <div className="admin-card-header">
              <h2>Leitura da seção</h2>
              <span>{sectionReadiness}</span>
            </div>
            <p className="admin-diagnosis-copy">
              {meta.subtitle}
            </p>
          </SurfaceCard>

          <SurfaceCard tone="admin" className="admin-card">
            <div className="admin-readiness-layer">
              <div className="admin-readiness-layer__copy">
                <p className="admin-readiness-layer__eyebrow">{readinessLayer.eyebrow}</p>
                <h3>{readinessLayer.title}</h3>
                <p>{readinessLayer.detail}</p>
              </div>
              <div className="admin-readiness-layer__metrics">
                {readinessLayer.metrics.map((metric) => (
                  <article key={metric.label} className={`admin-readiness-metric admin-readiness-metric--${metric.tone}`}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </article>
                ))}
              </div>
            </div>
            <div className="admin-readiness-next-step">
              <strong>Próximo passo recomendado</strong>
              <p>{readinessLayer.nextStep}</p>
            </div>
            {readinessLayer.risks.length > 0 ? (
              <div className="admin-readiness-risks">
                <strong>Pontos que pedem atenção agora</strong>
                <ul className="admin-diagnosis-list">
                  {readinessLayer.risks.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : (
              <div className="admin-readiness-risks admin-readiness-risks--positive">
                <strong>Leitura atual</strong>
                <p>Capacidade operacional saudável nesta seção. Se quiser, avance para refinamentos sem urgência.</p>
              </div>
            )}
          </SurfaceCard>

          {section === 'publicacao' ? (
            <SurfaceCard tone="admin" className="admin-card">
              <div className="admin-card-header">
                <h2>Status de publicação</h2>
                <span>{publicationReadiness.status}</span>
              </div>
              <div className="admin-card-header">
                <h3>Qualidade de publicação</h3>
                <StatusChip tone={resolvePublicationQualityTone(publicationQuality.score)}>
                  {publicationQuality.score}/100 - {publicationQuality.classification}
                </StatusChip>
              </div>
              <p className="admin-diagnosis-copy">
                Este indicador responde imediatamente aos ajustes de perfil, canais, cobertura, disponibilidade, triagem e mensagens públicas.
              </p>
              {publicationQuality.missingItems.length > 0 ? (
                <>
                  <p className="admin-diagnosis-copy">Itens faltantes para elevar a qualidade:</p>
                  <ul className="admin-diagnosis-list">
                    {publicationQuality.missingItems.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  <p className="admin-diagnosis-copy">Próximos passos recomendados:</p>
                  <ul className="admin-diagnosis-list">
                    {publicationQuality.nextSteps.map((step) => <li key={step}>{step}</li>)}
                  </ul>
                </>
              ) : (
                <p className="admin-diagnosis-copy">Qualidade excelente: perfil consistente e pronto para sustentar publicação em escala.</p>
              )}
              {publicationReadiness.missingItems.length > 0 ? (
                <>
                  <p className="admin-diagnosis-copy">Antes de publicar, ainda vale revisar estes pontos:</p>
                  <ul className="admin-diagnosis-list">
                    {publicationReadiness.missingItems.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </>
              ) : (
                <p className="admin-diagnosis-copy">O perfil público já tem base suficiente de cobertura, mensagens e triagem para ir ao ar com clareza.</p>
              )}
              <p className="admin-diagnosis-copy">
                {trustEvidenceCandidates.length > 0
                  ? `${trustEvidenceCandidates.filter((candidate) => candidate.approved).length} experiência(s) verificada(s) aprovada(s) para exibição pública.`
                  : 'A prova social continua silenciosa até existir feedback real e verificável de clientes.'}
              </p>
            </SurfaceCard>
          ) : null}

          {section === 'configuracoes' ? (
            <SurfaceCard tone="admin" className="admin-card">
              <div className="admin-card-header">
                <h2>Governança de setup</h2>
                <span>{officeId}</span>
              </div>
              <p className="admin-diagnosis-copy">
                Esta área cuida apenas da base do escritório. Para operar no dia a dia, use Triagem, Equipe, Cobertura e Disponibilidade. Para o que vai ao ar, use Publicação.
              </p>
            </SurfaceCard>
          ) : null}

          {section === 'publicacao' && publicationReadiness.missingItems.length === 0 ? (
            <SurfaceCard tone="admin" className="admin-card admin-card--success">
              <div className="admin-card-header">
                <h2>Pronto para publicar</h2>
                <span>Camada pública consolidada</span>
              </div>
              <p className="admin-diagnosis-copy">O escritório já transmite cobertura, triagem e expectativa de retorno com clareza suficiente para publicar.</p>
            </SurfaceCard>
          ) : null}

          {section === 'publicacao' && publicationReadiness.missingItems.length > 0 ? (
            <SurfaceCard tone="admin" className="admin-card admin-card--warning">
              <div className="admin-card-header">
                <h2>Pendências de publicação</h2>
                <span>Vale fechar antes de colocar o perfil no ar</span>
              </div>
              <ul className="admin-diagnosis-list">
                  {publicationReadiness.missingItems.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </SurfaceCard>
          ) : null}

          {section === 'equipe' ? (
            <SurfaceCard tone="admin" className="admin-card">
              <div className="admin-card-header">
                <h2>Profissionais do escritório</h2>
                <span>{officeProfessionals.length} ativo(s)</span>
              </div>
              <p className="admin-diagnosis-copy">
                A equipe operacional agora nasce em `professionals`. O perfil público e a atribuição de casos deixam de depender de `teamRoster`.
              </p>

              <div className="admin-diagnosis-grid">
                {officeProfessionals.length > 0 ? officeProfessionals.map((professional) => (
                  <article key={professional.id} className="admin-diagnosis-section admin-form-section">
                    <div className="admin-card-header">
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <div
                          aria-hidden="true"
                          style={{
                            width: '3rem',
                            height: '3rem',
                            borderRadius: '999px',
                            overflow: 'hidden',
                            display: 'grid',
                            placeItems: 'center',
                            background: 'rgba(255,255,255,0.08)',
                            color: 'inherit',
                            flexShrink: 0,
                          }}
                        >
                          {resolvePublicAssetUrl(professional.photoUrl) ? (
                            <img
                              src={resolvePublicAssetUrl(professional.photoUrl)}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <span>{buildProfessionalInitials(professional.displayName)}</span>
                          )}
                        </div>
                        <h3>{professional.displayName}</h3>
                      </div>
                      <StatusChip tone={professional.status === 'active' ? 'success' : 'warning'}>
                        {professional.status === 'active' ? 'Ativo' : 'Inativo'}
                      </StatusChip>
                    </div>
                    <p className="admin-diagnosis-copy">
                      {professional.oabCredential ?? 'OAB ainda não informada'}
                      {professional.isResponsible ? ' · Responsável visível' : ''}
                      {professional.isPublic ? ' · Público' : ' · Interno'}
                    </p>
                    <p className="admin-diagnosis-copy">
                      {professional.specialties.length > 0 ? professional.specialties.join(', ') : 'Especialidades ainda não definidas.'}
                    </p>
                    <div className="admin-actions">
                      <button type="button" className="admin-button admin-button--secondary" onClick={() => startProfessionalEdit(professional)}>
                        Editar
                      </button>
                      <button type="button" className="admin-button admin-button--ghost" onClick={() => void handleProfessionalDeactivate(professional.id)}>
                        Desativar
                      </button>
                    </div>
                  </article>
                )) : (
                  <FeedbackBanner>Nenhum profissional ativo foi cadastrado para este escritório ainda.</FeedbackBanner>
                )}
              </div>

              <form className="admin-form" onSubmit={(event) => void handleProfessionalSubmit(event)}>
                <div className="admin-card-header">
                  <h3>{editingProfessionalId ? 'Editar profissional' : 'Adicionar profissional'}</h3>
                  {editingProfessionalId ? (
                    <button
                      type="button"
                      className="admin-button admin-button--ghost"
                      onClick={() => {
                        setEditingProfessionalId(null)
                        setProfessionalDraft(EMPTY_PROFESSIONAL_DRAFT)
                      }}
                    >
                      Cancelar edição
                    </button>
                  ) : null}
                </div>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Nome</span>
                    <input name="displayName" value={professionalDraft.displayName} onChange={handleProfessionalDraftField} placeholder="Dra. Ana Silva" />
                  </label>
                  <label className="admin-field">
                    <span>OAB</span>
                    <input name="oabCredential" value={professionalDraft.oabCredential} onChange={handleProfessionalDraftField} placeholder="OAB/SP 123456" />
                  </label>
                  <label className="admin-field">
                    <span>E-mail</span>
                    <input name="email" value={professionalDraft.email} onChange={handleProfessionalDraftField} placeholder="contato@escritorio.com.br" />
                  </label>
                  <label className="admin-field">
                    <span>Telefone</span>
                    <input name="phone" value={professionalDraft.phone} onChange={handleProfessionalDraftField} placeholder="+55 11 99999-9999" />
                  </label>
                  <label className="admin-field">
                    <span>Foto pública (URL)</span>
                    <input name="photoUrl" value={professionalDraft.photoUrl} onChange={handleProfessionalDraftField} placeholder="https://..." />
                  </label>
                  <label className="admin-field">
                    <span>Especialidades (vírgula)</span>
                    <input name="specialties" value={professionalDraft.specialties} onChange={handleProfessionalDraftField} placeholder="Direito do Trabalho, Previdenciário" />
                  </label>
                </div>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Enviar foto pública</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => void handleProfessionalPhotoUpload(event)}
                      disabled={isUploadingProfessionalPhoto}
                    />
                  </label>
                  <div className="admin-field">
                    <span>Preview</span>
                    <div
                      aria-live="polite"
                      style={{
                        width: '4.5rem',
                        height: '4.5rem',
                        borderRadius: '999px',
                        overflow: 'hidden',
                        display: 'grid',
                        placeItems: 'center',
                        background: 'rgba(255,255,255,0.08)',
                        color: 'inherit',
                      }}
                    >
                      {resolvePublicAssetUrl(professionalDraft.photoUrl) ? (
                        <img
                          src={resolvePublicAssetUrl(professionalDraft.photoUrl)}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span>{buildProfessionalInitials(professionalDraft.displayName || 'BS')}</span>
                      )}
                    </div>
                  </div>
                </div>
                {professionalDraft.photoUrl ? (
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="admin-button admin-button--ghost"
                      onClick={() => setProfessionalDraft((current) => ({ ...current, photoUrl: '' }))}
                    >
                      Apagar foto
                    </button>
                  </div>
                ) : null}
                <label className="admin-field">
                  <span>Bio</span>
                  <textarea name="bio" value={professionalDraft.bio} onChange={handleProfessionalDraftField} rows={3} placeholder="Apresentação breve do profissional." />
                </label>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Status</span>
                    <select name="status" value={professionalDraft.status} onChange={handleProfessionalDraftField}>
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                      <option value="suspended">Suspenso</option>
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>
                      <input type="checkbox" name="isResponsible" checked={professionalDraft.isResponsible} onChange={handleProfessionalDraftField} />
                      {' '}Marcar como responsável visível
                    </span>
                  </label>
                  <label className="admin-field">
                    <span>
                      <input type="checkbox" name="isPublic" checked={professionalDraft.isPublic} onChange={handleProfessionalDraftField} />
                      {' '}Exibir no perfil público
                    </span>
                  </label>
                </div>
                <div className="admin-actions">
                  <button type="submit" className="admin-button" disabled={isSavingProfessional || isUploadingProfessionalPhoto}>
                    {isSavingProfessional ? 'Salvando profissional...' : editingProfessionalId ? 'Salvar profissional' : 'Adicionar profissional'}
                  </button>
                </div>
              </form>
            </SurfaceCard>
          ) : (
            <AdminBusinessConfigForm
              officeId={officeId}
              uiState={uiState}
              formState={formState}
              error={error}
              successMessage={successMessage}
              isSaving={isSaving}
              isUploadingMedia={isUploadingMedia}
              isUploadingInstitutionalVideo={isUploadingInstitutionalVideo}
              trustEvidenceCandidates={trustEvidenceCandidates}
              scope={meta.scope}
              onTextField={handleTextField}
              onOfficeMediaUpload={handleOfficeMediaUpload}
              onOfficeMediaMove={handleOfficeMediaMove}
              onOfficeMediaSetCover={handleOfficeMediaSetCover}
              onOfficeMediaRemove={handleOfficeMediaRemove}
              onInstitutionalVideoUpload={handleInstitutionalVideoUpload}
              onTrustEvidenceToggle={handleTrustEvidenceToggle}
              onTrustEvidenceApprovalToggle={handleTrustEvidenceApprovalToggle}
              onSubmit={(event) => void handleSubmit(event)}
              professionalReadinessSnapshot={professionalReadiness}
            />
          )}
        </>
      ) : null}
    </AdminOfficeLayout>
  )
}
