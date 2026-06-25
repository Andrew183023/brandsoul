import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import brandsoulLogo from '../assets/brandsoul-logo-original.jpeg'
import PublicShell from '../app/shells/PublicShell'
import {
  PublicOfficeInteractionApiError,
  requestPublicEntityInteraction,
  requestPublicOfficeInteraction,
} from '../backend-bridge/api/publicEntityInteractionApi'
import {
  getOfficeTrustEvidence,
  getOfficePublicProfessionals,
  getOfficePublicPresenceLoadResult,
  PublicOfficePresenceApiError,
  type PublicOfficeProfessional,
  type OfficeTrustEvidenceItem,
} from '../backend-bridge/api/publicEntityApi'
import {
  getOfficeBusinessConfig,
  getUnifiedPublicOfficeProfile,
  type PublicOfficeBusinessConfig,
} from '../backend-bridge/api/publicOfficeBusinessConfigApi'
import {
  getOfficeSocialState,
  registerOfficeSignal,
  type PublicOfficeSocialState,
} from '../backend-bridge/api/publicSocialApi'
import type { PublicEntityDecisionResponse } from '../backend-bridge/contracts/PublicEntityDecisionResponse'
import type { PublicPresenceResponse } from '../domain/entity/contracts/PublicPresenceResponse'
import type { BrandSoulVisualRuntimePatch } from '../domain/rendering/contracts/BrandSoulVisualRuntimePatch'
import { LEGAL_ROUTES } from '../app/routes/legalRoutes'
import { Modal } from '../design-system'
import { Skeleton } from '../lib/designSystem'
import {
  buildCanonicalInteractionBusinessContext,
  projectCanonicalOfficeData,
} from '../lib/canonicalOfficeData'
import { buildProfessionalReadinessSnapshot } from '../lib/professionalReadiness'
import { resolvePublicAssetUrl } from '../lib/publicAssetUrl'
import { useAuthSession } from '../lib/session'
import PublicPresencePage from './public-presence/PublicPresencePage'
import {
  resolveDegradedResponse,
  type PublicPresenceDegradedResponse,
} from './public-presence/brandSoulPresenceRuntime'
import type { PublicPresenceCognitiveIndicator } from './public-presence/services/deriveCognitivePresenceIndicator'
import '../styles/entityPublicPage.css'

type OfficeProfilePageProps = {
  officeId: string
}

type RuntimeMode = 'normal' | 'fallback' | 'degraded' | 'unavailable'
type PresenceLoadState = 'loading' | 'ready' | 'degraded' | 'unavailable' | 'retry-manually'
type Confidence = 'confirmed' | 'estimated' | 'unavailable'

type ContactChannel = {
  id: string
  label: string
  value: string
  href?: string
  confidence: Confidence
}

type ReadinessIndicator = {
  label: string
  value: string
  confidence: Confidence
}

type TimelineItem = {
  label: string
  detail: string
  tone: 'neutral' | 'confirmed' | 'attention'
}

type OperationalPresenceSignal = {
  label: string
  value: string
  detail: string
  tone: 'confirmed' | 'attention' | 'neutral'
}

type ResponsibleProfessional = {
  photoUrl?: string
  fullName: string
  oabCredential?: string
  specialties: string[]
  yearsOfExperience?: number
  shortBio?: string
}

type PublicProfessional = PublicOfficeProfessional

type OfficeGalleryItem = {
  id: string
  url: string
  isCover?: boolean
}

type InstitutionalVideo = {
  mode: 'external' | 'uploaded'
  provider?: 'youtube' | 'vimeo' | 'upload'
  url: string
  title?: string
  intro?: string
}

type TrustEvidenceItem = OfficeTrustEvidenceItem

type IntakeStepId = 'situation' | 'urgency' | 'objective' | 'contact' | 'review'

type IntakeUrgency = 'critical' | 'priority' | 'planned'

type IntakeDraft = {
  situation: string
  urgency: IntakeUrgency | ''
  objective: string
  contact: string
}

type IntakeSubmissionState =
  | { status: 'idle' }
  | {
      status: 'success'
      message: string
      responseWindowLabel: string
      contactLabel: string
      caseId?: string
    }
  | {
      status: 'error'
      title: string
      message: string
      contactHref?: string
      contactLabel?: string
    }

type IntakeStep = {
  id: IntakeStepId
  title: string
  why: string
  next: string
}

const INTAKE_STEPS: IntakeStep[] = [
  {
    id: 'situation',
    title: 'Contexto inicial',
    why: 'Entender o quadro principal evita retrabalho e reduz ansiedade na triagem.',
    next: 'Na próxima etapa você define a urgência percebida.',
  },
  {
    id: 'urgency',
    title: 'Urgência',
    why: 'A urgência ajuda o escritório a priorizar a análise e informar o tempo de resposta.',
    next: 'Na próxima etapa você define o objetivo da triagem.',
  },
  {
    id: 'objective',
    title: 'Objetivo',
    why: 'Um objetivo claro acelera o encaminhamento inicial para o escritório.',
    next: 'Na próxima etapa você confirma o canal de contato.',
  },
  {
    id: 'contact',
    title: 'Preferencia de contato',
    why: 'Definir um canal reduz interrupcoes e melhora previsibilidade do retorno.',
    next: 'Na revisão final você envia o resumo com um clique.',
  },
  {
    id: 'review',
    title: 'Revisão e envio',
    why: 'A revisão final garante uma decisão por etapa e evita inconsistências.',
    next: 'Depois do envio, mostramos expectativa de continuidade.',
  },
]

const EMPTY_INTAKE_DRAFT: IntakeDraft = {
  situation: '',
  urgency: '',
  objective: '',
  contact: '',
}

const PUBLIC_PRESENCE_RETRY_POLICY = {
  maxAttempts: 3,
  baseBackoffMs: 350,
  maxBackoffMs: 1_800,
  multiplier: 2,
} as const

type HeadTagDescriptor = {
  selector: string
  tagName: 'meta' | 'link'
  attributes: Record<string, string>
}

type OfficeSeoPayload = {
  title: string
  description: string
  canonicalUrl: string
  imageUrl: string
  legalServiceJsonLd: Record<string, unknown>
  faqJsonLd: Record<string, unknown>
  breadcrumbJsonLd: Record<string, unknown>
  localBusinessJsonLd: Record<string, unknown>
}

function trimAndCollapseWhitespace(value: string | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function truncateSeoDescription(value: string, minLength = 120, maxLength = 160) {
  const normalized = trimAndCollapseWhitespace(value)
  if (normalized.length < minLength) {
    return normalized
  }
  if (normalized.length <= maxLength) {
    return normalized
  }

  const truncated = normalized.slice(0, maxLength - 1)
  const lastSentenceBreak = Math.max(truncated.lastIndexOf('. '), truncated.lastIndexOf('; '), truncated.lastIndexOf(', '))
  if (lastSentenceBreak >= minLength - 1) {
    return `${truncated.slice(0, lastSentenceBreak).trimEnd()}.`
  }

  const lastWordBreak = truncated.lastIndexOf(' ')
  const safeSlice = lastWordBreak >= minLength - 1 ? truncated.slice(0, lastWordBreak) : truncated
  return `${safeSlice.trimEnd()}...`
}

function toAbsoluteUrl(value: string, origin: string) {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value
  }

  return `${origin}${value.startsWith('/') ? value : `/${value}`}`
}

function formatPrimaryAreaForSeo(value: string | undefined) {
  const normalized = trimAndCollapseWhitespace(value)
  if (!normalized) {
    return 'Advogado'
  }

  if (normalized.startsWith('Direito ')) {
    return `Advogado ${normalized.slice('Direito '.length)}`
  }

  return normalized
}

function buildOfficeSeoPayload(args: {
  officeId: string
  officeName: string
  primaryArea?: string
  primaryCity?: string
  institutionalDescription?: string
  legalAreas: string[]
  servedCities: string[]
  address?: string
  phone?: string
  email?: string
  imageUrl?: string
  responseWindowLabel?: string
  availabilityLabel?: string
  canonicalTagline?: string
  origin: string
}) {
  const officeName = trimAndCollapseWhitespace(args.officeName) || 'Escritório jurídico'
  const primaryArea = formatPrimaryAreaForSeo(args.primaryArea || args.legalAreas[0])
  const primaryCity = trimAndCollapseWhitespace(args.primaryCity) || trimAndCollapseWhitespace(args.servedCities[0])
  const title = primaryCity
    ? `${officeName} | ${primaryArea} em ${primaryCity}`
    : `${officeName} | ${primaryArea}`
  const descriptionSource = [
    trimAndCollapseWhitespace(args.institutionalDescription) || trimAndCollapseWhitespace(args.canonicalTagline),
    args.legalAreas.length > 0 ? `Atuação em ${args.legalAreas.slice(0, 3).join(', ')}.` : undefined,
    args.servedCities.length > 0 ? `Atende ${args.servedCities.slice(0, 3).join(', ')}.` : undefined,
  ].filter(Boolean).join(' ')
  const fallbackDescription = `${officeName} recebe triagem jurídica inicial com informações públicas sobre atuação, cidades atendidas e primeiro contato.`
  const description = truncateSeoDescription(
    descriptionSource.length >= 120 ? descriptionSource : `${descriptionSource} ${fallbackDescription}`.trim() || fallbackDescription,
  )
  const canonicalUrl = `${args.origin}${LEGAL_ROUTES.public.escritorioPerfil(args.officeId)}`
  const imageUrl = toAbsoluteUrl(args.imageUrl || brandsoulLogo, args.origin)

  const legalServiceJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    name: officeName,
    serviceType: args.legalAreas,
    areaServed: args.servedCities,
    url: canonicalUrl,
  }
  if (args.address) {
    legalServiceJsonLd.address = args.address
  }
  if (args.phone) {
    legalServiceJsonLd.telephone = args.phone
  }
  if (args.email) {
    legalServiceJsonLd.email = args.email
  }
  if (imageUrl) {
    legalServiceJsonLd.image = imageUrl
  }

  const faqJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Como esse escritório atua?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: trimAndCollapseWhitespace(args.institutionalDescription)
            || trimAndCollapseWhitespace(args.canonicalTagline)
            || `${officeName} mantém perfil público para triagem inicial e retorno jurídico organizado.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Quais áreas jurídicas este escritório atende?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: args.legalAreas.length > 0
            ? `Atuação principal em ${args.legalAreas.join(', ')}.`
            : 'As áreas jurídicas ainda estão sendo atualizadas neste perfil público.',
        },
      },
      {
        '@type': 'Question',
        name: 'Como funciona o primeiro contato?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: trimAndCollapseWhitespace([args.availabilityLabel, args.responseWindowLabel].filter(Boolean).join('. '))
            || 'A triagem pública organiza o primeiro contato e o escritório responde pelo canal informado neste perfil.',
        },
      },
      {
        '@type': 'Question',
        name: 'Em quais cidades este escritório atende?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: args.servedCities.length > 0
            ? `Atendimento informado para ${args.servedCities.join(', ')}.`
            : 'A cobertura regional ainda está sendo atualizada neste perfil público.',
        },
      },
    ],
  }

  const breadcrumbJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Escritórios',
        item: `${args.origin}/escritorios`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: officeName,
        item: canonicalUrl,
      },
    ],
  }

  const localBusinessJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: officeName,
    url: canonicalUrl,
    image: imageUrl,
    areaServed: args.servedCities,
  }
  if (args.phone) {
    localBusinessJsonLd.telephone = args.phone
  }
  if (args.email) {
    localBusinessJsonLd.email = args.email
  }
  if (args.address) {
    localBusinessJsonLd.address = {
      '@type': 'PostalAddress',
      streetAddress: args.address,
    }
  }

  return {
    title,
    description,
    canonicalUrl,
    imageUrl,
    legalServiceJsonLd,
    faqJsonLd,
    breadcrumbJsonLd,
    localBusinessJsonLd,
  } satisfies OfficeSeoPayload
}

function upsertHeadTag(descriptor: HeadTagDescriptor) {
  const existing = document.head.querySelector(descriptor.selector)
  const element = existing instanceof HTMLElement
    ? existing
    : document.createElement(descriptor.tagName)

  for (const [attribute, value] of Object.entries(descriptor.attributes)) {
    element.setAttribute(attribute, value)
  }

  if (!existing) {
    document.head.appendChild(element)
  }
}

function upsertStructuredData(id: string, payload: Record<string, unknown>) {
  const selector = `script[data-office-seo="${id}"]`
  const existing = document.head.querySelector(selector)
  const script = existing instanceof HTMLScriptElement
    ? existing
    : document.createElement('script')

  script.type = 'application/ld+json'
  script.setAttribute('data-office-seo', id)
  script.textContent = JSON.stringify(payload)

  if (!existing) {
    document.head.appendChild(script)
  }
}

function parseRuntimeModeFromUrl(): RuntimeMode {
  const mode = new URLSearchParams(window.location.search).get('mode')
  if (mode === 'fallback' || mode === 'degraded' || mode === 'unavailable') {
    return mode
  }

  return 'normal'
}

function computePresenceRetryBackoffMs(nextAttemptIndex: number) {
  const exponential = PUBLIC_PRESENCE_RETRY_POLICY.baseBackoffMs * (PUBLIC_PRESENCE_RETRY_POLICY.multiplier ** nextAttemptIndex)
  return Math.min(exponential, PUBLIC_PRESENCE_RETRY_POLICY.maxBackoffMs)
}

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

function shouldRetryPublicPresenceLoad(error: unknown) {
  if (!(error instanceof PublicOfficePresenceApiError)) {
    return true
  }

  if (typeof error.status !== 'number') {
    return true
  }

  return error.status >= 500 || error.status === 429 || error.status === 408
}

function buildPublicPresenceLoadErrorMessage(error: unknown) {
  if (error instanceof PublicOfficePresenceApiError) {
    if (error.status === 404) {
      return 'Não encontramos o perfil público deste escritório.'
    }

    return error.message || 'Não foi possível carregar o perfil público agora.'
  }

  return 'Não foi possível carregar o perfil público agora.'
}

function resolveIntakeStorageKey(officeId: string) {
  return `brandsoul:intake:draft:${officeId}`
}

function resolveIntakeUrgencyLabel(value: IntakeUrgency | '') {
  if (value === 'critical') return 'Crítica (0-24h)'
  if (value === 'priority') return 'Prioritária (24-72h)'
  if (value === 'planned') return 'Planejada (3-7 dias)'
  return 'Não informado'
}

function buildIntakeNarrative(draft: IntakeDraft) {
  return [
    'Triagem jurídica:',
    `- Contexto: ${draft.situation.trim()}`,
    `- Urgência: ${resolveIntakeUrgencyLabel(draft.urgency)}`,
    `- Objetivo: ${draft.objective.trim()}`,
    `- Contato preferencial: ${draft.contact.trim()}`,
  ].join('\n')
}

function buildStructuredTriageRequest(args: {
  draft: IntakeDraft
  officeName?: string
  practiceArea?: string
  city?: string
  responseWindowLabel?: string
  operatingHours?: string
  intakeCriteria?: string
  priorityRules?: string
}) {
  return {
    userMessage: buildIntakeNarrative(args.draft),
    triage: {
      context: args.draft.situation.trim(),
      urgency: args.draft.urgency || 'planned',
      objective: args.draft.objective.trim(),
      contactPreference: 'Contato preferencial',
      contactValue: args.draft.contact.trim(),
      practiceArea: args.practiceArea,
      city: args.city,
    },
    businessContext: {
      businessType: 'legal' as const,
      officeName: args.officeName,
      legalAreas: args.practiceArea ? [args.practiceArea] : undefined,
      servedCities: args.city ? [args.city] : undefined,
      intake: {
        intakeCriteria: args.intakeCriteria,
        priorityRules: args.priorityRules,
      },
      availability: {
        responseWindowLabel: args.responseWindowLabel,
        operatingHours: args.operatingHours,
      },
      publicationStatus: 'published' as const,
    },
  }
}

function buildPublicInteractionFallbackMessage() {
  return 'Não conseguimos confirmar uma resposta completa agora. Você pode tentar novamente em alguns instantes ou seguir com as informações já visíveis no perfil.'
}

function buildPublicTriageFailureMessage(error: unknown) {
  if (error instanceof PublicOfficeInteractionApiError) {
    if (error.status === 404) {
      return 'Este escritório não está disponível para receber triagem agora.'
    }

    if (error.status === 400) {
      return 'Revise as informações da triagem antes de enviar novamente.'
    }

    if (error.status === 409 || error.status === 422) {
      return 'Não foi possível enviar sua triagem para este escritório agora.'
    }

    if (error.status >= 500) {
      return 'Não conseguimos enviar sua triagem agora.'
    }

    return error.message || 'Não conseguimos enviar sua triagem agora.'
  }

  return 'Não conseguimos enviar sua triagem agora.'
}

function parseIntakeDraft(raw: string | null): { stepIndex: number; draft: IntakeDraft } | undefined {
  if (!raw) {
    return undefined
  }

  try {
    const parsed = JSON.parse(raw) as {
      stepIndex?: number
      draft?: Partial<IntakeDraft>
    }

    const safeStepIndex = typeof parsed.stepIndex === 'number' && parsed.stepIndex >= 0
      ? Math.min(parsed.stepIndex, INTAKE_STEPS.length - 1)
      : 0

    return {
      stepIndex: safeStepIndex,
      draft: {
        situation: typeof parsed.draft?.situation === 'string' ? parsed.draft.situation : '',
        urgency: parsed.draft?.urgency === 'critical' || parsed.draft?.urgency === 'priority' || parsed.draft?.urgency === 'planned'
          ? parsed.draft.urgency
          : '',
        objective: typeof parsed.draft?.objective === 'string' ? parsed.draft.objective : '',
        contact: typeof parsed.draft?.contact === 'string' ? parsed.draft.contact : '',
      },
    }
  } catch {
    return undefined
  }
}

function createPublicShadowRequestId() {
  return `public-shadow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeDecisionLabel(value: string) {
  return value.replace(/[-_]+/g, ' ')
}

function buildBackendDrivenCognitiveIndicator(
  response: PublicEntityDecisionResponse,
): PublicPresenceCognitiveIndicator | undefined {
  const indicator = response.decision.updatedPresenceIndicators?.cognitiveIndicator
  if (!indicator) {
    return undefined
  }

  return {
    presenceLabel: indicator.summary,
    intentLabel: normalizeDecisionLabel(response.decision.decision.intent),
    actionLabel: normalizeDecisionLabel(response.decision.decision.action),
  }
}

function applyBackendPresenceIndicators(
  presence: PublicPresenceResponse,
  indicators: PublicEntityDecisionResponse['decision']['updatedPresenceIndicators'] | undefined,
): PublicPresenceResponse {
  if (!indicators) {
    return presence
  }

  return {
    ...presence,
    visual: {
      ...presence.visual,
      intensity:
        typeof indicators.presenceIntensity === 'number'
          ? indicators.presenceIntensity
          : presence.visual.intensity,
    },
    relational: {
      ...presence.relational,
      relationshipLabel: indicators.relationshipLabel ?? presence.relational.relationshipLabel,
    },
  }
}

function shouldUseFrontendFallback(error: unknown) {
  if (!(error instanceof PublicOfficeInteractionApiError)) {
    return true
  }

  return (
    error.status >= 500 ||
    error.code === 'PUBLIC_INTERACTION_DISABLED' ||
    error.code === 'PUBLIC_INTERACTION_UNAVAILABLE'
  )
}

function resolveFrontendFallbackReason(
  result:
    | { status: 'resolved'; value: PublicEntityDecisionResponse }
    | { status: 'rejected'; error: unknown }
    | { status: 'timeout' },
) {
  if (result.status === 'timeout') {
    return 'backend-timeout'
  }

  if (result.status === 'rejected') {
    if (result.error instanceof PublicOfficeInteractionApiError) {
      return result.error.reason ?? result.error.code ?? `backend-status-${result.error.status}`
    }

    return 'backend-network-error'
  }

  return 'backend-authoritative'
}

function buildOfficialDecisionDebugSummary(
  response: PublicEntityDecisionResponse,
): PublicEntityDecisionResponse['decision']['debugSummary'] {
  return {
    fallbackUsed: response.decision.debugSummary?.fallbackUsed ?? response.fallback.occurred,
    fallbackReason: response.decision.debugSummary?.fallbackReason ?? response.fallback.reason,
    terminalReason:
      response.decision.debugSummary?.terminalReason ?? 'backend-decision-used',
    dominantReason:
      response.decision.debugSummary?.dominantReason ??
      `backend decision used (${response.decision.decision.intent}/${response.decision.decision.action})`,
    authorityShift:
      response.decision.debugSummary?.authorityShift ?? response.decision.terminalAuthority,
    safeMode: response.decision.debugSummary?.safeMode ?? response.decision.semanticFrozen,
  }
}

function settleWithinBudget<T>(
  promise: Promise<T>,
  budgetMs: number,
): Promise<
  | { status: 'resolved'; value: T }
  | { status: 'rejected'; error: unknown }
  | { status: 'timeout' }
> {
  return new Promise((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) {
        return
      }

      settled = true
      resolve({ status: 'timeout' })
    }, budgetMs)

    void promise
      .then((value) => {
        if (settled) {
          return
        }

        settled = true
        window.clearTimeout(timer)
        resolve({ status: 'resolved', value })
      })
      .catch((error: unknown) => {
        if (settled) {
          return
        }

        settled = true
        window.clearTimeout(timer)
        resolve({ status: 'rejected', error })
      })
  })
}

function buildWhatsAppHref(value?: string, entityName?: string) {
  if (!value) {
    return undefined
  }

  const digits = value.replace(/\D+/g, '')
  if (!digits) {
    return undefined
  }

  const text = entityName
    ? `Ola, preciso falar com ${entityName}.`
    : 'Olá, preciso de ajuda jurídica.'
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function buildPhoneHref(value?: string) {
  if (!value) {
    return undefined
  }

  const digits = value.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : undefined
}

function resolveOfficeSpecialties(config?: PublicOfficeBusinessConfig) {
  const legalAreas = (config?.legalAreas ?? [])
    .map((area) => area.trim())
    .filter((area) => area.length > 0)

  if (legalAreas.length > 0) {
    return legalAreas.slice(0, 6)
  }

  return ['Escopo jurídico não informado']
}

function resolveCoverageList(config?: PublicOfficeBusinessConfig) {
  const cities = (config?.servedCities ?? [])
    .map((city) => city.trim())
    .filter((city) => city.length > 0)
  const address = config?.channels?.address?.trim()

  const confirmedCoverage = [
    ...cities,
    ...(address ? [address] : []),
  ]

  if (confirmedCoverage.length > 0) {
    return confirmedCoverage.slice(0, 6).map((label) => ({
      label,
      confidence: 'confirmed' as Confidence,
    }))
  }

  return [{ label: 'Cobertura jurídica não informada', confidence: 'estimated' as Confidence }]
}

function resolveContactChannels(
  config: PublicOfficeBusinessConfig | undefined,
  entityName: string,
): ContactChannel[] {
  const whatsappHref = buildWhatsAppHref(config?.channels?.whatsapp, entityName)
  const phoneHref = buildPhoneHref(config?.channels?.phone)

  const channels: ContactChannel[] = []

  if (config?.channels?.whatsapp && whatsappHref) {
    channels.push({
      id: 'whatsapp',
      label: 'WhatsApp',
      value: config.channels.whatsapp,
      href: whatsappHref,
      confidence: 'confirmed',
    })
  }

  if (config?.channels?.phone && phoneHref) {
    channels.push({
      id: 'phone',
      label: 'Telefone',
      value: config.channels.phone,
      href: phoneHref,
      confidence: 'confirmed',
    })
  }

  if (config?.channels?.email) {
    channels.push({
      id: 'email',
      label: 'E-mail',
      value: config.channels.email,
      href: `mailto:${config.channels.email}`,
      confidence: 'confirmed',
    })
  }

  if (channels.length > 0) {
    return channels
  }

  return [
    {
      id: 'fallback',
      label: 'Contato em validação',
      value: 'Use a triagem para contato seguro',
      confidence: 'estimated',
    },
  ]
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className={`office-confidence office-confidence--${confidence}`}>{confidence}</span>
}

function TrustRibbon() {
  return (
    <div className="office-trust-ribbon" role="status" aria-live="polite">
      Plataforma organiza transparência e triagem. Escritório executa atendimento jurídico.
    </div>
  )
}

function HeaderTrustHighlights(props: {
  responsible?: ResponsibleProfessional
  cities: string[]
}) {
  const { responsible, cities } = props
  const compactCities = cities
    .map((city) => city.trim())
    .filter((city) => city.length > 0)
    .slice(0, 2)

  const items = [
    responsible?.fullName,
    responsible?.oabCredential,
    compactCities.length > 0 ? `Atende ${compactCities.join(' e ')}` : undefined,
  ].filter((item): item is string => Boolean(item && item.trim().length > 0))

  if (items.length === 0) {
    return null
  }

  return (
    <div className="office-profile-header__trust-highlights" aria-label="Sinais de confiança acima da dobra">
      {items.map((item) => (
        <span key={item} className="office-profile-header__trust-pill">{item}</span>
      ))}
    </div>
  )
}

function StateBanner(props: {
  tone: 'info' | 'warning' | 'danger'
  title: string
  happened?: string
  impact: string
  continuity: string
  nextStep?: string
  expectedTimeLabel?: string
  primaryLabel: string
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
}) {
  const {
    tone,
    title,
    happened,
    impact,
    continuity,
    nextStep,
    expectedTimeLabel,
    primaryLabel,
    onPrimary,
    secondaryLabel,
    onSecondary,
  } = props

  return (
    <section className={`office-state-banner office-state-banner--${tone}`}>
      <strong>{title}</strong>
      <p>O que aconteceu: {happened ?? title}</p>
      <p>O que muda agora: {impact}</p>
      <p>O que continua funcionando: {continuity}</p>
      <p>Como seguir: {nextStep ?? 'Você pode seguir com segurança pelas ações abaixo.'}</p>
      <p>O que esperar: {expectedTimeLabel ?? 'Atualização em breve.'}</p>
      <p className="office-state-banner__recovery">Seu contexto segue preservado. Se quiser, você pode pedir uma nova leitura quando fizer sentido.</p>
      <div className="office-state-banner__actions">
        <button type="button" className="office-button office-button--primary" onClick={onPrimary}>{primaryLabel}</button>
        {secondaryLabel && onSecondary ? (
          <button type="button" className="office-button office-button--secondary" onClick={onSecondary}>{secondaryLabel}</button>
        ) : null}
      </div>
    </section>
  )
}

function ProfileLoadingSkeleton() {
  return (
    <section className="office-loading-shell" role="status" aria-live="polite" aria-busy="true">
      <article className="office-state-banner office-state-banner--info">
        <strong>Carregando perfil do escritório</strong>
        <p>O que muda agora: os dados deste perfil ainda estão sendo organizados.</p>
        <p>O que continua funcionando: sua descoberta permanece preservada durante a carga.</p>
      </article>

      <article className="office-loading-card">
        <Skeleton height="1.35rem" width="38%" />
        <Skeleton height="2.1rem" width="62%" />
        <Skeleton height="0.95rem" width="74%" />
      </article>

      <section className="office-loading-grid" aria-label="Carregando seções principais">
        <article className="office-loading-card">
          <Skeleton height="1.05rem" width="44%" />
          <Skeleton height="3.8rem" />
        </article>
        <article className="office-loading-card">
          <Skeleton height="1.05rem" width="44%" />
          <Skeleton height="3.8rem" />
        </article>
      </section>

      <article className="office-loading-card" aria-label="Carregando triagem progressiva">
        <Skeleton height="1.1rem" width="30%" />
        <Skeleton height="0.9rem" width="56%" />
        <Skeleton height="7rem" />
      </article>
    </section>
  )
}

function buildFallbackState() {
  return {
    title: 'O perfil continua disponível enquanto atualizamos algumas informações',
    impact: 'Parte das informações deste perfil está em atualização.',
    continuity: 'Disponibilidade, contato e triagem continuam visíveis.',
  }
}

function buildDegradedState() {
  return {
    title: 'Disponibilidade com atualização em andamento',
    impact: 'Nem todos os indicadores estão confirmados em tempo real.',
    continuity: 'Dados confirmados seguem visíveis para decisão segura.',
  }
}

function buildUnavailableState() {
  return {
    title: 'Perfil temporariamente indisponível',
    impact: 'Não foi possível recuperar os dados públicos do escritório neste momento.',
    continuity: 'Você pode voltar para a busca e continuar sua jornada.',
  }
}

function resolveResponsibleCredibilityStatement(responsible: ResponsibleProfessional) {
  if (responsible.shortBio?.trim()) {
    return responsible.shortBio.trim()
  }

  if (responsible.yearsOfExperience && responsible.yearsOfExperience > 0) {
    return `Atuação jurídica com ${responsible.yearsOfExperience} ${responsible.yearsOfExperience === 1 ? 'ano' : 'anos'} de experiência no acompanhamento de clientes.`
  }

  return 'Atuação jurídica focada em orientação clara, triagem responsável e acompanhamento próximo dos clientes.'
}

function resolveResponsibleRoleLabel(responsible: ResponsibleProfessional) {
  if (/^dra\./i.test(responsible.fullName.trim())) {
    return 'Advogada responsável pelo primeiro atendimento'
  }

  if (/^dr\./i.test(responsible.fullName.trim())) {
    return 'Advogado responsável pelo primeiro atendimento'
  }

  return 'Responsável pelo primeiro atendimento'
}

function ResponsibleProfessionalCard({ responsible }: { responsible: ResponsibleProfessional }) {
  const credibilityStatement = resolveResponsibleCredibilityStatement(responsible)
  const roleLabel = resolveResponsibleRoleLabel(responsible)
  const photoUrl = resolvePublicAssetUrl(responsible.photoUrl)
  const [photoFailed, setPhotoFailed] = useState(false)

  return (
    <section className="office-responsible-card" aria-label="Responsável jurídico visível">
      <div className="office-responsible-card__photo" aria-hidden="true">
        {photoUrl && !photoFailed ? (
          <img src={photoUrl} alt="" onError={() => setPhotoFailed(true)} />
        ) : (
          <span>{responsible.fullName.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="office-responsible-card__body">
        <p className="office-responsible-card__eyebrow">Responsável jurídico visível</p>
        <div className="office-responsible-card__identity">
          <h2>{responsible.fullName}</h2>
          <p className="office-responsible-card__role">{roleLabel}</p>
        </div>
        {responsible.oabCredential ? <p className="office-responsible-card__oab">{responsible.oabCredential}</p> : null}
        {responsible.specialties.length > 0 ? (
          <ul className="office-responsible-card__specialties" aria-label="Especialidades do responsável">
            {responsible.specialties.map((specialty) => (
              <li key={specialty}>{specialty}</li>
            ))}
          </ul>
        ) : null}
        {responsible.yearsOfExperience ? (
          <p className="office-responsible-card__experience">{responsible.yearsOfExperience} anos de atuação informados pelo escritório</p>
        ) : null}
        <p className="office-responsible-card__statement">{credibilityStatement}</p>
      </div>
    </section>
  )
}

function TrustEvidenceSection({ items }: { items: TrustEvidenceItem[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="office-trust-evidence" aria-labelledby="office-trust-evidence-title">
      <div className="office-block-heading">
        <p>Experiências verificadas</p>
        <h2 id="office-trust-evidence-title">Feedback real de clientes atendidos</h2>
      </div>
      <p className="office-trust-evidence__intro">
        Estes relatos só aparecem quando existe atendimento real encerrado na plataforma e aprovação explícita do escritório.
      </p>
      <div className="office-trust-evidence__list">
        {items.map((item) => (
          <article key={item.caseId} className="office-trust-evidence__item">
            <div className="office-trust-evidence__meta">
              <strong>{item.firstName ? `${item.firstName} · ` : ''}{item.serviceType ?? 'Atendimento jurídico'}</strong>
              <span>{item.rating}/5</span>
            </div>
            <p>{item.review}</p>
            <small>{item.city ? `${item.city} · ` : ''}Interação verificada</small>
          </article>
        ))}
      </div>
    </section>
  )
}

function OfficeGallery({ items }: { items: OfficeGalleryItem[] }) {
  const [failedIds, setFailedIds] = useState<string[]>([])
  const validItems = items
    .map((item) => ({
      ...item,
      resolvedUrl: resolvePublicAssetUrl(item.url),
    }))
    .filter((item): item is OfficeGalleryItem & { resolvedUrl: string } => Boolean(item.resolvedUrl))
    .filter((item) => !failedIds.includes(item.id))
  const cover = validItems.find((item) => item.isCover) ?? validItems[0]

  if (!cover) {
    return null
  }

  return (
    <section className="office-gallery" aria-label="Ambiente do escritório">
      <figure className="office-gallery__cover">
        <img
          src={cover.resolvedUrl}
          alt="Imagem principal do escritório"
          onError={() => setFailedIds((current) => (current.includes(cover.id) ? current : [...current, cover.id]))}
        />
      </figure>
      {validItems.length > 1 ? (
        <div className="office-gallery__carousel" aria-label="Galeria do escritório">
          {validItems.map((item, index) => {
            return (
              <figure key={item.id} className={`office-gallery__thumb ${item.isCover ? 'office-gallery__thumb--cover' : ''}`}>
                <img
                  src={item.resolvedUrl}
                  alt={`Imagem institucional ${index + 1} do escritório`}
                  onError={() => setFailedIds((current) => (current.includes(item.id) ? current : [...current, item.id]))}
                />
              </figure>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

function resolveYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace(/^\/+/, '') || undefined
    }

    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v') ?? undefined
    }
  } catch {
    return undefined
  }

  return undefined
}

function resolveVimeoVideoId(url: string) {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('vimeo.com')) {
      return undefined
    }

    const segments = parsed.pathname.split('/').filter(Boolean)
    return segments[segments.length - 1] || undefined
  } catch {
    return undefined
  }

  return undefined
}

function resolveInstitutionalVideoEmbedUrl(video: InstitutionalVideo) {
  const youtubeId = resolveYouTubeVideoId(video.url)
  if (youtubeId) {
    return `https://www.youtube.com/embed/${youtubeId}`
  }

  const vimeoId = resolveVimeoVideoId(video.url)
  if (vimeoId) {
    return `https://player.vimeo.com/video/${vimeoId}`
  }

  return undefined
}

function resolveInstitutionalVideoThumbnail(video: InstitutionalVideo) {
  const youtubeId = resolveYouTubeVideoId(video.url)
  if (youtubeId) {
    return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
  }

  return undefined
}

function InstitutionalVideoSection({
  video,
  onOpen,
}: {
  video: InstitutionalVideo
  onOpen: () => void
}) {
  const videoUrl = resolvePublicAssetUrl(video.url)
  const thumbnailUrl = resolveInstitutionalVideoThumbnail(video)
  const title = video.title ?? 'Conheça nosso escritório'
  const intro = video.intro ?? 'Uma apresentação breve para mostrar quem atende, como o escritório trabalha e como pode ajudar.'

  return (
    <section className="office-video-section" aria-label="Apresentação humana do escritório">
      <div className="office-video-section__copy">
        <p className="office-video-section__eyebrow">Apresentação humana</p>
        <h2>{title}</h2>
        <p>{intro}</p>
      </div>
      <button type="button" className="office-video-card" onClick={onOpen} aria-label={`Assistir: ${title}`}>
        {video.mode === 'uploaded' && videoUrl ? (
          <video className="office-video-card__media" src={videoUrl} muted playsInline preload="metadata" />
        ) : thumbnailUrl ? (
          <img className="office-video-card__media" src={thumbnailUrl} alt="" />
        ) : (
          <div className="office-video-card__fallback">
            <span>{video.provider === 'vimeo' ? 'Vimeo' : 'Vídeo institucional'}</span>
          </div>
        )}
        <span className="office-video-card__play" aria-hidden="true">Assistir</span>
      </button>
    </section>
  )
}

function resolveReadinessIndicators(args: {
  specialties: string[]
  coverage: Array<{ label: string; confidence: Confidence }>
  contacts: ContactChannel[]
  availabilityLabel: string
  availabilityConfidence: Confidence
  responseWindowLabel: string
}) {
  const { specialties, coverage, contacts, availabilityLabel, availabilityConfidence, responseWindowLabel } = args
  return [
    {
      label: 'Cobertura visível',
      value: coverage[0]?.label ?? 'Não informada',
      confidence: coverage[0]?.confidence ?? 'estimated',
    },
    {
      label: 'Disponibilidade informada',
      value: availabilityLabel,
      confidence: availabilityConfidence,
    },
    {
      label: 'Janela de resposta',
      value: responseWindowLabel,
      confidence: availabilityConfidence === 'unavailable' ? 'estimated' : availabilityConfidence,
    },
    {
      label: 'Canal principal',
      value: contacts[0]?.label ?? 'Triagem pública',
      confidence: contacts[0]?.confidence ?? 'estimated',
    },
    {
      label: 'Frentes jurídicas',
      value: `${specialties.length} área(s) ativa(s)`,
      confidence: specialties[0] === 'Escopo jurídico não informado' ? 'estimated' : 'confirmed',
    },
  ] satisfies ReadinessIndicator[]
}

function resolveOperationalTimeline(args: {
  runtimeMode: RuntimeMode
  intakeExpectationLabel: string
  availabilityLabel: string
  responseWindowLabel: string
}) {
  const { runtimeMode, intakeExpectationLabel, availabilityLabel, responseWindowLabel } = args
  const tone = runtimeMode === 'degraded' || runtimeMode === 'fallback'
    ? 'attention'
    : runtimeMode === 'unavailable'
      ? 'attention'
      : 'confirmed'

  return [
    {
      label: 'Informações do perfil',
      detail: 'Cobertura, canais e informações públicas aparecem antes da triagem.',
      tone: 'confirmed',
    },
    {
      label: 'Disponibilidade informada',
      detail: `${availabilityLabel}.`,
      tone,
    },
    {
      label: 'Resposta inicial',
      detail: responseWindowLabel,
      tone,
    },
    {
      label: 'Triagem disponível',
      detail: intakeExpectationLabel,
      tone: 'neutral',
    },
  ] satisfies TimelineItem[]
}

function formatOperationalTimestamp(value?: string) {
  if (!value) {
    return 'Sem atualização recente visível'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Atualização recente registrada'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed)
}

function resolveOperationalPresenceSignals(args: {
  runtimeMode: RuntimeMode
  socialState?: PublicOfficeSocialState
  availabilityLabel: string
  responseWindowLabel: string
  coverage: Array<{ label: string; confidence: Confidence }>
  intakeExpectationLabel: string
}) {
  const { runtimeMode, socialState, availabilityLabel, responseWindowLabel, coverage, intakeExpectationLabel } = args
  const signalTone = runtimeMode === 'normal' ? 'confirmed' : runtimeMode === 'unavailable' ? 'attention' : 'neutral'
  const recentActivityLabel = socialState?.aggregate.lastSignalAt
    ? `Atualizado em ${formatOperationalTimestamp(socialState.aggregate.lastSignalAt)}`
    : 'Informações disponíveis agora'
  const recentActivityDetail = socialState?.aggregate.lastSignalAt
    ? 'Sinais públicos recentes reforçam a atividade deste escritório.'
    : 'O perfil segue disponível mesmo sem um horário recente exibido.'
  const coverageConfirmed = coverage.filter((item) => item.confidence === 'confirmed').length

  return [
    {
      label: 'Atualização recente',
      value: recentActivityLabel,
      detail: recentActivityDetail,
      tone: signalTone,
    },
    {
      label: 'Resposta esperada',
      value: responseWindowLabel,
      detail: `Disponibilidade atual: ${availabilityLabel}.`,
      tone: signalTone,
    },
    {
      label: 'Cobertura confirmada',
      value: coverageConfirmed > 0 ? `${coverageConfirmed} ponto(s) confirmado(s)` : 'Cobertura em atualização',
      detail: coverage[0]?.label ?? 'Cobertura pública em atualização.',
      tone: coverageConfirmed > 0 ? 'confirmed' : 'neutral',
    },
    {
      label: 'Triagem disponível',
      value: 'Fluxo disponível',
      detail: intakeExpectationLabel,
      tone: runtimeMode === 'unavailable' ? 'attention' : 'neutral',
    },
  ] satisfies OperationalPresenceSignal[]
}

function ProgressMeta(props: {
  currentStep: number
  totalSteps: number
  expectationLabel: string
  isRecoveredDraft: boolean
}) {
  const { currentStep, totalSteps, expectationLabel, isRecoveredDraft } = props
  const ratio = Math.max(0, Math.min(100, Math.round((currentStep / totalSteps) * 100)))

  return (
    <section className="office-intake-progress-meta" aria-live="polite">
      <div className="office-intake-progress-meta__row">
        <strong>Etapa {currentStep} de {totalSteps}</strong>
        <span>{ratio}% concluído</span>
      </div>
      <div className="office-intake-progress-meta__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio}>
        <span style={{ width: `${ratio}%` }} />
      </div>
      <p className="office-intake-progress-meta__expectation">Expectativa de retorno: {expectationLabel}</p>
      {isRecoveredDraft ? (
        <p className="office-intake-progress-meta__recovery">Rascunho recuperado automaticamente após interrupção.</p>
      ) : null}
    </section>
  )
}

function IntakeStepper(props: {
  currentStepIndex: number
  steps: IntakeStep[]
}) {
  return (
    <ol className="office-intake-stepper" aria-label="Etapas da triagem">
      {props.steps.map((step, index) => {
        const isDone = index < props.currentStepIndex
        const isCurrent = index === props.currentStepIndex
        return (
          <li key={step.id} className={[isDone ? 'is-done' : '', isCurrent ? 'is-current' : ''].filter(Boolean).join(' ')}>
            <span>{index + 1}</span>
            <strong>{step.title}</strong>
          </li>
        )
      })}
    </ol>
  )
}

function QuestionBlock(props: {
  title: string
  why: string
  next: string
  children: ReactNode
}) {
  return (
    <section className="office-intake-question-block">
      <h3>{props.title}</h3>
      <p className="office-intake-question-block__why">Por que perguntamos: {props.why}</p>
      <div className="office-intake-question-block__control">{props.children}</div>
      <p className="office-intake-question-block__next">Próximo passo: {props.next}</p>
    </section>
  )
}

function UrgencySelector(props: {
  value: IntakeUrgency | ''
  onChange: (value: IntakeUrgency) => void
}) {
  return (
    <fieldset className="office-intake-urgency-selector">
      <legend>Selecione uma urgência</legend>
      <label>
        <input type="radio" name="urgency" value="critical" checked={props.value === 'critical'} onChange={() => props.onChange('critical')} />
        Crítica (0-24h)
      </label>
      <label>
        <input type="radio" name="urgency" value="priority" checked={props.value === 'priority'} onChange={() => props.onChange('priority')} />
        Prioritária (24-72h)
      </label>
      <label>
        <input type="radio" name="urgency" value="planned" checked={props.value === 'planned'} onChange={() => props.onChange('planned')} />
        Planejada (3-7 dias)
      </label>
    </fieldset>
  )
}

function ReviewSubmitPanel(props: {
  draft: IntakeDraft
  onSubmit: () => void
  onBack: () => void
  submitting: boolean
  submitError?: Extract<IntakeSubmissionState, { status: 'error' }>
}) {
  const { draft, onSubmit, onBack, submitting, submitError } = props

  return (
    <section className="office-intake-review-panel">
      <h3>Revisão final</h3>
      <ul>
        <li><strong>Contexto:</strong> {draft.situation || 'Não informado'}</li>
        <li><strong>Urgência:</strong> {resolveIntakeUrgencyLabel(draft.urgency)}</li>
        <li><strong>Objetivo:</strong> {draft.objective || 'Não informado'}</li>
        <li><strong>Contato:</strong> {draft.contact || 'Não informado'}</li>
      </ul>
      <div className="office-intake-review-panel__actions">
        <button type="button" className="office-button office-button--secondary" onClick={onBack}>Editar etapa anterior</button>
        <button type="button" className="office-button office-button--primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Enviando triagem...' : submitError ? 'Tentar enviar novamente' : 'Enviar triagem'}
        </button>
      </div>
      {submitError ? (
        <section className="office-intake-post-submit office-intake-post-submit--error" aria-live="polite">
          <h3>{submitError.title}</h3>
          <p>{submitError.message}</p>
          {submitError.contactLabel ? (
            submitError.contactHref ? (
              <a
                className="office-button office-button--ghost"
                href={submitError.contactHref}
                target={submitError.contactHref.startsWith('http') ? '_blank' : undefined}
                rel={submitError.contactHref.startsWith('http') ? 'noreferrer' : undefined}
              >
                Usar canal de contato do escritório
              </a>
            ) : (
              <button
                type="button"
                className="office-button office-button--ghost"
                onClick={() =>
                  document
                    .getElementById('office-public-contact')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                Usar canal de contato do escritório
              </button>
            )
          ) : null}
        </section>
      ) : null}
    </section>
  )
}

function PublicProfessionalsSection({ professionals }: { professionals: PublicProfessional[] }) {
  if (professionals.length === 0) {
    return null
  }

  return (
    <section className="office-public-team" aria-labelledby="office-public-team-title">
      <div className="office-block-heading">
        <p>Equipe visível</p>
        <h2 id="office-public-team-title">Outros profissionais apresentados neste perfil</h2>
      </div>
      <div className="office-public-team__list">
        {professionals.map((professional) => (
          <article key={professional.id} className="office-public-team__item">
            <strong>{professional.fullName}</strong>
            {professional.oabCredential ? <p>{professional.oabCredential}</p> : null}
            {professional.specialties.length > 0 ? <p>{professional.specialties.join(', ')}</p> : null}
            {professional.bio ? <small>{professional.bio}</small> : null}
          </article>
        ))}
      </div>
    </section>
  )
}

function PostSubmitExpectation(props: {
  submissionState: Extract<IntakeSubmissionState, { status: 'success' }>
}) {
  const { submissionState } = props
  return (
    <section className="office-intake-post-submit" aria-live="polite">
      <h3>Triagem enviada com sucesso.</h3>
      <p>{submissionState.message}</p>
      <p className="office-intake-post-submit__response">Prazo informado para o primeiro retorno: {submissionState.responseWindowLabel}.</p>
      <p className="office-intake-post-submit__response">Canal principal informado: {submissionState.contactLabel}.</p>
    </section>
  )
}

function HeroMetric(props: { label: string; value: string; detail: string }) {
  return (
    <article className="office-hero-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <p>{props.detail}</p>
    </article>
  )
}

function OperationalPresenceLayer(props: { signals: OperationalPresenceSignal[] }) {
  return (
    <section className="office-operational-presence" aria-label="Sinais operacionais">
      {props.signals.map((signal) => (
        <article key={`${signal.label}-${signal.value}`} className={`office-operational-presence__card office-operational-presence__card--${signal.tone}`}>
          <span>{signal.label}</span>
          <strong>{signal.value}</strong>
          <p>{signal.detail}</p>
        </article>
      ))}
    </section>
  )
}

function NarrativeList(props: { items: string[] }) {
  return (
    <ul className="office-narrative-list">
      {props.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export default function OfficeProfilePage({ officeId }: OfficeProfilePageProps) {
  const authSession = useAuthSession()
  const [presence, setPresence] = useState<PublicPresenceResponse | undefined>(undefined)
  const [businessConfig, setBusinessConfig] = useState<PublicOfficeBusinessConfig | undefined>(undefined)
  const [responsibleProfessionalProjection, setResponsibleProfessionalProjection] = useState<ResponsibleProfessional | undefined>(undefined)
  const [publicProfessionals, setPublicProfessionals] = useState<PublicProfessional[]>([])
  const [socialState, setSocialState] = useState<PublicOfficeSocialState | undefined>(undefined)
  const [trustEvidence, setTrustEvidence] = useState<TrustEvidenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isReloading, setIsReloading] = useState(false)
  const [loadState, setLoadState] = useState<PresenceLoadState>('loading')
  const [manualRetryRequired, setManualRetryRequired] = useState(false)
  const [loadRetryCount, setLoadRetryCount] = useState(0)
  const [error, setError] = useState<string | undefined>(undefined)
  const [actionError, setActionError] = useState<string | undefined>(undefined)
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState<string | undefined>(undefined)
  const [cognitiveIndicator, setCognitiveIndicator] = useState<PublicPresenceCognitiveIndicator | undefined>(undefined)
  const [visualRuntimePatch, setVisualRuntimePatch] = useState<BrandSoulVisualRuntimePatch | undefined>(undefined)
  const [officialDecisionDebugSummary, setOfficialDecisionDebugSummary] = useState<PublicEntityDecisionResponse['decision']['debugSummary'] | undefined>(undefined)
  const [operationalFallbackReason, setOperationalFallbackReason] = useState<string | undefined>(undefined)
  const [operationalFallbackContract, setOperationalFallbackContract] = useState<PublicPresenceDegradedResponse | undefined>(undefined)
  const [legalCaseState, setLegalCaseState] = useState<PublicEntityDecisionResponse['actionResult'] | undefined>(undefined)
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'shared'>('idle')
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(parseRuntimeModeFromUrl())
  const [isInstitutionalVideoOpen, setIsInstitutionalVideoOpen] = useState(false)
  const [intakeDraft, setIntakeDraft] = useState<IntakeDraft>(EMPTY_INTAKE_DRAFT)
  const [intakeStepIndex, setIntakeStepIndex] = useState(0)
  const [intakeDraftRecovered, setIntakeDraftRecovered] = useState(false)
  const [intakeSubmitting, setIntakeSubmitting] = useState(false)
  const [intakeSubmissionState, setIntakeSubmissionState] = useState<IntakeSubmissionState>({ status: 'idle' })
  const [showFloatingTriageCta, setShowFloatingTriageCta] = useState(false)
  const showVisualDebug = import.meta.env.DEV || new URLSearchParams(window.location.search).has('presenceDebug')
  const publicPresenceMemorySessionId = `public-presence:${officeId}:tenant:${authSession?.tenant.id ?? 'public'}:user:${authSession?.user.id ?? 'anonymous'}`

  const loadEntityProfile = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) {
      setLoading(true)
    } else {
      setIsReloading(true)
    }

    setError(undefined)
    setManualRetryRequired(false)
    if (showSkeleton) {
      setLoadState('loading')
    }

    let presenceResult: Awaited<ReturnType<typeof getOfficePublicPresenceLoadResult>> | undefined
    let lastLoadError: unknown
    const unifiedProfile = await getUnifiedPublicOfficeProfile(officeId).catch(() => undefined)

    if (unifiedProfile?.presence) {
      presenceResult = {
        status: 'ready',
        presence: unifiedProfile.presence,
      }
      setLoadRetryCount(0)
    } else {
      for (let attempt = 0; attempt < PUBLIC_PRESENCE_RETRY_POLICY.maxAttempts; attempt += 1) {
        try {
          setLoadRetryCount(attempt)
          presenceResult = await getOfficePublicPresenceLoadResult(officeId)
          break
        } catch (error) {
          lastLoadError = error

          const canRetry = shouldRetryPublicPresenceLoad(error)
          const hasRemainingAttempts = attempt < PUBLIC_PRESENCE_RETRY_POLICY.maxAttempts - 1
          if (!canRetry || !hasRemainingAttempts) {
            break
          }

          await sleep(computePresenceRetryBackoffMs(attempt))
        }
      }
    }

    if (!presenceResult) {
      setError(buildPublicPresenceLoadErrorMessage(lastLoadError))
      setManualRetryRequired(true)
      setLoadState('retry-manually')
      setRuntimeMode('unavailable')
      setLoading(false)
      setIsReloading(false)
      return
    }

    const shouldLoadLegacyProfessionals = !unifiedProfile
      || (typeof unifiedProfile.responsible === 'undefined' && unifiedProfile.professionals.length === 0)
    const shouldLoadLegacyTrustEvidence = !unifiedProfile

    const [legacyBusinessConfig, nextSocialState, legacyTrustEvidence, legacyProfessionalsProjection] = await Promise.all([
      typeof unifiedProfile?.businessConfig === 'undefined'
        ? getOfficeBusinessConfig(officeId).catch(() => undefined)
        : Promise.resolve(undefined),
      getOfficeSocialState(officeId).catch(() => undefined),
      shouldLoadLegacyTrustEvidence
        ? getOfficeTrustEvidence(officeId).catch(() => [])
        : Promise.resolve([]),
      shouldLoadLegacyProfessionals
        ? getOfficePublicProfessionals(officeId).catch(() => undefined)
        : Promise.resolve(undefined),
    ])

    const nextBusinessConfig = unifiedProfile?.businessConfig ?? legacyBusinessConfig
    const nextTrustEvidence = unifiedProfile
      ? unifiedProfile.socialProof
      : legacyTrustEvidence
    const nextProfessionalsProjection = {
      responsible: unifiedProfile?.responsible ?? legacyProfessionalsProjection?.responsible,
      professionals: unifiedProfile?.professionals.length
        ? unifiedProfile.professionals
        : legacyProfessionalsProjection?.professionals ?? [],
    }

    if (import.meta.env.DEV) {
      console.info('office-public-unified-profile-loaded', {
        hasBusinessConfig: typeof unifiedProfile?.businessConfig !== 'undefined',
        hasPresence: typeof unifiedProfile?.presence !== 'undefined',
        hasResponsible: typeof unifiedProfile?.responsible !== 'undefined',
        professionalsCount: unifiedProfile?.professionals.length ?? 0,
        socialProofCount: unifiedProfile?.socialProof.length ?? 0,
      })
    }

    void registerOfficeSignal({
      officeId,
      type: 'viewed',
      source: 'office-profile-page',
      weight: 0.22,
    }).catch(() => undefined)

    setPresence(presenceResult.presence)
    setBusinessConfig(nextBusinessConfig)
    setResponsibleProfessionalProjection(nextProfessionalsProjection?.responsible
      ? {
        photoUrl: nextProfessionalsProjection.responsible.photoUrl,
        fullName: nextProfessionalsProjection.responsible.fullName,
        oabCredential: nextProfessionalsProjection.responsible.oabCredential,
        specialties: nextProfessionalsProjection.responsible.specialties,
        shortBio: nextProfessionalsProjection.responsible.bio,
      }
      : undefined)
    setPublicProfessionals(nextProfessionalsProjection?.professionals ?? [])
    setSocialState(nextSocialState)
    setTrustEvidence(nextTrustEvidence)
    setCognitiveIndicator(undefined)
    setVisualRuntimePatch(undefined)
    setOfficialDecisionDebugSummary(undefined)
    setOperationalFallbackReason(undefined)
    setOperationalFallbackContract(undefined)
    setLegalCaseState(undefined)
    setResponse(undefined)
    setLoadState('ready')
    setRuntimeMode(parseRuntimeModeFromUrl())
    setManualRetryRequired(false)

    setLoading(false)
    setIsReloading(false)
  }, [officeId])

  useEffect(() => {
    void loadEntityProfile(true)
  }, [loadEntityProfile])

  useEffect(() => {
    if (operationalFallbackReason) {
      setRuntimeMode('degraded')
    }
  }, [operationalFallbackReason])

  useEffect(() => {
    const parsed = parseIntakeDraft(window.localStorage.getItem(resolveIntakeStorageKey(officeId)))
    if (!parsed) {
      setIntakeDraft(EMPTY_INTAKE_DRAFT)
      setIntakeStepIndex(0)
      setIntakeDraftRecovered(false)
      return
    }

    setIntakeDraft(parsed.draft)
    setIntakeStepIndex(parsed.stepIndex)
    setIntakeDraftRecovered(true)
  }, [officeId])

  useEffect(() => {
    const payload = {
      stepIndex: intakeStepIndex,
      draft: intakeDraft,
      updatedAt: Date.now(),
    }
    window.localStorage.setItem(resolveIntakeStorageKey(officeId), JSON.stringify(payload))
  }, [officeId, intakeDraft, intakeStepIndex])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const syncFloatingTriageCta = () => {
      setShowFloatingTriageCta(window.scrollY > 360)
    }

    syncFloatingTriageCta()
    window.addEventListener('scroll', syncFloatingTriageCta, { passive: true })

    return () => {
      window.removeEventListener('scroll', syncFloatingTriageCta)
    }
  }, [])

  const specialties = useMemo(
    () => resolveOfficeSpecialties(businessConfig),
    [businessConfig],
  )
  const professionalReadiness = useMemo(
    () => buildProfessionalReadinessSnapshot([
      ...(responsibleProfessionalProjection ? [{
        displayName: responsibleProfessionalProjection.fullName,
        photoUrl: responsibleProfessionalProjection.photoUrl,
        oabCredential: responsibleProfessionalProjection.oabCredential,
        specialties: responsibleProfessionalProjection.specialties,
        bio: responsibleProfessionalProjection.shortBio,
        isResponsible: true,
        isPublic: true,
        status: 'active' as const,
      }] : []),
      ...publicProfessionals.map((professional) => ({
        displayName: professional.fullName,
        photoUrl: professional.photoUrl,
        oabCredential: professional.oabCredential,
        specialties: professional.specialties,
        bio: professional.bio,
        isResponsible: false,
        isPublic: true,
        status: 'active' as const,
      })),
    ]),
    [publicProfessionals, responsibleProfessionalProjection],
  )
  const canonicalProjection = useMemo(
    () => projectCanonicalOfficeData({
      officeId,
      businessConfig,
      professionalReadinessSnapshot: professionalReadiness,
      legacyProfile: businessConfig as unknown as { catalog?: unknown; services?: unknown },
      presenceName: presence?.entity.name,
    }),
    [businessConfig, officeId, presence?.entity.name, professionalReadiness],
  )
  const coverage = useMemo(
    () => resolveCoverageList(businessConfig),
    [businessConfig],
  )
  const contacts = useMemo(
    () => resolveContactChannels(businessConfig, presence?.entity.name ?? 'escritório'),
    [businessConfig, presence?.entity.name],
  )
  const responsibleProfessional = responsibleProfessionalProjection
  const officeGallery = canonicalProjection.profile.officeGallery
  const institutionalVideo = canonicalProjection.profile.institutionalVideo
  const institutionalVideoUrl = resolvePublicAssetUrl(institutionalVideo?.url) ?? institutionalVideo?.url
  const primaryCoverageLabel = coverage[0]?.label ?? 'Cobertura informada no perfil'
  const servedCities = useMemo(
    () => (businessConfig?.servedCities ?? [])
      .map((city) => city.trim())
      .filter((city) => city.length > 0),
    [businessConfig?.servedCities],
  )

  const scrollToTriage = useCallback(() => {
    document
      .getElementById('office-public-triagem')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const availabilityConfidence: Confidence = useMemo(() => {
    if (runtimeMode === 'degraded' || runtimeMode === 'fallback') {
      return 'estimated'
    }

    if (runtimeMode === 'unavailable') {
      return 'unavailable'
    }

    return 'confirmed'
  }, [runtimeMode])

  const availabilityLabel =
    availabilityConfidence === 'confirmed'
      ? canonicalProjection.operational.availabilityLabel
      : availabilityConfidence === 'estimated'
        ? 'Disponibilidade estimada'
        : 'Disponibilidade indisponível'

  const availabilityDetails = canonicalProjection.operational.availabilityDetails
  const intakeExpectationLabel = canonicalProjection.operational.intakeExpectationLabel

  const readinessIndicators = useMemo(
    () => resolveReadinessIndicators({
      specialties,
      coverage,
      contacts,
      availabilityLabel,
      availabilityConfidence,
      responseWindowLabel: canonicalProjection.operational.responseWindowLabel,
    }),
    [availabilityConfidence, availabilityLabel, canonicalProjection.operational.responseWindowLabel, contacts, coverage, specialties],
  )
  const operationalTimeline = useMemo(
    () => resolveOperationalTimeline({
      runtimeMode,
      intakeExpectationLabel,
      availabilityLabel,
      responseWindowLabel: canonicalProjection.operational.responseWindowLabel,
    }),
    [availabilityLabel, canonicalProjection.operational.responseWindowLabel, intakeExpectationLabel, runtimeMode],
  )
  const operationalPresenceSignals = useMemo(
    () => resolveOperationalPresenceSignals({
      runtimeMode,
      socialState,
      availabilityLabel,
      responseWindowLabel: canonicalProjection.operational.responseWindowLabel,
      coverage,
      intakeExpectationLabel,
    }),
    [availabilityLabel, canonicalProjection.operational.responseWindowLabel, coverage, intakeExpectationLabel, runtimeMode, socialState],
  )
  const seoPayload = useMemo(() => {
    if (typeof window === 'undefined' || !presence) {
      return null
    }

    const publicImageUrl = resolvePublicAssetUrl(
      officeGallery.find((item) => item.isCover)?.url
      ?? officeGallery[0]?.url
      ?? responsibleProfessionalProjection?.photoUrl,
    ) ?? undefined

    return buildOfficeSeoPayload({
      officeId,
      officeName: presence.entity.name,
      primaryArea: specialties[0],
      primaryCity: coverage[0]?.label,
      institutionalDescription: canonicalProjection.profile.institutionalDescription,
      legalAreas: specialties,
      servedCities: coverage.map((item) => item.label),
      address: businessConfig?.channels?.address,
      phone: businessConfig?.channels?.phone ?? businessConfig?.channels?.whatsapp,
      email: businessConfig?.channels?.email,
      imageUrl: publicImageUrl,
      responseWindowLabel: canonicalProjection.operational.responseWindowLabel,
      availabilityLabel,
      canonicalTagline: presence.entity.tagline,
      origin: window.location.origin,
    })
  }, [
    availabilityLabel,
    businessConfig,
    canonicalProjection.operational.responseWindowLabel,
    canonicalProjection.profile.institutionalDescription,
    coverage,
    officeGallery,
    officeId,
    presence,
    responsibleProfessionalProjection?.photoUrl,
    specialties,
  ])

  useEffect(() => {
    if (!seoPayload) {
      return
    }

    document.title = seoPayload.title

    const headTags: HeadTagDescriptor[] = [
      {
        selector: 'meta[name="description"]',
        tagName: 'meta',
        attributes: { name: 'description', content: seoPayload.description },
      },
      {
        selector: 'link[rel="canonical"]',
        tagName: 'link',
        attributes: { rel: 'canonical', href: seoPayload.canonicalUrl },
      },
      {
        selector: 'meta[property="og:title"]',
        tagName: 'meta',
        attributes: { property: 'og:title', content: seoPayload.title },
      },
      {
        selector: 'meta[property="og:description"]',
        tagName: 'meta',
        attributes: { property: 'og:description', content: seoPayload.description },
      },
      {
        selector: 'meta[property="og:image"]',
        tagName: 'meta',
        attributes: { property: 'og:image', content: seoPayload.imageUrl },
      },
      {
        selector: 'meta[property="og:type"]',
        tagName: 'meta',
        attributes: { property: 'og:type', content: 'website' },
      },
      {
        selector: 'meta[property="og:url"]',
        tagName: 'meta',
        attributes: { property: 'og:url', content: seoPayload.canonicalUrl },
      },
      {
        selector: 'meta[name="twitter:card"]',
        tagName: 'meta',
        attributes: { name: 'twitter:card', content: 'summary_large_image' },
      },
      {
        selector: 'meta[name="twitter:title"]',
        tagName: 'meta',
        attributes: { name: 'twitter:title', content: seoPayload.title },
      },
      {
        selector: 'meta[name="twitter:description"]',
        tagName: 'meta',
        attributes: { name: 'twitter:description', content: seoPayload.description },
      },
      {
        selector: 'meta[name="twitter:image"]',
        tagName: 'meta',
        attributes: { name: 'twitter:image', content: seoPayload.imageUrl },
      },
    ]

    headTags.forEach(upsertHeadTag)
    upsertStructuredData('legal-service', seoPayload.legalServiceJsonLd)
    upsertStructuredData('faq', seoPayload.faqJsonLd)
    upsertStructuredData('breadcrumb', seoPayload.breadcrumbJsonLd)
    upsertStructuredData('local-business', seoPayload.localBusinessJsonLd)
  }, [seoPayload])

  const handleFollow = async () => {
    if (!presence || socialState?.viewerState.followed) {
      return
    }

    if (!authSession) {
      setActionError('Entre na sua conta para salvar esse acompanhamento com seguranca.')
      return
    }

    setActionError(undefined)
    await registerOfficeSignal({
      officeId,
      type: 'followed',
      source: 'office-profile-page',
      weight: 0.78,
    })

    const nextSocialState = await getOfficeSocialState(officeId)
    if (!nextSocialState) {
      setActionError('Não foi possível registrar esse acompanhamento agora.')
      return
    }
    setSocialState(nextSocialState)
  }

  const handleShare = async () => {
    if (!presence) {
      return
    }

    const shareUrl = `${window.location.origin}${LEGAL_ROUTES.public.escritorioPerfil(officeId)}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: presence.entity.name,
          text: presence.entity.tagline ?? 'Perfil público do escritório.',
          url: shareUrl,
        })
        setShareState('shared')
      } else {
        await navigator.clipboard.writeText(shareUrl)
        setShareState('copied')
      }
    } catch {
      return
    }

    if (authSession) {
      setActionError(undefined)
      await registerOfficeSignal({
        officeId,
        type: 'shared',
        source: 'office-profile-page',
        weight: 0.68,
      })

      const nextSocialState = await getOfficeSocialState(officeId)
      if (nextSocialState) {
        setSocialState(nextSocialState)
      }
    }
  }

  const handleSendMessage = async (messageOverride?: string) => {
    if (!presence) {
      return
    }

    const cleanMessage = (messageOverride ?? message).trim()
    if (!cleanMessage) {
      setResponse(`${presence.entity.name} vai receber seu contexto assim que você enviar uma mensagem mais completa.`)
      return
    }

    const requestId = createPublicShadowRequestId()
    const backendBudgetMs = 1_200
    const businessContext = buildCanonicalInteractionBusinessContext(canonicalProjection)
    const backendAttempt = await settleWithinBudget(
      requestPublicEntityInteraction({
        entityId: officeId,
        request: {
          requestId,
          userMessage: cleanMessage,
          businessContext,
          context: {
            sessionId: publicPresenceMemorySessionId,
            allowDebug: showVisualDebug,
            clientRenderVersion: 'office-profile-page-profile-phase',
          },
        },
      }),
      backendBudgetMs,
    )

    if (backendAttempt.status === 'resolved') {
      const backendDecision = backendAttempt.value
      console.info('[OfficeProfilePage] backend decision used', {
        officeId,
        requestId,
        decisionSource: backendDecision.decision.decisionSource,
        terminalAuthority: backendDecision.decision.terminalAuthority,
        semanticFrozen: backendDecision.decision.semanticFrozen,
        intent: backendDecision.decision.decision.intent,
        action: backendDecision.decision.decision.action,
      })
      setPresence((currentPresence) =>
        currentPresence
          ? applyBackendPresenceIndicators(
              currentPresence,
              backendDecision.decision.updatedPresenceIndicators,
            )
          : currentPresence,
      )
      setResponse(backendDecision.decision.responseText)
      setCognitiveIndicator(buildBackendDrivenCognitiveIndicator(backendDecision))
      setVisualRuntimePatch(backendDecision.decision.visualPatch?.runtimePatch)
      setOfficialDecisionDebugSummary(buildOfficialDecisionDebugSummary(backendDecision))
      setOperationalFallbackReason(undefined)
      setOperationalFallbackContract(undefined)
      setLegalCaseState(backendDecision.actionResult)
      setActionError(undefined)
      return
    }

    if (backendAttempt.status === 'rejected' && !shouldUseFrontendFallback(backendAttempt.error)) {
      setActionError('Não foi possível concluir essa interação agora.')
      return
    }

    const fallbackReason = resolveFrontendFallbackReason(backendAttempt)
    console.warn('[OfficeProfilePage] local fallback used', {
      officeId,
      requestId,
      fallbackReason,
      backendStatus: backendAttempt.status,
    })

    const degradedResponse = resolveDegradedResponse({
      fallbackReason,
    })

    setCognitiveIndicator(undefined)
    setVisualRuntimePatch(undefined)
    setOfficialDecisionDebugSummary(undefined)
    setOperationalFallbackReason(`${degradedResponse.source}:${degradedResponse.fallbackReason}`)
    setOperationalFallbackContract(degradedResponse)
    setLegalCaseState(undefined)
    setResponse(buildPublicInteractionFallbackMessage())
    setActionError(undefined)
  }

  const currentIntakeStep = INTAKE_STEPS[intakeStepIndex] ?? INTAKE_STEPS[0]
  const intakeCanAdvance =
    (currentIntakeStep.id === 'situation' && intakeDraft.situation.trim().length > 0) ||
    (currentIntakeStep.id === 'urgency' && intakeDraft.urgency.length > 0) ||
    (currentIntakeStep.id === 'objective' && intakeDraft.objective.trim().length > 0) ||
    (currentIntakeStep.id === 'contact' && intakeDraft.contact.trim().length > 0) ||
    currentIntakeStep.id === 'review'
  const intakeMobilePrimaryLabel = currentIntakeStep.id === 'review'
    ? (intakeSubmitting ? 'Enviando triagem...' : 'Enviar triagem')
    : 'Continuar triagem'
  const intakeMobilePrimaryDisabled = currentIntakeStep.id === 'review'
    ? intakeSubmitting
    : !intakeCanAdvance

  function goToNextIntakeStep() {
    if (!intakeCanAdvance) {
      return
    }

    setIntakeSubmissionState({ status: 'idle' })
    setIntakeStepIndex((current) => Math.min(current + 1, INTAKE_STEPS.length - 1))
    setIntakeDraftRecovered(false)
  }

  function goToPreviousIntakeStep() {
    setIntakeSubmissionState({ status: 'idle' })
    setIntakeStepIndex((current) => Math.max(current - 1, 0))
  }

  async function submitIntake() {
    if (intakeSubmitting) {
      return
    }

    setIntakeSubmitting(true)
    setIntakeSubmissionState({ status: 'idle' })
    const payload = buildStructuredTriageRequest({
      draft: intakeDraft,
      officeName: businessConfig?.officeName ?? presence?.entity.name,
      practiceArea: specialties[0],
      city: coverage[0]?.label,
      responseWindowLabel: canonicalProjection.operational.responseWindowLabel,
      operatingHours: businessConfig?.operatingHours,
      intakeCriteria: businessConfig?.triagePolicies?.intakeCriteria,
      priorityRules: businessConfig?.triagePolicies?.priorityRules,
    })
    setMessage(payload.userMessage)

    const contactOption = contacts[0]

    try {
      const triageResponse = await requestPublicOfficeInteraction({
        officeId,
        request: {
          requestId: createPublicShadowRequestId(),
          ...payload,
          context: {
            sessionId: publicPresenceMemorySessionId,
            allowDebug: showVisualDebug,
            clientRenderVersion: 'office-profile-page-triage-submit',
          },
        },
      })

      setResponse(undefined)
      setCognitiveIndicator(undefined)
      setVisualRuntimePatch(undefined)
      setOfficialDecisionDebugSummary(undefined)
      setOperationalFallbackReason(undefined)
      setOperationalFallbackContract(undefined)
      setLegalCaseState(triageResponse.actionResult)
      setActionError(undefined)
      setIntakeDraftRecovered(false)
      setIntakeSubmissionState({
        status: 'success',
        message: 'Agora o escritório recebeu suas informações iniciais para avaliar o próximo passo.',
        responseWindowLabel: canonicalProjection.operational.responseWindowLabel,
        contactLabel: contactOption ? `${contactOption.label}: ${contactOption.value}` : 'Triagem inicial pela plataforma',
        caseId: triageResponse.actionResult?.caseId,
      })
      window.localStorage.removeItem(resolveIntakeStorageKey(officeId))
    } catch (error) {
      setLegalCaseState(undefined)
      setIntakeSubmissionState({
        status: 'error',
        title: 'Não conseguimos enviar sua triagem agora.',
        message: `${buildPublicTriageFailureMessage(error)} Você pode tentar novamente em alguns instantes ou usar o canal informado no perfil.`,
        contactHref: contactOption?.href,
        contactLabel: contactOption ? `${contactOption.label}: ${contactOption.value}` : undefined,
      })
    }

    setIntakeSubmitting(false)
  }

  function handleIntakeMobilePrimaryAction() {
    if (currentIntakeStep.id === 'review') {
      void submitIntake()
      return
    }

    goToNextIntakeStep()
  }

  if (loading) {
    return (
      <PublicShell isAuthenticated={Boolean(authSession)}>
        <section className="office-profile-page" aria-label="Perfil público do escritório">
          <ProfileLoadingSkeleton />
        </section>
      </PublicShell>
    )
  }

  if (!presence || loadState === 'unavailable' || loadState === 'retry-manually' || error) {
    const unavailable = buildUnavailableState()

    return (
      <PublicShell isAuthenticated={Boolean(authSession)}>
        <section className="office-profile-page" aria-label="Perfil público do escritório indisponível">
          <StateBanner
            tone="danger"
            title={unavailable.title}
            happened="O perfil não foi carregado nesta tentativa."
            impact={unavailable.impact}
            continuity={unavailable.continuity}
            nextStep={manualRetryRequired
              ? 'As tentativas automáticas foram encerradas para preservar a estabilidade. A próxima tentativa fica sob seu controle.'
              : 'Tente novamente agora ou volte para a busca sem perder o contexto.'}
            expectedTimeLabel={manualRetryRequired
              ? `As tentativas automáticas foram limitadas a ${PUBLIC_PRESENCE_RETRY_POLICY.maxAttempts} tentativas.`
              : `Nova tentativa em instantes.${loadRetryCount > 0 ? ` Tentativas automáticas executadas: ${loadRetryCount}.` : ''}`}
            primaryLabel={manualRetryRequired ? 'Tentar manualmente' : 'Tentar novamente agora'}
            onPrimary={() => {
              void loadEntityProfile(true)
            }}
            secondaryLabel="Voltar para a busca"
            onSecondary={() => window.location.assign('/buscar')}
          />
        </section>
      </PublicShell>
    )
  }

  return (
    <PublicShell isAuthenticated={Boolean(authSession)}>
      <section className="office-profile-page motion-loading-shell" aria-label="Perfil público do escritório" aria-busy={isReloading}>
        {isReloading ? (
          <article className="office-state-banner office-state-banner--info" role="status" aria-live="polite">
            <strong>Atualizando seções sem perder contexto</strong>
            <p>Seus dados atuais permanecem visíveis enquanto sincronizamos os sinais mais recentes.</p>
          </article>
        ) : null}
        <header className="office-profile-header motion-surface">
          {officeGallery.length > 0 ? <OfficeGallery items={officeGallery} /> : null}
          <div className="office-profile-header__identity">
            <p className="office-profile-header__kicker">Escritório</p>
            <h1>{presence.entity.name}</h1>
            <p className="office-profile-header__meta">{primaryCoverageLabel}</p>
            <p className="office-profile-header__tagline">
              {presence.entity.tagline ?? 'Atendimento jurídico com informações claras para o primeiro contato.'}
            </p>
            <section className="office-profile-header__summary" aria-label="Resumo do escritório">
              <HeroMetric
                label="Cobertura"
                value={primaryCoverageLabel}
                detail={`${coverage.length} ponto(s) públicos exibidos neste perfil.`}
              />
              <HeroMetric
                label="Disponibilidade"
                value={availabilityLabel}
                detail={availabilityDetails}
              />
              <HeroMetric
                label="SLA inicial"
                value={canonicalProjection.operational.responseWindowLabel}
                detail="Prazo inicial informado pelo escritório para o primeiro retorno."
              />
            </section>
            <div className="office-profile-header__actions">
              <button
                type="button"
                className="office-button office-button--primary"
                onClick={scrollToTriage}
              >
                Iniciar triagem
              </button>
            </div>
            <div className="office-profile-header__micro-actions" aria-label="Ações secundárias do perfil">
              <button type="button" className="office-action-link" onClick={handleShare}>
                Compartilhar perfil
              </button>
              <button type="button" className="office-action-link" onClick={handleFollow}>
                Acompanhar escritório
              </button>
            </div>
            <HeaderTrustHighlights responsible={responsibleProfessional} cities={servedCities} />
            <TrustRibbon />
            {responsibleProfessional ? <ResponsibleProfessionalCard responsible={responsibleProfessional} /> : null}
            <section className="office-profile-header__availability" aria-label="Disponibilidade pública">
              <div className="office-profile-header__availability-main">
                <div className="office-block-heading">
                  <p>Disponibilidade informada</p>
                  <h2>{availabilityLabel}</h2>
                </div>
                <p>{availabilityDetails}</p>
              </div>
              <div className="office-profile-header__availability-meta">
                <div>
                  <span>SLA inicial</span>
                  <strong>{canonicalProjection.operational.responseWindowLabel}</strong>
                </div>
                <div>
                  <span>Triagem</span>
                  <strong>{intakeExpectationLabel}</strong>
                </div>
                <div>
                  <span>Canal principal</span>
                  <strong>{contacts[0] ? `${contacts[0].label}: ${contacts[0].value}` : 'Triagem pública da plataforma'}</strong>
                </div>
              </div>
            </section>
            <PublicProfessionalsSection professionals={publicProfessionals} />
          </div>
        </header>

        {canonicalProjection.drift.hasDrift ? (
          <article className="office-state-banner office-state-banner--warning" role="status" aria-live="polite">
            <h3>Estamos verificando algumas informações deste perfil</h3>
            <p>O perfil continua disponível, mas alguns dados ainda estão sendo conferidos.</p>
            <ul>
              <li>Alguns dados públicos ainda estão sendo revisados.</li>
              <li>Cobertura, contato e disponibilidade podem receber atualização.</li>
              <li>Você pode seguir com as informações já confirmadas neste perfil.</li>
            </ul>
          </article>
        ) : null}

        {runtimeMode === 'fallback' ? (
          <StateBanner
            tone="info"
            title={buildFallbackState().title}
            happened="Algumas informações entraram em atualização para manter o perfil disponível."
            impact={buildFallbackState().impact}
            continuity={buildFallbackState().continuity}
            nextStep="Você pode atualizar o perfil agora ou seguir com os dados atuais."
            expectedTimeLabel="Normalmente regulariza em até alguns minutos."
            primaryLabel="Atualizar perfil"
            onPrimary={() => window.location.reload()}
            secondaryLabel="Continuar com dados atuais"
            onSecondary={() => setRuntimeMode('normal')}
          />
        ) : null}

        {runtimeMode === 'degraded' ? (
          <StateBanner
            tone="warning"
            title={buildDegradedState().title}
            happened="Algumas informações de disponibilidade ainda estão sendo atualizadas."
            impact={buildDegradedState().impact}
            continuity={buildDegradedState().continuity}
            nextStep="Você pode seguir com os dados confirmados agora ou pedir uma nova leitura daqui a pouco."
            expectedTimeLabel="A revalidação costuma acontecer em uma janela curta."
            primaryLabel="Seguir com dados confirmados"
            onPrimary={() => undefined}
            secondaryLabel="Atualizar perfil"
            onSecondary={() => window.location.reload()}
          />
        ) : null}

        {runtimeMode === 'unavailable' ? (
          <StateBanner
            tone="danger"
            title={buildUnavailableState().title}
            happened="A leitura completa do perfil não ficou disponível agora."
            impact={buildUnavailableState().impact}
            continuity={buildUnavailableState().continuity}
            nextStep={manualRetryRequired
              ? 'As tentativas automáticas foram encerradas para preservar estabilidade. A próxima tentativa fica sob seu controle.'
              : 'Você pode pedir uma nova leitura ou voltar para a busca sem perder orientação.'}
            expectedTimeLabel={manualRetryRequired
              ? `Fizemos até ${PUBLIC_PRESENCE_RETRY_POLICY.maxAttempts} tentativas automáticas antes de interromper.`
              : 'Uma nova tentativa acontece assim que você recarregar.'}
            primaryLabel={manualRetryRequired ? 'Tentar manualmente' : 'Tentar novamente'}
            onPrimary={() => {
              void loadEntityProfile(true)
            }}
            secondaryLabel="Voltar para a busca"
            onSecondary={() => window.location.assign('/buscar')}
          />
        ) : null}

        <section className="office-profile-grid motion-reveal">
          <article className="office-profile-block office-profile-block--narrative">
            <section className="office-profile-section" id="office-public-contact">
              <div className="office-block-heading">
                <p>Sobre o escritório</p>
                <h2>Como este escritório se apresenta</h2>
              </div>
              <p>
                {canonicalProjection.profile.institutionalDescription
                  || 'O escritório ainda está revisando a apresentação institucional deste perfil.'}
              </p>
            </section>

            <section className="office-profile-section">
              <div className="office-block-heading">
                <p>Áreas e cobertura</p>
                <h2>Áreas atendidas e regiões visíveis</h2>
              </div>
              <p>
                O perfil reúne o que este escritório decidiu tornar público para a etapa inicial de descoberta:
                áreas de atuação, regiões cobertas e expectativa para o primeiro contato.
              </p>
              <div className="office-profile-columns">
                <div>
                  <h3>Especialidades</h3>
                  <NarrativeList items={specialties} />
                </div>
                <div>
                  <h3>Cobertura regional</h3>
                  <ul className="office-coverage-list">
                    {coverage.map((item) => (
                      <li key={item.label}>
                        <span>{item.label}</span>
                        <ConfidenceBadge confidence={item.confidence} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {institutionalVideo ? (
              <section className="office-profile-section">
                <InstitutionalVideoSection
                  video={institutionalVideo}
                  onOpen={() => setIsInstitutionalVideoOpen(true)}
                />
              </section>
            ) : null}

            <section className="office-profile-section">
              <div className="office-block-heading">
                <p>Disponibilidade e contato</p>
                <h2>Como o primeiro contato acontece</h2>
              </div>
              <p>
                A triagem organiza o primeiro passo. Depois disso, o escritório segue como responsável
                pela resposta jurídica, pelo canal escolhido e pelo atendimento efetivo.
              </p>
              <ul className="office-contact-list">
                {contacts.map((channel) => (
                  <li key={channel.id}>
                    <div>
                      <span>{channel.label}</span>
                      {channel.href ? (
                        <a
                          href={channel.href}
                          target={channel.href.startsWith('http') ? '_blank' : undefined}
                          rel={channel.href.startsWith('http') ? 'noreferrer' : undefined}
                        >
                          {channel.value}
                        </a>
                      ) : (
                        <strong>{channel.value}</strong>
                      )}
                    </div>
                    <ConfidenceBadge confidence={channel.confidence} />
                  </li>
                ))}
              </ul>
            </section>

            {trustEvidence.length > 0 ? (
              <section className="office-profile-section">
                <TrustEvidenceSection items={trustEvidence} />
              </section>
            ) : null}

            <section className="office-profile-section">
              <div className="office-block-heading">
                <p>Transparência</p>
                <h2>O que a plataforma mostra e o que o escritório assume</h2>
              </div>
              <NarrativeList
                items={[
                  'A plataforma organiza a busca, os critérios e a triagem.',
                  'Escritório responde pela orientação jurídica e pelo atendimento efetivo.',
                  'Cobertura, disponibilidade e SLA aparecem com explicações visíveis.',
                  'A triagem preserva contexto antes do primeiro retorno jurídico.',
                ]}
              />
            </section>
          </article>

          <article className="office-profile-block office-profile-block--operational">
            <section className="office-profile-section">
              <div className="office-block-heading">
                <p>Informações do perfil</p>
                <h2>O que está visível neste momento</h2>
              </div>
              <ul className="office-readiness-list">
                {readinessIndicators.map((indicator) => (
                  <li key={`${indicator.label}-${indicator.value}`}>
                    <div>
                      <span>{indicator.label}</span>
                      <strong>{indicator.value}</strong>
                    </div>
                    <ConfidenceBadge confidence={indicator.confidence} />
                  </li>
                ))}
              </ul>
            </section>

            <section className="office-profile-section">
              <div className="office-block-heading">
                <p>Como funciona</p>
                <h2>Como este escritório recebe e responde</h2>
              </div>
              <ol className="office-operational-timeline">
                {operationalTimeline.map((item) => (
                  <li key={item.label} className={`office-operational-timeline__item office-operational-timeline__item--${item.tone}`}>
                    <span className="office-operational-timeline__dot" aria-hidden="true" />
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="office-profile-section">
              <div className="office-block-heading">
                <p>Atualizações recentes</p>
                <h2>Atualizações e disponibilidade</h2>
              </div>
              <OperationalPresenceLayer signals={operationalPresenceSignals} />
            </section>
          </article>
        </section>

        <section className="office-profile-intake motion-surface motion-section-anchor" id="office-public-triagem">
          <div className="office-profile-intake__header">
            <h2>Iniciar triagem</h2>
            <p>
              Uma etapa por vez. A plataforma organiza a triagem e o escritório responde.
            </p>
          </div>

          <div className="office-intake-trust-sticky" role="status" aria-live="polite">
            Contexto preservado: cada etapa salva automaticamente para retomada segura.
          </div>

          <details className="office-intake-mobile-collapse" open>
            <summary>Contexto da triagem</summary>
            <ProgressMeta
              currentStep={intakeStepIndex + 1}
              totalSteps={INTAKE_STEPS.length}
              expectationLabel={intakeExpectationLabel}
              isRecoveredDraft={intakeDraftRecovered}
            />

            <IntakeStepper currentStepIndex={intakeStepIndex} steps={INTAKE_STEPS} />
          </details>

          {currentIntakeStep.id === 'situation' ? (
            <QuestionBlock title={currentIntakeStep.title} why={currentIntakeStep.why} next={currentIntakeStep.next}>
              <label className="ds-sr-only" htmlFor="office-intake-situation">Contexto inicial</label>
              <textarea
                id="office-intake-situation"
                className="office-intake-textarea"
                value={intakeDraft.situation}
                onChange={(event) => setIntakeDraft((current) => ({ ...current, situation: event.target.value }))}
                placeholder="Descreva o contexto principal em linguagem simples"
              />
            </QuestionBlock>
          ) : null}

          {currentIntakeStep.id === 'urgency' ? (
            <QuestionBlock title={currentIntakeStep.title} why={currentIntakeStep.why} next={currentIntakeStep.next}>
              <UrgencySelector
                value={intakeDraft.urgency}
                onChange={(value) => setIntakeDraft((current) => ({ ...current, urgency: value }))}
              />
            </QuestionBlock>
          ) : null}

          {currentIntakeStep.id === 'objective' ? (
            <QuestionBlock title={currentIntakeStep.title} why={currentIntakeStep.why} next={currentIntakeStep.next}>
              <label className="ds-sr-only" htmlFor="office-intake-objective">Objetivo da triagem</label>
              <textarea
                id="office-intake-objective"
                className="office-intake-textarea"
                value={intakeDraft.objective}
                onChange={(event) => setIntakeDraft((current) => ({ ...current, objective: event.target.value }))}
                placeholder="Qual resultado inicial você espera deste atendimento?"
              />
            </QuestionBlock>
          ) : null}

          {currentIntakeStep.id === 'contact' ? (
            <QuestionBlock title={currentIntakeStep.title} why={currentIntakeStep.why} next={currentIntakeStep.next}>
              <label className="ds-sr-only" htmlFor="office-intake-contact">Canal de contato</label>
              <input
                id="office-intake-contact"
                className="office-intake-input"
                value={intakeDraft.contact}
                onChange={(event) => setIntakeDraft((current) => ({ ...current, contact: event.target.value }))}
                placeholder="Ex.: WhatsApp +55..., e-mail ou telefone"
              />
            </QuestionBlock>
          ) : null}

          {currentIntakeStep.id !== 'review' ? (
            <div className="office-intake-nav">
              <button type="button" className="office-button office-button--secondary" onClick={goToPreviousIntakeStep} disabled={intakeStepIndex === 0}>
                Voltar
              </button>
              <button type="button" className="office-button office-button--primary" onClick={goToNextIntakeStep} disabled={!intakeCanAdvance}>
                Próxima etapa
              </button>
            </div>
          ) : null}

          {currentIntakeStep.id === 'review' ? (
            <ReviewSubmitPanel
              draft={intakeDraft}
              onSubmit={() => {
                void submitIntake()
              }}
              onBack={goToPreviousIntakeStep}
              submitting={intakeSubmitting}
              submitError={intakeSubmissionState.status === 'error' ? intakeSubmissionState : undefined}
            />
          ) : null}

          {intakeSubmitting ? (
            <section className="office-intake-submit-loading" role="status" aria-live="polite" aria-busy="true">
              <strong>Enviando triagem com continuidade preservada</strong>
              <Skeleton height="0.95rem" width="72%" />
              <Skeleton height="0.95rem" width="56%" />
            </section>
          ) : null}

          {intakeSubmissionState.status === 'success' ? (
            <PostSubmitExpectation submissionState={intakeSubmissionState} />
          ) : null}

          <aside className="office-intake-mobile-decision motion-surface" aria-label="Decisão principal da triagem">
            <button
              type="button"
              className="office-button office-button--secondary"
              onClick={goToPreviousIntakeStep}
              disabled={intakeStepIndex === 0 || intakeSubmitting}
            >
              Voltar
            </button>
            <button
              type="button"
              className="office-button office-button--primary"
              onClick={handleIntakeMobilePrimaryAction}
              disabled={intakeMobilePrimaryDisabled}
            >
              {intakeMobilePrimaryLabel}
            </button>
          </aside>

          <div className="office-intake-runtime-bridge">
          <PublicPresencePage
            presence={presence}
            socialState={socialState}
            isAuthenticated={Boolean(authSession)}
            shareState={shareState}
            actionError={actionError}
            message={message}
            response={response}
            cognitiveIndicator={cognitiveIndicator}
            visualRuntimePatch={visualRuntimePatch}
            officialDecisionDebugSummary={officialDecisionDebugSummary}
            operationalFallbackReason={operationalFallbackReason}
            operationalFallbackContract={operationalFallbackContract}
            legalCaseState={legalCaseState}
            showVisualDebug={showVisualDebug}
            onMessageChange={setMessage}
            onSendMessage={handleSendMessage}
            onFollow={handleFollow}
            onShare={handleShare}
          />
          </div>
        </section>

        {showFloatingTriageCta ? (
          <aside className="office-profile-mobile-cta motion-surface" aria-label="Ação rápida de triagem">
            <button
              type="button"
              className="office-button office-button--primary"
              onClick={scrollToTriage}
            >
              Iniciar triagem segura
            </button>
          </aside>
        ) : null}
        {institutionalVideo ? (
          <Modal
            open={isInstitutionalVideoOpen}
            title={institutionalVideo.title ?? 'Conheça nosso escritório'}
            onClose={() => setIsInstitutionalVideoOpen(false)}
          >
            <div className="office-video-modal">
              {institutionalVideo.mode === 'uploaded' ? (
                <video className="office-video-modal__player" src={institutionalVideoUrl} controls autoPlay playsInline />
              ) : resolveInstitutionalVideoEmbedUrl(institutionalVideo) ? (
                <div className="office-video-modal__embed">
                  <iframe
                    src={resolveInstitutionalVideoEmbedUrl(institutionalVideo)}
                    title={institutionalVideo.title ?? 'Vídeo institucional'}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <a className="office-button office-button--primary" href={institutionalVideoUrl} target="_blank" rel="noreferrer">
                  Abrir vídeo institucional
                </a>
              )}
              {institutionalVideo.intro ? <p className="office-video-modal__intro">{institutionalVideo.intro}</p> : null}
            </div>
          </Modal>
        ) : null}
      </section>
    </PublicShell>
  )
}
