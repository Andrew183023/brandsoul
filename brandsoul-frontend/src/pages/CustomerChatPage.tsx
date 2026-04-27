// LEGACY PUBLIC FLOW
// This page is kept only for backward compatibility with /brands/:slug.
// New public product work must happen in /entity/:id via EntityPublicPage.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import axios from 'axios'

import brandsoulLogo from '../assets/brandsoul-logo-original.jpeg'
import ChatList from '../lib/components/ChatList'
import BrandSpark from '../lib/components/BrandSpark'
import ProductCard from '../lib/components/ProductCard'
import ProductModal from '../lib/components/ProductModal'
import type { Message } from '../lib/components/ChatMessage'
import { mockCatalog } from '../data/mockCatalog'
import { buildApiUrl } from '../lib/api'
import { getBusinessStatus } from '../lib/businessStatus'
import { buildCatalogSummary, CATALOG_STORAGE_KEY, loadCatalogItems } from '../lib/catalog'
import { fetchPublicBrand } from '../lib/publicBrandApi'
import { createScheduleBooking, fetchPublicScheduleAvailability } from '../lib/scheduleApi'
import { loadBrandPersona, PERSONA_STORAGE_KEY, type BrandFeatures, type BrandPersona, type BusinessModelOption, type SparkModes, type WeeklyAvailabilityConfig } from '../lib/persona'
import { buildWhatsAppMessage, buildWhatsAppUrl, formatSummaryForWhatsApp, normalizeWhatsAppNumber } from '../lib/whatsapp'
import {
  buildSparkMemorySummary,
  getSparkMemoryStorageKey,
  incrementConversationCount,
  loadSparkMemory,
  recordDetectedIntent,
  recordInteractionWindow,
  saveSparkMemory,
  type SparkMemory,
} from '../lib/sparkMemory'
import type { CatalogItem } from '../types/catalog'

type SparkState = 'idle' | 'thinking' | 'speaking'
type CustomerMode = 'sales' | 'service' | 'scheduling' | 'emergency'

interface ChannelResponseMetadata {
  detected_intent?: string
  flow_closed?: boolean
  highlight_evidence?: boolean
  case_checklist?: {
    context?: boolean
    impact?: boolean
    evidence?: boolean
    nextSteps?: boolean
  }
  case_progress?: {
    completedCount?: number
    readyForSubmission?: boolean
    hasEvidence?: boolean
    isPartiallyReady?: boolean
  }
  guidance_progress?: {
    contexto?: string
    impacto?: string
    evidencias?: string
    proximos_passos?: string
  }
  guidance_dossier?: {
    situacao_identificada?: string
    contexto?: string
    impacto?: string
    evidencias?: string[]
    proximos_passos?: string[]
  }
  case_summary?: {
    tipo?: string
    dados?: string[]
    evidencias?: string[]
    passos?: string[]
  }
}

interface ChannelMessageResponse {
  response: string
  spark_state: SparkState
  memory_used: boolean
  metadata?: ChannelResponseMetadata
}

interface LocationSummary {
  address?: string
  city?: string
  state?: string
}

interface PageHighlightsSummary {
  has_promotions: boolean
  has_new_arrivals: boolean
}

interface CaseSummary {
  tipo?: string
  dados?: string[]
  evidencias?: string[]
  passos?: string[]
}

interface GuidanceEvidenceItem {
  type: 'image' | 'video' | 'audio'
  name: string
  count: number
  timestamp: string
}

interface GuidanceProgress {
  contexto: 'pendente' | 'em_andamento' | 'concluido'
  impacto: 'pendente' | 'em_andamento' | 'concluido'
  evidencias: 'pendente' | 'em_andamento' | 'concluido'
  proximos_passos: 'pendente' | 'em_andamento' | 'concluido'
}

interface GuidanceDossier {
  situacao_identificada: string
  contexto: string
  impacto: string
  evidencias: string[]
  proximos_passos: string[]
}

interface CaseChecklist {
  context: boolean
  impact: boolean
  evidence: boolean
  nextSteps: boolean
}

interface CaseProgress {
  completedCount: number
  readyForSubmission: boolean
  hasEvidence: boolean
  isPartiallyReady: boolean
}

interface GuidanceCtaState {
  whatsappSuggested: boolean
  showWhatsAppCta: boolean
}

interface CaseSubmitResponse {
  status: 'submitted'
  message: string
  destination: 'whatsapp' | 'email' | 'panel'
  case_id: number
  already_submitted: boolean
}

type ScheduleStep = 'service' | 'mode' | 'date' | 'time' | 'form' | 'confirm'

interface ScheduleFormState {
  name: string
  phone: string
  service: string
  attendanceMode: 'presencial' | 'online' | 'domicilio' | ''
  date: string
  time: string
  note: string
  locationDetails: string
}

const USER_ID_STORAGE_KEY = 'brandsoul_user_id'
const BOOTSTRAP_LOCK_KEY = 'brandsoul_bootstrap_lock'
const BOOTSTRAP_LOCK_MAX_AGE = 8000
const BOOTSTRAP_ERROR_MESSAGE = 'Tive um ruído aqui agora. Me chama de novo que eu volto.'
type SchedulingWeekdayKey = keyof WeeklyAvailabilityConfig

const SCHEDULING_WEEKDAY_INDEX: SchedulingWeekdayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]
const CALENDAR_WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const SCHEDULE_ATTENDANCE_MODE_LABELS: Record<'presencial' | 'online' | 'domicilio', string> = {
  presencial: 'Presencial',
  online: 'Online',
  domicilio: 'Em domicílio',
}

interface ScheduleConfirmationState {
  whatsappUrl?: string | null
}

const SCHEDULE_AVAILABILITY_TTL_MS = 3 * 60 * 1000

function createEmptyGuidanceProgress(): GuidanceProgress {
  return {
    contexto: 'pendente',
    impacto: 'pendente',
    evidencias: 'pendente',
    proximos_passos: 'pendente',
  }
}

function buildGuidanceProgressLabel(status: GuidanceProgress[keyof GuidanceProgress]) {
  if (status === 'concluido') {
    return 'Concluído'
  }
  if (status === 'em_andamento') {
    return 'Em andamento'
  }
  return 'Pendente'
}

function hasScheduleAvailabilityExpired(fetchedAt: number | null, now = Date.now()) {
  if (fetchedAt === null) {
    return false
  }

  return now - fetchedAt > SCHEDULE_AVAILABILITY_TTL_MS
}

function triggerEvidencePanelHighlight(
  setHighlight: (value: boolean) => void,
  timeoutRef: { current: number | null },
) {
  if (timeoutRef.current) {
    window.clearTimeout(timeoutRef.current)
  }

  setHighlight(true)
  timeoutRef.current = window.setTimeout(() => {
    setHighlight(false)
  }, 2400)
}

function createEvidenceItems(files: FileList | null, type: GuidanceEvidenceItem['type']) {
  if (!files || files.length === 0) {
    return []
  }

  const timestamp = new Date().toISOString()
  return Array.from(files).map((file) => ({
    type,
    name: file.name,
    count: 1,
    timestamp,
  }))
}

function createEmptyGuidanceDossier(): GuidanceDossier {
  return {
    situacao_identificada: 'Aguardando informações',
    contexto: 'Em coleta',
    impacto: 'Em coleta',
    evidencias: ['Em coleta'],
    proximos_passos: ['Em coleta'],
  }
}

function createEmptyCaseChecklist(): CaseChecklist {
  return {
    context: false,
    impact: false,
    evidence: false,
    nextSteps: false,
  }
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getMonthMatrix(baseDate: Date) {
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const leadingEmptyDays = firstDay.getDay()
  const days: Array<Date | null> = []

  for (let index = 0; index < leadingEmptyDays; index += 1) {
    days.push(null)
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(year, month, day))
  }

  while (days.length % 7 !== 0) {
    days.push(null)
  }

  return days
}

function buildTimeSlots(start?: string, end?: string, intervalMinutes = 30) {
  if (!start || !end) {
    return []
  }

  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) {
    return []
  }

  let currentMinutes = startHour * 60 + startMinute
  const endMinutes = endHour * 60 + endMinute
  const result: string[] = []

  while (currentMinutes < endMinutes) {
    const hours = Math.floor(currentMinutes / 60)
    const minutes = currentMinutes % 60
    result.push(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`)
    currentMinutes += intervalMinutes
  }

  return result
}

function createEmptyCaseProgress(): CaseProgress {
  return {
    completedCount: 0,
    readyForSubmission: false,
    hasEvidence: false,
    isPartiallyReady: false,
  }
}

function createEmptyGuidanceCtaState(): GuidanceCtaState {
  return {
    whatsappSuggested: false,
    showWhatsAppCta: false,
  }
}

function normalizeCaseChecklist(metadata?: ChannelResponseMetadata): CaseChecklist {
  return {
    context: metadata?.case_checklist?.context === true,
    impact: metadata?.case_checklist?.impact === true,
    evidence: metadata?.case_checklist?.evidence === true,
    nextSteps: metadata?.case_checklist?.nextSteps === true,
  }
}

function normalizeCaseProgress(metadata?: ChannelResponseMetadata): CaseProgress {
  return {
    completedCount: metadata?.case_progress?.completedCount ?? 0,
    readyForSubmission: metadata?.case_progress?.readyForSubmission === true,
    hasEvidence: metadata?.case_progress?.hasEvidence === true,
    isPartiallyReady: metadata?.case_progress?.isPartiallyReady === true,
  }
}

function buildProgressStatusFromChecklist(isComplete: boolean, fallback: GuidanceProgress[keyof GuidanceProgress]): GuidanceProgress[keyof GuidanceProgress] {
  if (isComplete) {
    return 'concluido'
  }

  return fallback
}

function buildCaseSubmissionSummary(dossier: GuidanceDossier, summary: CaseSummary | null) {
  const caseType = summary?.tipo || dossier.situacao_identificada
  const evidenceLines = (summary?.evidencias?.length ? summary.evidencias : dossier.evidencias).map((item) => `- ${item}`)
  const nextStepLines = (summary?.passos?.length ? summary.passos : dossier.proximos_passos).map((item) => `- ${item}`)

  return [
    `Tipo de caso: ${caseType}`,
    '',
    `Situação identificada: ${dossier.contexto}`,
    `Impacto / prejuízo: ${dossier.impacto}`,
    '',
    'Evidências registradas:',
    ...(evidenceLines.length > 0 ? evidenceLines : ['- Em coleta']),
    '',
    'Próximos passos:',
    ...(nextStepLines.length > 0 ? nextStepLines : ['- Em coleta']),
  ].join('\n')
}

function buildGuidanceWhatsAppSuggestionMessage(dossier: GuidanceDossier, summary: CaseSummary | null) {
  const caseType = summary?.tipo || dossier.situacao_identificada || 'caso'
  return [
    'Perfeito. Com essas evidências, seu caso já está mais bem organizado.',
    'Se quiser, posso encaminhar agora para análise profissional e agilizar o atendimento.',
    '',
    `Tipo de caso: ${caseType}`,
    `Contexto: ${dossier.contexto}`,
    `Impacto: ${dossier.impacto}`,
  ].join('\n')
}

function getCustomerMessageStorageKey(brandSlug?: string, mode: CustomerMode = 'service') {
  return brandSlug ? `brandsoul_messages:customer:web:${brandSlug}:${mode}` : `brandsoul_messages:customer:web:${mode}`
}

function loadMessages(storageKey: string): Message[] {
  const savedMessages = window.localStorage.getItem(storageKey)
  if (!savedMessages) {
    return []
  }

  try {
    const parsedMessages = JSON.parse(savedMessages) as Message[]
    return Array.isArray(parsedMessages)
      ? parsedMessages.filter((savedMessage) => savedMessage?.role && savedMessage?.content)
      : []
  } catch {
    return []
  }
}

function getOrCreateUserId() {
  const savedUserId = window.localStorage.getItem(USER_ID_STORAGE_KEY)
  if (savedUserId) {
    return savedUserId
  }

  const generatedUserId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `brandsoul-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  window.localStorage.setItem(USER_ID_STORAGE_KEY, generatedUserId)
  return generatedUserId
}

function resetCustomerStorage(brandSlug?: string) {
  const messagePrefix = brandSlug ? `brandsoul_messages:customer:web:${brandSlug}:` : 'brandsoul_messages:customer:web:'
  const memoryPrefix = 'brandsoul_memory_customer_'

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index)
    if (!key) {
      continue
    }

    if (key.startsWith(messagePrefix) || key.startsWith(memoryPrefix) || key === USER_ID_STORAGE_KEY) {
      window.localStorage.removeItem(key)
    }
  }

  window.sessionStorage.removeItem(BOOTSTRAP_LOCK_KEY)
}

function acquireBootstrapLock() {
  const now = Date.now()
  const rawLockValue = window.sessionStorage.getItem(BOOTSTRAP_LOCK_KEY)

  if (rawLockValue) {
    const existingLockTime = Number(rawLockValue)
    if (!Number.isNaN(existingLockTime) && now - existingLockTime < BOOTSTRAP_LOCK_MAX_AGE) {
      return false
    }
  }

  window.sessionStorage.setItem(BOOTSTRAP_LOCK_KEY, String(now))
  return true
}

function releaseBootstrapLock() {
  window.sessionStorage.removeItem(BOOTSTRAP_LOCK_KEY)
}

function buildCustomerHeadline(persona: BrandPersona) {
  if (resolveBusinessModel(persona) === 'professional') {
    return 'Presença profissional, orientação inicial e resposta com clareza.'
  }

  if (resolveBusinessModel(persona) === 'service') {
    return 'Atendimento claro, contexto rápido e próximos passos bem guiados.'
  }

  if (persona.tone === 'ousado') {
    return 'Agora você está falando comigo.'
  }

  if (persona.tone === 'divertido') {
    return 'Cheguei. Pode falar comigo.'
  }

  if (persona.tone === 'sério') {
    return 'Bem-vindo. Estou por aqui.'
  }

  return 'Agora você está falando comigo.'
}

function buildCustomerSubtext(persona: BrandPersona) {
  if (resolveBusinessModel(persona) === 'professional') {
    return 'Eu organizo o primeiro entendimento do caso, explico cenários e te ajudo a dar o próximo passo com mais segurança.'
  }

  if (resolveBusinessModel(persona) === 'service') {
    return 'Posso entender sua demanda, explicar como funciona e organizar atendimento, disponibilidade ou próximos passos.'
  }

  if (persona.deliveryAvailable) {
    return 'Posso te ajudar com pedidos, dúvidas ou o que você precisar.'
  }

  if (persona.tone === 'sério') {
    return 'Estou aqui pra te atender.'
  }

  return 'Me diz o que você precisa.'
}

function buildBrandCategory(persona: BrandPersona) {
  const rawDescription = persona.businessDescription?.trim()
  if (!rawDescription) {
    return null
  }

  const normalizedDescription = rawDescription.toLowerCase()

  if (normalizedDescription.includes('restaurante') || normalizedDescription.includes('sushi') || normalizedDescription.includes('gastronomia')) {
    return 'Restaurante'
  }

  if (normalizedDescription.includes('cafeteria') || normalizedDescription.includes('cafe')) {
    return 'Cafeteria'
  }

  if (normalizedDescription.includes('clinica') || normalizedDescription.includes('saude') || normalizedDescription.includes('odont')) {
    return 'Saúde'
  }

  if (normalizedDescription.includes('loja') || normalizedDescription.includes('varejo') || normalizedDescription.includes('moda')) {
    return 'Varejo'
  }

  if (normalizedDescription.includes('agencia') || normalizedDescription.includes('branding') || normalizedDescription.includes('design') || normalizedDescription.includes('studio') || normalizedDescription.includes('estudio')) {
    return 'Estúdio criativo'
  }

  if (normalizedDescription.includes('software') || normalizedDescription.includes('plataforma') || normalizedDescription.includes('tecnologia') || normalizedDescription.includes('saas')) {
    return 'Tecnologia'
  }

  const compactDescription = rawDescription.replace(/\.$/, '')
  return compactDescription.length > 32 ? `${compactDescription.slice(0, 32).trim()}...` : compactDescription
}

function buildCatalogIntro(persona: BrandPersona) {
  if (resolveBusinessModel(persona) === 'professional') {
    return 'Aqui o foco está em atuação, conteúdo e orientação inicial.'
  }

  if (resolveBusinessModel(persona) === 'service') {
    return 'Aqui você encontra os serviços ativos e pode falar comigo para entender o melhor caminho.'
  }

  if (persona.tone === 'ousado') {
    return 'Posso te mostrar o que faz mais sentido sem enrolar.'
  }

  if (persona.tone === 'sério') {
    return 'Posso te ajudar a escolher a melhor opção.'
  }

  return 'Você pode olhar as opções ou falar comigo direto.'
}

function buildItemMessage(item: CatalogItem) {
  return `Quero saber mais sobre ${item.name}`
}

function createDefaultModes(): SparkModes {
  return {
    sales: true,
    service: true,
    scheduling: false,
    emergency: false,
  }
}

function resolveBusinessModel(persona: BrandPersona | null): BusinessModelOption {
  if (!persona) {
    return 'product'
  }

  if (persona.businessModel) {
    return persona.businessModel
  }

  return persona.brandType === 'professional' ? 'professional' : 'product'
}

function resolveFeatures(persona: BrandPersona | null): BrandFeatures {
  const businessModel = resolveBusinessModel(persona)
  const storedFeatures = persona?.features

  return {
    products: storedFeatures?.products ?? (businessModel === 'product'),
    services: storedFeatures?.services ?? (businessModel === 'service' || businessModel === 'professional'),
    scheduling: storedFeatures?.scheduling ?? (businessModel === 'service'),
    emergency: storedFeatures?.emergency ?? (businessModel === 'professional'),
  }
}

function getAvailableModes(persona: BrandPersona | null): CustomerMode[] {
  const modes = persona?.modes ?? createDefaultModes()
  const features = resolveFeatures(persona)
  const nextModes: CustomerMode[] = []

  if (modes.service || features.services) {
    nextModes.push('service')
  }
  if (modes.sales || features.products) {
    nextModes.push('sales')
  }
  if (modes.scheduling || features.scheduling) {
    nextModes.push('scheduling')
  }
  if (modes.emergency || features.emergency) {
    nextModes.push('emergency')
  }

  return nextModes.length > 0 ? nextModes : ['service']
}

function getDefaultMode(persona: BrandPersona | null): CustomerMode {
  const availableModes = getAvailableModes(persona)
  if (availableModes.includes('service')) {
    return 'service'
  }

  return availableModes[0]
}

function buildModeHeadline(mode: CustomerMode) {
  switch (mode) {
    case 'emergency':
      return 'Modo crítico ativo'
    case 'scheduling':
      return 'Vamos organizar isso'
    case 'sales':
      return 'Posso te orientar na escolha'
    default:
      return 'Falar comigo'
  }
}

function buildModeSubtext(mode: CustomerMode) {
  switch (mode) {
    case 'emergency':
      return 'Eu vou conduzir por etapas, coletar os fatos principais e organizar um dossiê inicial.'
    case 'scheduling':
      return 'Posso coletar o contexto, entender disponibilidade e puxar os próximos passos.'
    case 'sales':
      return 'Se você quiser, eu posso te conduzir com foco mais comercial e direto.'
    default:
      return 'Me chama por aqui e eu te acompanho no que você precisar.'
  }
}

function buildPersonaPayload(persona: BrandPersona) {
  const businessModel = resolveBusinessModel(persona)
  const features = resolveFeatures(persona)

  return {
    tone: persona.tone,
    power: persona.power,
    business_model: businessModel,
    brand_type: businessModel === 'professional' ? 'professional' : persona.brandType || 'business',
    features,
    voice_style: persona.voiceStyle,
    act_mode: persona.actMode || 'seller',
    business_goal: persona.businessGoal || 'volume',
    modes: persona.modes || createDefaultModes(),
    emergency_type: persona.emergencyType || undefined,
    emergency_mode: persona.emergencyMode
      ? {
          enabled: persona.emergencyMode.enabled,
          auto_start: persona.emergencyMode.autoStart,
          show_upload_early: persona.emergencyMode.showUploadEarly,
        }
      : undefined,
    cta_config: persona.ctaConfig
      ? {
          whatsapp_enabled: persona.ctaConfig.whatsappEnabled,
          whatsapp_number: persona.ctaConfig.whatsappNumber,
          whatsapp_message_template: persona.ctaConfig.whatsappMessageTemplate,
          show_after_evidence: persona.ctaConfig.showAfterEvidence,
          show_on_completion: persona.ctaConfig.showOnCompletion,
          primary_text: persona.ctaConfig.primaryText,
          secondary_text: persona.ctaConfig.secondaryText,
        }
      : undefined,
    service_offers: features.services
      ? (persona.serviceOffers ?? []).map((item) => ({
          title: item.title,
          summary: item.summary,
          label: item.label,
        }))
      : undefined,
    scheduling_config: features.scheduling
      ? {
          title: persona.schedulingConfig?.title,
          description: persona.schedulingConfig?.description,
        }
      : undefined,
    professional_data:
      businessModel === 'professional'
        ? {
            operation_mode: persona.professionalData?.operationMode,
            presentation: persona.professionalData?.presentation,
            practice_areas: persona.professionalData?.practiceAreas,
            differentials: persona.professionalData?.differentials,
            cases: persona.professionalData?.cases?.map((item) => ({
              case_type: item.caseType,
              context: item.context,
              approach: item.approach,
              learning: item.learning,
            })),
            contents: persona.professionalData?.contents,
            identity: persona.professionalData?.identity,
            guidance: persona.professionalData?.guidance
              ? {
                  situation_type: persona.professionalData.guidance.situationType,
                  initial_response: persona.professionalData.guidance.initialResponse,
                  initial_questions: persona.professionalData.guidance.initialQuestions,
                  action_checklist: persona.professionalData.guidance.actionChecklist,
                  data_collection: persona.professionalData.guidance.dataCollection,
                  orientation_limits: persona.professionalData.guidance.orientationLimits,
                  communication_tone: persona.professionalData.guidance.communicationTone,
                  closing_message: persona.professionalData.guidance.closingMessage,
                  playbooks: persona.professionalData.guidance.playbooks,
                }
              : undefined,
          }
        : undefined,
    business_description: persona.businessDescription || undefined,
    opening_hours: persona.openingHours,
    address: persona.address || undefined,
    city: persona.city || undefined,
    state: persona.state || undefined,
    delivery_available: persona.deliveryAvailable,
    business_hours: persona.businessHours || undefined,
    service_region: persona.serviceRegion || undefined,
    brand_highlight: persona.brandHighlight || undefined,
    whatsapp: persona.whatsapp || undefined,
    email: persona.email || undefined,
    instagram: persona.instagram || undefined,
    facebook: persona.facebook || undefined,
    tiktok: persona.tiktok || undefined,
    site: persona.site || undefined,
    contact_info: persona.whatsapp || persona.email || persona.instagram || persona.site || persona.contactInfo || undefined,
  }
}

function buildLocationSummary(persona: BrandPersona): LocationSummary | undefined {
  const address = persona.address?.trim()
  const city = persona.city?.trim()
  const state = persona.state?.trim()

  if (!address && !city && !state) {
    return undefined
  }

  return {
    address: address || undefined,
    city: city || undefined,
    state: state || undefined,
  }
}

function buildLocationLabel(persona: BrandPersona) {
  const address = persona.address?.trim()
  const city = persona.city?.trim()
  const state = persona.state?.trim()
  const cityState = [city, state].filter(Boolean).join(' - ')

  if (address && cityState) {
    return `${address} - ${cityState}`
  }

  return address || cityState || null
}

function buildCustomerThemeStyle(persona: BrandPersona): CSSProperties {
  return {
    '--brand-accent': persona.theme?.primaryColor || '#ff9460',
    '--brand-accent-soft': persona.theme?.secondaryColor || '#ff5e43',
  } as CSSProperties
}

function hasProfessionalContent(persona: BrandPersona) {
  return Boolean(
    persona.professionalData?.presentation ||
      persona.professionalData?.practiceAreas?.length ||
      persona.professionalData?.differentials?.length ||
      persona.professionalData?.cases?.length ||
      persona.professionalData?.contents?.length ||
      persona.professionalData?.identity?.headline ||
      persona.professionalData?.identity?.principles?.length,
  )
}

export default function CustomerChatPage({ brandSlug }: { brandSlug?: string }) {
  const [activeMode, setActiveMode] = useState<CustomerMode>(() => getDefaultMode(brandSlug ? null : loadBrandPersona()))
  const customerMessagesStorageKey = useMemo(() => getCustomerMessageStorageKey(brandSlug, activeMode), [activeMode, brandSlug])
  const [persona, setPersona] = useState<BrandPersona | null>(() => (brandSlug ? null : loadBrandPersona()))
  const [userId, setUserId] = useState(() => getOrCreateUserId())
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(customerMessagesStorageKey))
  const [message, setMessage] = useState('')
  const [sparkState, setSparkState] = useState<SparkState>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [publicBrandStatus, setPublicBrandStatus] = useState<'loading' | 'ready' | 'not-found'>(brandSlug ? 'loading' : 'ready')
  const timeoutRef = useRef<number | null>(null)
  const bootstrapRequestIdRef = useRef(0)
  const [isIntroPulseActive, setIsIntroPulseActive] = useState(false)
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null)
  const [mobileSection, setMobileSection] = useState<'catalog' | 'chat'>('catalog')
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0)
  const [guidanceConsentState, setGuidanceConsentState] = useState<'pending' | 'accepted' | 'declined'>('declined')
  const [caseSummary, setCaseSummary] = useState<CaseSummary | null>(null)
  const [isGuidanceFlowClosed, setIsGuidanceFlowClosed] = useState(false)
  const [guidanceEvidenceItems, setGuidanceEvidenceItems] = useState<GuidanceEvidenceItem[]>([])
  const [guidanceProgress, setGuidanceProgress] = useState<GuidanceProgress>(createEmptyGuidanceProgress)
  const [guidanceDossier, setGuidanceDossier] = useState<GuidanceDossier>(createEmptyGuidanceDossier)
  const [caseChecklist, setCaseChecklist] = useState<CaseChecklist>(createEmptyCaseChecklist)
  const [caseProgress, setCaseProgress] = useState<CaseProgress>(createEmptyCaseProgress)
  const [guidanceCtaState, setGuidanceCtaState] = useState<GuidanceCtaState>(createEmptyGuidanceCtaState)
  const [highlightEvidencePanel, setHighlightEvidencePanel] = useState(false)
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false)
  const [isCaseSubmitting, setIsCaseSubmitting] = useState(false)
  const [isCaseSubmitted, setIsCaseSubmitted] = useState(false)
  const [caseSubmitMessage, setCaseSubmitMessage] = useState<string | null>(null)
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false)
  const [currentScheduleStep, setCurrentScheduleStep] = useState<ScheduleStep>('service')
  const [isScheduleSubmitting, setIsScheduleSubmitting] = useState(false)
  const [scheduleSubmitMessage, setScheduleSubmitMessage] = useState<string | null>(null)
  const [scheduleConfirmation, setScheduleConfirmation] = useState<ScheduleConfirmationState | null>(null)
  const [scheduleAvailability, setScheduleAvailability] = useState<{ blocked_dates: string[]; blocked_slots: string[]; booked_slots: string[] } | null>(null)
  const [scheduleAvailabilityFetchedAt, setScheduleAvailabilityFetchedAt] = useState<number | null>(null)
  const [scheduleDisplayMonth, setScheduleDisplayMonth] = useState(() => new Date())
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>({
    name: '',
    phone: '',
    service: '',
    attendanceMode: '',
    date: '',
    time: '',
    note: '',
    locationDetails: '',
  })
  const introPulseTimeoutRef = useRef<number | null>(null)
  const imageEvidenceInputRef = useRef<HTMLInputElement | null>(null)
  const videoEvidenceInputRef = useRef<HTMLInputElement | null>(null)
  const audioEvidenceInputRef = useRef<HTMLInputElement | null>(null)
  const evidenceHighlightTimeoutRef = useRef<number | null>(null)
  const hasBootstrappedRef = useRef(messages.length > 0)
  const sparkMemoryStorageKey = useMemo(
    () =>
      getSparkMemoryStorageKey({
        brandName: persona?.brandName ?? 'BrandSoul Demo',
        tone: persona?.tone ?? 'divertido',
        power: persona?.power ?? 'atração',
        contextMode: 'customer',
        channelMode: `web:${activeMode}`,
      }),
    [activeMode, persona],
  )
  const [sparkMemory, setSparkMemory] = useState<SparkMemory>(() => loadSparkMemory(sparkMemoryStorageKey))
  const memorySummary = useMemo(() => buildSparkMemorySummary(sparkMemory), [sparkMemory])
  const configuredCtaNumber = useMemo(() => normalizeWhatsAppNumber(persona?.ctaConfig?.whatsappNumber), [persona?.ctaConfig?.whatsappNumber])
  const whatsappNumber = useMemo(
    () => configuredCtaNumber ?? normalizeWhatsAppNumber(persona?.whatsapp ?? persona?.contactInfo),
    [configuredCtaNumber, persona],
  )
  const hasConfiguredWhatsApp = Boolean(whatsappNumber) && persona?.ctaConfig?.whatsappEnabled === true
  const ctaPrimaryText = persona?.ctaConfig?.primaryText?.trim() || 'Encaminhar para profissional'
  const ctaSecondaryText = persona?.ctaConfig?.secondaryText?.trim() || 'Leve este caso organizado para análise profissional.'
  const brandCategory = useMemo(() => (persona ? buildBrandCategory(persona) : null), [persona])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>(() => {
    if (brandSlug) {
      return []
    }

    const configuredCatalog = loadCatalogItems()
    return configuredCatalog.length > 0 ? configuredCatalog : mockCatalog
  })
  const catalogSummary = useMemo(() => buildCatalogSummary(catalogItems), [catalogItems])
  const customerThemeStyle = useMemo(() => (persona ? buildCustomerThemeStyle(persona) : undefined), [persona])
  const locationSummary = useMemo(() => (persona ? buildLocationSummary(persona) : undefined), [persona])
  const locationLabel = useMemo(() => (persona ? buildLocationLabel(persona) : null), [persona])
  const businessStatus = useMemo(() => getBusinessStatus(persona?.openingHours), [persona])
  const businessStatusLabel = businessStatus === 'open' ? 'Aberto agora' : businessStatus === 'closed' ? 'Fechado no momento' : null
  const showCarousel = persona?.pageSections?.showCarousel === true && (persona.carouselImages?.length ?? 0) > 0
  const showPromotions = persona?.pageSections?.showPromotions === true
  const showNewArrivals = persona?.pageSections?.showNewArrivals === true
  const promotionItems = useMemo(() => catalogItems.filter((item) => item.isPromotion).slice(0, 3), [catalogItems])
  const newArrivalItems = useMemo(() => catalogItems.filter((item) => item.isNewArrival).slice(0, 3), [catalogItems])
  const pageHighlights = useMemo<PageHighlightsSummary | undefined>(() => {
    const hasPromotions = showPromotions && promotionItems.length > 0
    const hasNewArrivals = showNewArrivals && newArrivalItems.length > 0

    if (!hasPromotions && !hasNewArrivals) {
      return undefined
    }

    return {
      has_promotions: hasPromotions,
      has_new_arrivals: hasNewArrivals,
    }
  }, [newArrivalItems.length, promotionItems.length, showNewArrivals, showPromotions])
  const businessModel = useMemo(() => resolveBusinessModel(persona), [persona])
  const activeFeatures = useMemo(() => resolveFeatures(persona), [persona])
  const availableModes = useMemo(() => getAvailableModes(persona), [persona])
  const emergencyEnabled = availableModes.includes('emergency')
  const isEmergencyMode = activeMode === 'emergency'
  const isProfessionalBrand = businessModel === 'professional'
  const professionalOperationMode = persona?.professionalData?.operationMode ?? 'institutional'
  const isProfessionalGuidanceMode = isProfessionalBrand && persona?.professionalData?.operationMode === 'guidance'
  const isGuidanceActive = isProfessionalGuidanceMode && (guidanceConsentState === 'accepted' || isEmergencyMode || isGuidanceFlowClosed || isCaseSubmitted)
  const showOrientationConsent = isProfessionalGuidanceMode && isEmergencyMode && guidanceConsentState === 'pending'
  const showGuidancePanels = isGuidanceActive
  const guidanceNeedsConsent = isProfessionalGuidanceMode && isEmergencyMode && guidanceConsentState === 'pending'
  const showGuidancePendingBanner = isProfessionalGuidanceMode && guidanceConsentState === 'pending' && !isEmergencyMode
  const showProductsSection = activeFeatures.products && !isProfessionalBrand && !isEmergencyMode
  const showServicesSection = activeFeatures.services && !isProfessionalBrand && !isEmergencyMode
  const isSchedulingEnabled = (businessModel === 'service' || businessModel === 'professional') && persona?.schedulingConfig?.enabled === true
  const enabledAttendanceModes = useMemo(() => {
    const configuredModes = persona?.schedulingConfig?.attendanceModes
    const modes = (Object.keys(SCHEDULE_ATTENDANCE_MODE_LABELS) as Array<'presencial' | 'online' | 'domicilio'>).filter(
      (modeKey) => configuredModes?.[modeKey] === true,
    )
    if (modes.length > 0) {
      return modes
    }
    return persona?.schedulingConfig?.attendanceMode ? [persona.schedulingConfig.attendanceMode] : []
  }, [persona?.schedulingConfig?.attendanceMode, persona?.schedulingConfig?.attendanceModes])
  const shouldSelectAttendanceMode = enabledAttendanceModes.length > 1
  const effectiveScheduleAttendanceMode = scheduleForm.attendanceMode || enabledAttendanceModes[0] || ''
  const showScheduleModeStep = shouldSelectAttendanceMode
  const hasDiscoverySection = showProductsSection || showServicesSection
  const scheduleSteps = useMemo(() => {
    const baseSteps: ScheduleStep[] = []
    const hasMultipleServices = (persona?.schedulingConfig?.serviceOptions?.length ?? 0) > 1

    if (hasMultipleServices || !(persona?.schedulingConfig?.serviceOptions?.[0])) {
      baseSteps.push('service')
    }
    if (shouldSelectAttendanceMode) {
      baseSteps.push('mode')
    }
    baseSteps.push('date', 'time', 'form', 'confirm')
    return baseSteps
  }, [persona?.schedulingConfig?.serviceOptions, shouldSelectAttendanceMode])
  const currentScheduleStepIndex = Math.max(scheduleSteps.indexOf(currentScheduleStep), 0)
  const scheduleProgressLabel = `Etapa ${Math.min(currentScheduleStepIndex + 1, scheduleSteps.length)} de ${scheduleSteps.length}`
  const showScheduleConfirmStep = currentScheduleStep === 'confirm'
  const serviceOffers = useMemo(
    () => (persona?.serviceOffers ?? []).filter((item) => item.title.trim() || item.summary.trim() || (item.label ?? '').trim()),
    [persona?.serviceOffers],
  )
  const showProfessionalSections = Boolean(persona && isProfessionalBrand && hasProfessionalContent(persona))
  const topPracticeAreas = (persona?.professionalData?.practiceAreas ?? []).slice(0, 3)
  const professionalAuthorityLine =
    persona?.professionalData?.identity?.headline ||
    persona?.professionalData?.presentation ||
    'Atuação técnica com presença clara, responsável e orientada ao próximo passo.'
  const flowReadyForSubmission = (caseProgress.readyForSubmission || isGuidanceFlowClosed) && !isCaseSubmitted
  const isCaseSubmitReady = flowReadyForSubmission && !isCaseSubmitting
  const selectedDateEntry = useMemo(() => {
    if (!scheduleForm.date || !persona?.schedulingConfig?.weeklyAvailability) {
      return undefined
    }
    const selectedDate = new Date(`${scheduleForm.date}T12:00:00`)
    const weekdayKey = SCHEDULING_WEEKDAY_INDEX[selectedDate.getDay()]
    return persona.schedulingConfig.weeklyAvailability[weekdayKey]
  }, [persona?.schedulingConfig?.weeklyAvailability, scheduleForm.date])
  const availableTimeSlots = useMemo(() => {
    const interval = persona?.schedulingConfig?.slotIntervalMinutes ?? 30
    const slots = buildTimeSlots(selectedDateEntry?.start, selectedDateEntry?.end, interval)
    if (!scheduleForm.date) {
      return slots
    }
    return slots.filter((slot) => {
      const slotKey = `${scheduleForm.date}T${slot}`
      return !scheduleAvailability?.booked_slots.includes(slotKey) && !scheduleAvailability?.blocked_slots.includes(slotKey)
    })
  }, [persona?.schedulingConfig?.slotIntervalMinutes, scheduleAvailability?.blocked_slots, scheduleAvailability?.booked_slots, scheduleForm.date, selectedDateEntry?.end, selectedDateEntry?.start])

  useEffect(() => {
    if (!isSchedulingEnabled) {
      return
    }

    if (enabledAttendanceModes.length === 1 && scheduleForm.attendanceMode !== enabledAttendanceModes[0]) {
      setScheduleForm((currentForm) => ({ ...currentForm, attendanceMode: enabledAttendanceModes[0] }))
      return
    }

    if (enabledAttendanceModes.length > 1 && scheduleForm.attendanceMode && !enabledAttendanceModes.includes(scheduleForm.attendanceMode)) {
      setScheduleForm((currentForm) => ({ ...currentForm, attendanceMode: '' }))
    }
  }, [enabledAttendanceModes, isSchedulingEnabled, scheduleForm.attendanceMode])

  useEffect(() => {
    if (!isScheduleFormOpen || currentScheduleStep === 'confirm') {
      return
    }

    if (currentScheduleStep === 'service' && !scheduleSteps.includes('service')) {
      setCurrentScheduleStep(scheduleSteps.includes('mode') ? 'mode' : 'date')
      return
    }

    if (currentScheduleStep === 'mode' && !scheduleSteps.includes('mode')) {
      setCurrentScheduleStep('date')
    }
  }, [currentScheduleStep, isScheduleFormOpen, scheduleSteps])
  const scheduleCalendarDays = useMemo(() => getMonthMatrix(scheduleDisplayMonth), [scheduleDisplayMonth])
  useEffect(() => {
    if (!persona?.theme) {
      return
    }

    const previousAccent = document.documentElement.style.getPropertyValue('--brand-accent')
    const previousAccentSoft = document.documentElement.style.getPropertyValue('--brand-accent-soft')

    document.documentElement.style.setProperty('--brand-accent', persona.theme.primaryColor || '#ff9460')
    document.documentElement.style.setProperty('--brand-accent-soft', persona.theme.secondaryColor || '#ff5e43')

    return () => {
      if (previousAccent) {
        document.documentElement.style.setProperty('--brand-accent', previousAccent)
      } else {
        document.documentElement.style.removeProperty('--brand-accent')
      }

      if (previousAccentSoft) {
        document.documentElement.style.setProperty('--brand-accent-soft', previousAccentSoft)
      } else {
        document.documentElement.style.removeProperty('--brand-accent-soft')
      }
    }
  }, [persona])

  useEffect(() => {
    if (persona?.professionalData?.operationMode === 'guidance') {
      setGuidanceConsentState('pending')
      setIsGuidanceFlowClosed(false)
      setCaseSummary(null)
      setGuidanceEvidenceItems([])
      setGuidanceProgress(createEmptyGuidanceProgress())
      setGuidanceDossier(createEmptyGuidanceDossier())
      setHighlightEvidencePanel(false)
      setIsCaseSubmitted(false)
      setCaseSubmitMessage(null)
      setIsSubmitConfirmOpen(false)
      return
    }

    setGuidanceConsentState('declined')
    setIsGuidanceFlowClosed(false)
    setCaseSummary(null)
    setGuidanceEvidenceItems([])
    setGuidanceProgress(createEmptyGuidanceProgress())
    setGuidanceDossier(createEmptyGuidanceDossier())
    setHighlightEvidencePanel(false)
    setIsCaseSubmitted(false)
    setCaseSubmitMessage(null)
    setIsSubmitConfirmOpen(false)
  }, [persona?.professionalData?.operationMode, brandSlug])

  useEffect(() => {
    if (availableModes.includes(activeMode)) {
      return
    }

    setActiveMode(getDefaultMode(persona))
  }, [activeMode, availableModes, persona])

  useEffect(() => {
    const nextMessages = loadMessages(customerMessagesStorageKey)
    setMessages(nextMessages)
    hasBootstrappedRef.current = nextMessages.length > 0
  }, [customerMessagesStorageKey])

  useEffect(() => {
    if (!brandSlug) {
      setPublicBrandStatus('ready')
      return
    }

    let isMounted = true

    const loadPublicBrand = async () => {
      setPublicBrandStatus('loading')

      try {
        const [publicBrand, availability] = await Promise.all([
          fetchPublicBrand(brandSlug),
          fetchPublicScheduleAvailability(brandSlug).catch(() => null),
        ])
        if (!isMounted) {
          return
        }

        setPersona(publicBrand.spark)
        setCatalogItems(publicBrand.catalog)
        setScheduleAvailability(availability)
        setScheduleAvailabilityFetchedAt(availability ? Date.now() : null)
        setActiveMode(getDefaultMode(publicBrand.spark))
        setPublicBrandStatus('ready')
      } catch (error) {
        if (!isMounted) {
          return
        }

        console.error(error)
        setPersona(null)
        setCatalogItems([])
        setScheduleAvailability(null)
        setScheduleAvailabilityFetchedAt(null)
        setPublicBrandStatus('not-found')
      }
    }

    void loadPublicBrand()

    return () => {
      isMounted = false
    }
  }, [brandSlug])

  const refreshScheduleAvailability = async () => {
    if (!brandSlug) {
      return null
    }

    const availability = await fetchPublicScheduleAvailability(brandSlug)
    setScheduleAvailability(availability)
    setScheduleAvailabilityFetchedAt(Date.now())
    return availability
  }

  const recoverFromStaleScheduleAvailability = async () => {
    handleScheduleFieldChange('time', '')
    setCurrentScheduleStep('time')
    setScheduleSubmitMessage('Esse horário ficou desatualizado. Atualizei a agenda para você escolher outro horário.')

    try {
      await refreshScheduleAvailability()
    } catch (error) {
      console.error(error)
      setScheduleSubmitMessage('Esse horário expirou e não consegui atualizar a agenda agora. Tente novamente em instantes.')
    }
  }

  useEffect(() => {
    if (brandSlug) {
      return
    }

    const syncPublicData = () => {
      const nextPersona = loadBrandPersona()
      setPersona(nextPersona)
      setActiveMode((currentMode) => (getAvailableModes(nextPersona).includes(currentMode) ? currentMode : getDefaultMode(nextPersona)))

      const configuredCatalog = loadCatalogItems()
      setCatalogItems(configuredCatalog.length > 0 ? configuredCatalog : mockCatalog)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key && ![PERSONA_STORAGE_KEY, CATALOG_STORAGE_KEY].includes(event.key)) {
        return
      }

      syncPublicData()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncPublicData()
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', syncPublicData)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', syncPublicData)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [brandSlug])

  useEffect(() => {
    if (!persona || !showCarousel || !persona.carouselImages || persona.carouselImages.length <= 1) {
      setActiveCarouselIndex(0)
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveCarouselIndex((currentIndex) => (currentIndex + 1) % persona.carouselImages!.length)
    }, 3600)

    return () => window.clearInterval(intervalId)
  }, [persona?.carouselImages, showCarousel])

  const persistSparkMemory = (updater: (currentMemory: SparkMemory) => SparkMemory) => {
    setSparkMemory((currentMemory) => {
      const nextMemory = updater(currentMemory)
      saveSparkMemory(sparkMemoryStorageKey, nextMemory)
      return nextMemory
    })
  }

  const scheduleSparkReset = (nextState: SparkState) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
    }

    if (nextState !== 'idle') {
      timeoutRef.current = window.setTimeout(() => {
        setSparkState('idle')
      }, 1600)
    }
  }

  const triggerIntroPulse = () => {
    if (introPulseTimeoutRef.current) {
      window.clearTimeout(introPulseTimeoutRef.current)
    }

    setIsIntroPulseActive(true)
    introPulseTimeoutRef.current = window.setTimeout(() => {
      setIsIntroPulseActive(false)
    }, 1800)
  }

  const startConversation = async (force = false, userIdOverride?: string) => {
    if (!persona) {
      return
    }

    if (!force && !acquireBootstrapLock()) {
      return
    }

    if (force) {
      window.sessionStorage.setItem(BOOTSTRAP_LOCK_KEY, String(Date.now()))
    }

    const requestId = bootstrapRequestIdRef.current + 1
    bootstrapRequestIdRef.current = requestId
    const effectiveUserId = userIdOverride ?? userId

    setIsLoading(true)
    setSparkState('idle')

    const nextSparkMemory = recordInteractionWindow(incrementConversationCount(loadSparkMemory(sparkMemoryStorageKey)))
    saveSparkMemory(sparkMemoryStorageKey, nextSparkMemory)
    setSparkMemory(nextSparkMemory)

    try {
      const result = await axios.post<ChannelMessageResponse>(buildApiUrl('/channel/message'), {
        channel: 'web',
        user_id: effectiveUserId,
        brand_name: persona.brandName,
        ...(brandSlug ? { tenant_slug: brandSlug } : {}),
        mode: activeMode,
        guidance_consent: guidanceConsentState === 'accepted',
        message: '',
        persona: buildPersonaPayload(persona),
        messages: [],
        ...(guidanceEvidenceItems.length > 0 ? { evidence_items: guidanceEvidenceItems } : {}),
        context_mode: 'customer',
        business_goal: persona.businessGoal || 'volume',
        metadata: {
          source: 'chat-ui',
          intent: 'conversation_start',
        },
        ...(businessStatus ? { business_status: businessStatus } : {}),
        ...(buildSparkMemorySummary(nextSparkMemory) ? { memory_summary: buildSparkMemorySummary(nextSparkMemory) } : {}),
        ...(!isEmergencyMode && activeFeatures.products && catalogSummary.length > 0 ? { catalog_summary: catalogSummary } : {}),
        ...(locationSummary ? { location_summary: locationSummary } : {}),
        ...(!isEmergencyMode && pageHighlights ? { page_highlights: pageHighlights } : {}),
      })

      if (bootstrapRequestIdRef.current !== requestId) {
        return
      }

      setMessages([{ role: 'ai', content: result.data.response }])
      setCaseSummary(result.data.metadata?.case_summary ?? null)
      setIsGuidanceFlowClosed(result.data.metadata?.flow_closed === true)
      setCaseChecklist(normalizeCaseChecklist(result.data.metadata))
      setCaseProgress(normalizeCaseProgress(result.data.metadata))
      setGuidanceProgress(
        result.data.metadata?.guidance_progress
          ? {
              contexto: buildProgressStatusFromChecklist(
                result.data.metadata?.case_checklist?.context === true,
                (result.data.metadata.guidance_progress.contexto as GuidanceProgress['contexto']) ?? 'pendente',
              ),
              impacto: buildProgressStatusFromChecklist(
                result.data.metadata?.case_checklist?.impact === true,
                (result.data.metadata.guidance_progress.impacto as GuidanceProgress['impacto']) ?? 'pendente',
              ),
              evidencias: buildProgressStatusFromChecklist(
                result.data.metadata?.case_checklist?.evidence === true,
                (result.data.metadata.guidance_progress.evidencias as GuidanceProgress['evidencias']) ?? 'pendente',
              ),
              proximos_passos: buildProgressStatusFromChecklist(
                result.data.metadata?.case_checklist?.nextSteps === true,
                (result.data.metadata.guidance_progress.proximos_passos as GuidanceProgress['proximos_passos']) ?? 'pendente',
              ),
            }
          : createEmptyGuidanceProgress(),
      )
      setGuidanceDossier(
        result.data.metadata?.guidance_dossier
          ? {
              situacao_identificada: result.data.metadata.guidance_dossier.situacao_identificada || 'Aguardando informações',
              contexto: result.data.metadata.guidance_dossier.contexto || 'Em coleta',
              impacto: result.data.metadata.guidance_dossier.impacto || 'Em coleta',
              evidencias: result.data.metadata.guidance_dossier.evidencias?.length ? result.data.metadata.guidance_dossier.evidencias : ['Em coleta'],
              proximos_passos: result.data.metadata.guidance_dossier.proximos_passos?.length ? result.data.metadata.guidance_dossier.proximos_passos : ['Em coleta'],
            }
          : createEmptyGuidanceDossier(),
      )
      if (result.data.metadata?.highlight_evidence) {
        triggerEvidencePanelHighlight(setHighlightEvidencePanel, evidenceHighlightTimeoutRef)
      }
      setSparkState('speaking')
      scheduleSparkReset('speaking')
      triggerIntroPulse()
      persistSparkMemory((currentMemory) => recordDetectedIntent(currentMemory, result.data.metadata?.detected_intent ?? 'unknown', ''))
    } catch (error) {
      if (bootstrapRequestIdRef.current !== requestId) {
        return
      }

      console.error(error)
      setMessages([{ role: 'ai', content: BOOTSTRAP_ERROR_MESSAGE }])
      setSparkState('idle')
    } finally {
      if (bootstrapRequestIdRef.current === requestId) {
        releaseBootstrapLock()
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    setSparkMemory(loadSparkMemory(sparkMemoryStorageKey))
  }, [sparkMemoryStorageKey])

  useEffect(() => {
    if (publicBrandStatus !== 'ready' || !persona) {
      return
    }

    if (isProfessionalGuidanceMode && guidanceConsentState === 'pending') {
      return
    }

    if (!hasBootstrappedRef.current && messages.length === 0) {
      hasBootstrappedRef.current = true
      void startConversation()
    }

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }

      if (introPulseTimeoutRef.current) {
        window.clearTimeout(introPulseTimeoutRef.current)
      }
    }
  }, [guidanceConsentState, guidanceEvidenceItems, isProfessionalGuidanceMode, messages.length, persona, publicBrandStatus])

  useEffect(() => {
    if (messages.length > 0) {
      window.localStorage.setItem(customerMessagesStorageKey, JSON.stringify(messages))
      return
    }

    window.localStorage.removeItem(customerMessagesStorageKey)
  }, [customerMessagesStorageKey, messages])

  const sendUserMessage = async (rawMessage: string, evidenceOverride?: GuidanceEvidenceItem[]) => {
    if (!persona) {
      return
    }

    const trimmedMessage = rawMessage.trim()
    if (!trimmedMessage || isLoading) {
      return
    }
    const effectiveEvidenceItems = evidenceOverride ?? guidanceEvidenceItems

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
    }

    setIsLoading(true)
    setSparkState('thinking')
    const userMessage: Message = { role: 'user', content: trimmedMessage }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setMessage('')

    try {
      const result = await axios.post<ChannelMessageResponse>(buildApiUrl('/channel/message'), {
        channel: 'web',
        user_id: userId,
        brand_name: persona.brandName,
        ...(brandSlug ? { tenant_slug: brandSlug } : {}),
        mode: activeMode,
        guidance_consent: guidanceConsentState === 'accepted' && !isGuidanceFlowClosed,
        message: trimmedMessage,
        persona: buildPersonaPayload(persona),
        messages,
        ...(effectiveEvidenceItems.length > 0 ? { evidence_items: effectiveEvidenceItems } : {}),
        context_mode: 'customer',
        business_goal: persona.businessGoal || 'volume',
        metadata: {
          source: 'chat-ui',
        },
        ...(businessStatus ? { business_status: businessStatus } : {}),
        ...(memorySummary ? { memory_summary: memorySummary } : {}),
        ...(!isEmergencyMode && activeFeatures.products && catalogSummary.length > 0 ? { catalog_summary: catalogSummary } : {}),
        ...(locationSummary ? { location_summary: locationSummary } : {}),
        ...(!isEmergencyMode && pageHighlights ? { page_highlights: pageHighlights } : {}),
      })

      setMessages((previousMessages) => [...previousMessages, { role: 'ai', content: result.data.response }])
      if (result.data.metadata?.case_summary) {
        setCaseSummary(result.data.metadata.case_summary)
      }
      if (result.data.metadata?.flow_closed === true) {
        setIsGuidanceFlowClosed(true)
      }
      setCaseChecklist(normalizeCaseChecklist(result.data.metadata))
      setCaseProgress(normalizeCaseProgress(result.data.metadata))
      if (result.data.metadata?.guidance_progress) {
        setGuidanceProgress({
          contexto: buildProgressStatusFromChecklist(
            result.data.metadata?.case_checklist?.context === true,
            (result.data.metadata.guidance_progress.contexto as GuidanceProgress['contexto']) ?? 'pendente',
          ),
          impacto: buildProgressStatusFromChecklist(
            result.data.metadata?.case_checklist?.impact === true,
            (result.data.metadata.guidance_progress.impacto as GuidanceProgress['impacto']) ?? 'pendente',
          ),
          evidencias: buildProgressStatusFromChecklist(
            result.data.metadata?.case_checklist?.evidence === true,
            (result.data.metadata.guidance_progress.evidencias as GuidanceProgress['evidencias']) ?? 'pendente',
          ),
          proximos_passos: buildProgressStatusFromChecklist(
            result.data.metadata?.case_checklist?.nextSteps === true,
            (result.data.metadata.guidance_progress.proximos_passos as GuidanceProgress['proximos_passos']) ?? 'pendente',
          ),
        })
      }
      if (result.data.metadata?.guidance_dossier) {
        setGuidanceDossier({
          situacao_identificada: result.data.metadata.guidance_dossier.situacao_identificada || 'Aguardando informações',
          contexto: result.data.metadata.guidance_dossier.contexto || 'Em coleta',
          impacto: result.data.metadata.guidance_dossier.impacto || 'Em coleta',
          evidencias: result.data.metadata.guidance_dossier.evidencias?.length ? result.data.metadata.guidance_dossier.evidencias : ['Em coleta'],
          proximos_passos: result.data.metadata.guidance_dossier.proximos_passos?.length ? result.data.metadata.guidance_dossier.proximos_passos : ['Em coleta'],
        })
      }
      if (result.data.metadata?.highlight_evidence) {
        triggerEvidencePanelHighlight(setHighlightEvidencePanel, evidenceHighlightTimeoutRef)
      }
      setSparkState(result.data.spark_state)
      scheduleSparkReset(result.data.spark_state)
      persistSparkMemory((currentMemory) =>
        recordDetectedIntent(recordInteractionWindow(currentMemory), result.data.metadata?.detected_intent ?? 'unknown', trimmedMessage),
      )
    } catch (error) {
      console.error(error)
      setMessages((previousMessages) => [
        ...previousMessages,
        { role: 'ai', content: 'Tive um ruido aqui agora. Me chama de novo que eu volto.' },
      ])
      setSparkState('idle')
    } finally {
      setIsLoading(false)
    }
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await sendUserMessage(message)
  }

  const handleCatalogAction = async (item: CatalogItem) => {
    setMobileSection('chat')
    setActiveMode((currentMode) => (currentMode === 'emergency' ? 'service' : currentMode))
    await sendUserMessage(buildItemMessage(item))
  }

  const handleModeChange = (mode: CustomerMode) => {
    setSelectedItem(null)
    setMobileSection('chat')
    setActiveMode(mode)
  }

  const acceptGuidanceConsent = () => {
    setGuidanceConsentState('accepted')
    if (messages.length === 0) {
      hasBootstrappedRef.current = true
      void startConversation(true)
    }
  }

  const declineGuidanceConsent = () => {
    setGuidanceConsentState('declined')
    setMobileSection('chat')
  }

  const exitPendingGuidanceMode = () => {
    setMobileSection('chat')
    setActiveMode(getDefaultMode(persona))
  }

  const resumePendingGuidanceMode = () => {
    if (!emergencyEnabled) {
      return
    }

    setMobileSection('chat')
    setActiveMode('emergency')
  }

  const handleEmergencyMode = () => {
    if (!emergencyEnabled) {
      return
    }

    handleModeChange('emergency')
  }

  const handleWhatsAppOpen = (item?: CatalogItem | null) => {
    const url = buildWhatsAppUrl(whatsappNumber, buildWhatsAppMessage(item))
    if (!url) {
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleEvidenceSelection = (type: GuidanceEvidenceItem['type'], files: FileList | null) => {
    const nextItems = createEvidenceItems(files, type)
    if (nextItems.length === 0) {
      return
    }

    const mergedEvidenceItems = [...guidanceEvidenceItems, ...nextItems]
    setGuidanceEvidenceItems(mergedEvidenceItems)
    handleEvidenceAdded(nextItems.length)
    if (guidanceConsentState === 'accepted' && !isGuidanceFlowClosed) {
      void sendUserMessage(
        type === 'image'
          ? 'Adicionei fotos ao caso para complementar o dossiê.'
          : type === 'video'
            ? 'Adicionei um vídeo ao caso para complementar o dossiê.'
            : 'Adicionei um áudio ao caso para complementar o dossiê.',
        mergedEvidenceItems,
      )
    }
  }

  const handleNoEvidenceConfirmation = () => {
    setCaseChecklist((currentChecklist) => ({
      ...currentChecklist,
      evidence: true,
    }))
    setCaseProgress((currentProgress) => {
      const evidenceWasComplete = currentProgress.hasEvidence || caseChecklist.evidence
      const nextCompletedCount = currentProgress.completedCount + (evidenceWasComplete ? 0 : 1)
      return {
        ...currentProgress,
        completedCount: nextCompletedCount,
        hasEvidence: false,
        isPartiallyReady: nextCompletedCount >= 2 && !currentProgress.readyForSubmission,
      }
    })
    setGuidanceProgress((currentProgress) => ({
      ...currentProgress,
      evidencias: 'concluido',
    }))
    setGuidanceCtaState((currentState) => ({
      ...currentState,
      showWhatsAppCta: false,
    }))
    void sendUserMessage('Não tenho evidências disponíveis no momento, mas quero seguir com a orientação inicial.')
  }

  const handleSummaryForward = () => {
    if (!caseSummary || !whatsappNumber) {
      return
    }

    const url = buildWhatsAppUrl(whatsappNumber, formatSummaryForWhatsApp(caseSummary, persona?.ctaConfig?.whatsappMessageTemplate))
    if (!url) {
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleSuggestedWhatsAppForward = () => {
    if (!whatsappNumber) {
      return
    }

    const messageToSend = caseSummary
      ? formatSummaryForWhatsApp(caseSummary, persona?.ctaConfig?.whatsappMessageTemplate)
      : buildGuidanceWhatsAppSuggestionMessage(guidanceDossier, caseSummary)
    const url = buildWhatsAppUrl(whatsappNumber, messageToSend)
    if (!url) {
      return
    }

    setGuidanceCtaState((currentState) => ({
      ...currentState,
      showWhatsAppCta: false,
    }))
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleEvidenceAdded = (evidenceCount: number) => {
    if (evidenceCount <= 0 || !isProfessionalGuidanceMode || guidanceConsentState !== 'accepted' || isCaseSubmitted) {
      return
    }

    setCaseChecklist((currentChecklist) => ({
      ...currentChecklist,
      evidence: true,
    }))
    setCaseProgress((currentProgress) => {
      const evidenceWasComplete = currentProgress.hasEvidence || caseChecklist.evidence
      const nextCompletedCount = currentProgress.completedCount + (evidenceWasComplete ? 0 : 1)
      return {
        ...currentProgress,
        completedCount: nextCompletedCount,
        hasEvidence: true,
        isPartiallyReady: nextCompletedCount >= 2 && !currentProgress.readyForSubmission,
      }
    })
    setGuidanceProgress((currentProgress) => ({
      ...currentProgress,
      evidencias: 'concluido',
    }))
    if (!hasConfiguredWhatsApp || persona?.ctaConfig?.showAfterEvidence === false) {
      return
    }

    setGuidanceCtaState((currentState) => {
      if (currentState.whatsappSuggested) {
        return currentState
      }

      return {
        whatsappSuggested: true,
        showWhatsAppCta: true,
      }
    })
  }

  const handleNewConversation = () => {
    resetCustomerStorage(brandSlug)

    const nextUserId = getOrCreateUserId()
    setUserId(nextUserId)
    setMessages([])
    setMessage('')
    setSparkState('idle')
    setIsLoading(false)
    setSelectedItem(null)
    setCaseSummary(null)
    setGuidanceEvidenceItems([])
    setGuidanceProgress(createEmptyGuidanceProgress())
    setGuidanceDossier(createEmptyGuidanceDossier())
    setCaseChecklist(createEmptyCaseChecklist())
    setCaseProgress(createEmptyCaseProgress())
    setGuidanceCtaState(createEmptyGuidanceCtaState())
    setIsGuidanceFlowClosed(false)
    setIsCaseSubmitted(false)
    setCaseSubmitMessage(null)
    setIsSubmitConfirmOpen(false)
    setSparkMemory(loadSparkMemory(sparkMemoryStorageKey))
    releaseBootstrapLock()

    if (persona?.professionalData?.operationMode === 'guidance') {
      setGuidanceConsentState('pending')
      hasBootstrappedRef.current = false
      return
    }

    setGuidanceConsentState('declined')
    hasBootstrappedRef.current = false
    void startConversation(true, nextUserId)
  }

  const handleCaseSubmit = async () => {
    if (!brandSlug || !flowReadyForSubmission || isCaseSubmitting) {
      return
    }

    setIsCaseSubmitting(true)
    try {
      const result = await axios.post<CaseSubmitResponse>(
        buildApiUrl('/case/submit'),
        {
          tenant_slug: brandSlug,
          user_id: userId,
          case_type: caseSummary?.tipo || guidanceDossier.situacao_identificada,
          summary: buildCaseSubmissionSummary(guidanceDossier, caseSummary),
          messages_relevant: messages.slice(-8).map((item) => `${item.role}: ${item.content}`),
          evidences: guidanceEvidenceItems,
          timestamp: new Date().toISOString(),
          guidance_mode: true,
        },
      )

      setIsCaseSubmitted(true)
      setIsSubmitConfirmOpen(false)
      setGuidanceConsentState('declined')
      setCaseSubmitMessage(result.data.message)
    } catch (error) {
      console.error(error)
      setCaseSubmitMessage('Não consegui encaminhar o caso agora. Tente de novo em instantes.')
    } finally {
      setIsCaseSubmitting(false)
    }
  }

  const getInitialScheduleStep = () => {
    if (scheduleSteps.includes('service')) {
      return 'service' as ScheduleStep
    }
    if (scheduleSteps.includes('mode')) {
      return 'mode' as ScheduleStep
    }
    return 'date' as ScheduleStep
  }

  const resetScheduleWizard = () => {
    const defaultService = persona?.schedulingConfig?.serviceOptions?.[0] ?? ''
    const nextInitialStep = getInitialScheduleStep()
    setScheduleSubmitMessage(null)
    setScheduleConfirmation(null)
    setScheduleForm({
      name: '',
      phone: '',
      service: scheduleSteps.includes('service') ? '' : defaultService,
      attendanceMode: enabledAttendanceModes.length === 1 ? enabledAttendanceModes[0] : '',
      date: '',
      time: '',
      note: '',
      locationDetails: '',
    })
    setCurrentScheduleStep(nextInitialStep)
  }

  const openScheduleWizard = () => {
    setMobileSection('chat')
    setIsScheduleFormOpen(true)
    resetScheduleWizard()
  }

  const closeScheduleWizard = () => {
    setIsScheduleFormOpen(false)
    resetScheduleWizard()
  }

  const goToPreviousScheduleStep = () => {
    const currentIndex = scheduleSteps.indexOf(currentScheduleStep)
    if (currentIndex <= 0) {
      setIsScheduleFormOpen(false)
      return
    }
    setScheduleSubmitMessage(null)
    setCurrentScheduleStep(scheduleSteps[currentIndex - 1])
  }

  const handleScheduleFieldChange = (field: keyof ScheduleFormState, value: string) => {
    setScheduleForm((currentForm) => {
      const nextForm = { ...currentForm, [field]: value }

      if (field === 'service') {
        nextForm.date = ''
        nextForm.time = ''
      }

      if (field === 'attendanceMode') {
        nextForm.date = ''
        nextForm.time = ''
        if (value !== 'domicilio') {
          nextForm.locationDetails = ''
        }
      }

      if (field === 'date') {
        nextForm.time = ''
      }

      return nextForm
    })
    if (scheduleSubmitMessage) {
      setScheduleSubmitMessage(null)
    }
  }

  const isCalendarDateAvailable = (date: Date) => {
    const dateKey = formatLocalDate(date)
    if (scheduleAvailability?.blocked_dates.includes(dateKey)) {
      return false
    }

    const weeklyAvailability = persona?.schedulingConfig?.weeklyAvailability
    if (!weeklyAvailability) {
      return false
    }

    const weekdayKey = SCHEDULING_WEEKDAY_INDEX[date.getDay()]
    const entry = weeklyAvailability[weekdayKey]
    return Boolean(entry?.enabled && entry.start && entry.end)
  }

  const handleScheduleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!brandSlug || !persona?.schedulingConfig?.enabled || isScheduleSubmitting) {
      return
    }

    if (
      !scheduleForm.name.trim() ||
      !scheduleForm.phone.trim() ||
      !scheduleForm.service.trim() ||
      !scheduleForm.date.trim() ||
      !scheduleForm.time.trim() ||
      !effectiveScheduleAttendanceMode
    ) {
      setScheduleSubmitMessage('Preencha nome, telefone, serviço, dia e horário para concluir o agendamento.')
      return
    }

    if (effectiveScheduleAttendanceMode === 'domicilio' && !scheduleForm.locationDetails.trim()) {
      setScheduleSubmitMessage('Informe endereço, bairro ou referência para atendimentos em domicílio.')
      return
    }

    if (hasScheduleAvailabilityExpired(scheduleAvailabilityFetchedAt)) {
      await recoverFromStaleScheduleAvailability()
      return
    }

    setIsScheduleSubmitting(true)
    try {
      const result = await createScheduleBooking({
        tenant_slug: brandSlug,
        name: scheduleForm.name.trim(),
        phone: scheduleForm.phone.trim(),
        service: scheduleForm.service.trim(),
        attendance_mode: effectiveScheduleAttendanceMode,
        date: scheduleForm.date,
        time: scheduleForm.time,
        note: scheduleForm.note.trim() || undefined,
        location_details: scheduleForm.locationDetails.trim() || undefined,
      })

      setScheduleSubmitMessage(
        persona.schedulingConfig.manualConfirmation
          ? 'Pedido de agendamento enviado. A empresa vai confirmar o horário com você.'
          : 'Agendamento enviado com sucesso. A empresa recebeu seu horário.'
      )
      setScheduleConfirmation({ whatsappUrl: result.whatsapp_url })
      setCurrentScheduleStep('confirm')
    } catch (error) {
      console.error(error)
      setScheduleSubmitMessage('Não consegui enviar seu agendamento agora. Tente novamente em instantes.')
    } finally {
      setIsScheduleSubmitting(false)
    }
  }

  if (brandSlug && publicBrandStatus === 'loading') {
    return (
      <main className="customer-shell spark-idle">
        <section className="customer-hero">
          <div className="customer-hero-copy">
            <div className="customer-brand-badge">Carregando marca</div>
            <h1 className="customer-title brand-headline">Estou preparando esse espaço para você.</h1>
            <p className="customer-subtitle brand-subtext">So um instante enquanto eu trago a marca certa.</p>
          </div>
        </section>
      </main>
    )
  }

  if (brandSlug && publicBrandStatus === 'not-found') {
    return (
      <main className="customer-shell spark-idle">
        <section className="customer-hero">
          <div className="customer-hero-copy">
            <div className="customer-brand-badge">Marca não encontrada</div>
            <h1 className="customer-title brand-headline">Não encontrei essa marca por aqui.</h1>
            <p className="customer-subtitle brand-subtext">Confere o link e tenta de novo. Se quiser, eu volto quando a marca estiver publicada.</p>
          </div>
        </section>
      </main>
    )
  }

  if (!persona) {
    return null
  }

  return (
    <main className={`customer-shell spark-${sparkState}`} style={customerThemeStyle}>
      {brandSlug ? (
        <section className="customer-legacy-notice" aria-label="Fluxo legado">
          <strong>Fluxo legado</strong>
          <span>
            Esta rota existe apenas por compatibilidade. Novas capacidades publicas da BrandSoul devem nascer em
            {' '}
            <code>/entity/:id</code>
            .
          </span>
        </section>
      ) : null}

      <section className="customer-hero">
        {persona.institutionalImage ? (
          <div className="customer-hero-media">
            <img src={persona.institutionalImage} alt={`Imagem institucional de ${persona.brandName}`} className="customer-hero-image" />
          </div>
        ) : null}

        <div className="brand-header">
          <div className="customer-brand-badge">{persona.brandName}</div>
          <div className="brand-header-copy">
            <div className="brand-title-row">
              {persona.logo ? <img src={persona.logo} alt={`Logo de ${persona.brandName}`} className="brand-logo" /> : null}
              <strong className="brand-title brand-title--alive">{persona.brandName || 'Sua marca'}</strong>
            </div>
            <div className="brand-divider" aria-hidden="true" />
            <div className="brand-meta" aria-label="Contexto da marca">
              {brandCategory ? <span className="brand-meta-chip">{brandCategory}</span> : null}
              {persona.serviceRegion ? <span className="brand-meta-chip">{persona.serviceRegion}</span> : null}
              {businessStatusLabel ? <span className={`business-status ${businessStatus === 'open' ? 'online' : 'offline'}`}>{businessStatusLabel}</span> : null}
            </div>
            {locationLabel ? <div className="brand-location">📍 {locationLabel}</div> : null}
          </div>
        </div>

        <div className="customer-hero-copy">
          <h1 className="customer-title brand-headline">{buildCustomerHeadline(persona)}</h1>
          <p className="customer-subtitle brand-subtext">{buildCustomerSubtext(persona)}</p>
        </div>

        <div className="customer-spark-wrap">
          <div className={`spark-stage customer-spark-stage ${isIntroPulseActive ? 'spark-intro-active' : ''}`}>
            <BrandSpark brandName={persona.brandName} state={sparkState} tone={persona.tone} power={persona.power} logo={persona.logo} />
          </div>
        </div>

        {emergencyEnabled ? (
          <div className="customer-emergency-strip">
            <div className="customer-emergency-copy">
              <strong>{isProfessionalBrand ? 'Precisa de ajuda agora?' : 'Tive um problema agora'}</strong>
              <span>
                {isProfessionalBrand
                  ? 'Se precisar, eu entro em triagem inicial, organizo o contexto e preparo os próximos passos.'
                  : 'Se precisar, eu mudo o fluxo e passo a conduzir essa conversa como ocorrência.'}
              </span>
            </div>
            <button type="button" className={`customer-emergency-button ${activeMode === 'emergency' ? 'active' : ''}`} onClick={handleEmergencyMode}>
              {activeMode === 'emergency' ? 'Modo crítico ativo' : isProfessionalBrand ? 'Precisa de ajuda agora?' : 'Tive um problema agora'}
            </button>
          </div>
        ) : null}

        {isProfessionalBrand ? (
          <div className="professional-compliance-note">
            Orientação inicial informativa. A análise jurídica completa é realizada por advogado.
          </div>
        ) : null}
      </section>

      {isProfessionalBrand ? (
        <section className="customer-highlight-section professional-profile-top" aria-label="Perfil profissional">
          <div className="customer-section-heading">
            <span className="catalog-kicker">Perfil profissional</span>
            <h2>{persona.brandName}</h2>
            <p className="brand-subtext">{professionalAuthorityLine}</p>
          </div>
          <div className="professional-grid">
            {topPracticeAreas.length > 0 ? (
              topPracticeAreas.map((area) => (
                <div key={area} className="professional-card professional-card--chip">
                  <span className="professional-label">Área de atuação</span>
                  <strong>{area}</strong>
                </div>
              ))
            ) : (
              <article className="professional-card">
                <span className="professional-label">Atuação</span>
                <p>Atendimento profissional com orientação inicial clara, organização do caso e encaminhamento responsável.</p>
              </article>
            )}
          </div>
        </section>
      ) : null}

      {showOrientationConsent ? (
        <section className="customer-highlight-section" aria-label="Consentimento para orientação inicial">
          <div className="customer-section-heading">
            <span className="catalog-kicker">Modo de orientação</span>
            <h2>Você deseja receber uma orientação inicial baseada em diretrizes profissionais?</h2>
          </div>
          <div className="professional-grid">
            <article className="professional-card">
              <span className="professional-label">Antes de iniciar</span>
              <p>
                Essa orientação tem caráter informativo e não substitui a análise completa de um profissional.
              </p>
              <div className="persona-toggle-row">
                <button
                  type="button"
                  className="persona-toggle"
                  onClick={acceptGuidanceConsent}
                >
                  Aceitar orientação
                </button>
                <button type="button" className="persona-toggle subtle" onClick={declineGuidanceConsent}>
                  Continuar sem orientação
                </button>
                <button type="button" className="persona-toggle subtle" onClick={exitPendingGuidanceMode}>
                  Sair do modo
                </button>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <section className="customer-mobile-nav" aria-label="Navegação da experiência">
        {hasDiscoverySection ? (
          <button type="button" className={`customer-mobile-toggle ${mobileSection === 'catalog' ? 'active' : ''}`} onClick={() => setMobileSection('catalog')}>
            {showProductsSection && showServicesSection ? 'Produtos e serviços' : showServicesSection ? 'Serviços' : 'Explorar opções'}
          </button>
        ) : null}
        <button type="button" className={`customer-mobile-toggle ${mobileSection === 'chat' || isEmergencyMode ? 'active' : ''}`} onClick={() => setMobileSection('chat')}>
          {isEmergencyMode ? 'Fluxo crítico' : 'Falar comigo'}
        </button>
      </section>

      {showProductsSection && showCarousel && persona.carouselImages ? (
        <section className="customer-highlight-section customer-carousel-section" aria-label="Destaques visuais da marca">
          <div className="customer-section-heading">
            <span className="catalog-kicker">Destaques</span>
            <h2>Posso te mostrar o que está em evidência agora.</h2>
          </div>
          <div className="customer-carousel-card">
            <img
              src={persona.carouselImages[activeCarouselIndex]}
              alt={`Destaque ${activeCarouselIndex + 1} de ${persona.brandName}`}
              className="customer-carousel-image"
            />
            {persona.carouselImages.length > 1 ? (
              <div className="customer-carousel-dots">
                {persona.carouselImages.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    className={`customer-carousel-dot ${index === activeCarouselIndex ? 'active' : ''}`}
                    onClick={() => setActiveCarouselIndex(index)}
                    aria-label={`Ver destaque ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {showProductsSection && showPromotions && promotionItems.length > 0 ? (
        <section className="customer-highlight-section" aria-label="Promoções em destaque">
          <div className="customer-section-heading">
            <span className="catalog-kicker">Promoções em destaque</span>
            <h2>Posso te mostrar o que está com condição especial agora.</h2>
          </div>
          <div className="catalog-grid">
            {promotionItems.map((item) => (
              <ProductCard key={`promotion-${item.id}`} item={item} onPrimaryAction={handleCatalogAction} onOpen={setSelectedItem} onWhatsAppAction={whatsappNumber ? handleWhatsAppOpen : undefined} />
            ))}
          </div>
        </section>
      ) : null}

      {showProductsSection && showNewArrivals && newArrivalItems.length > 0 ? (
        <section className="customer-highlight-section" aria-label="Novidades">
          <div className="customer-section-heading">
            <span className="catalog-kicker">Novidades</span>
            <h2>Também tenho novidades que podem te interessar.</h2>
          </div>
          <div className="catalog-grid">
            {newArrivalItems.map((item) => (
              <ProductCard key={`new-${item.id}`} item={item} onPrimaryAction={handleCatalogAction} onOpen={setSelectedItem} onWhatsAppAction={whatsappNumber ? handleWhatsAppOpen : undefined} />
            ))}
          </div>
        </section>
      ) : null}

      {showProfessionalSections && professionalOperationMode === 'authority' && !isGuidanceActive ? (
        <>
          {(persona.professionalData?.cases?.length ?? 0) > 0 ? (
            <section className="customer-highlight-section" aria-label="Casos e atuação profissional">
              <div className="customer-section-heading">
                <span className="catalog-kicker">Casos e atuação profissional</span>
                <h2>Uma leitura clara de contextos, abordagem e condução profissional.</h2>
              </div>
              <div className="professional-grid">
                {persona.professionalData?.cases?.slice(0, 3).map((item, index) => (
                  <article key={`${item.caseType}-${index}`} className="professional-card">
                    <span className="professional-label">{index === 0 ? 'Em destaque' : 'Atuação profissional'}</span>
                    <strong>{item.caseType}</strong>
                    <p>{item.context}</p>
                    <p>{item.approach}</p>
                    {item.learning ? <p>{item.learning}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {(persona.professionalData?.contents?.length ?? 0) > 0 ? (
            <section className="customer-highlight-section" aria-label="Conteúdos e posicionamento">
              <div className="customer-section-heading">
                <span className="catalog-kicker">Conteúdos e posicionamento</span>
                <h2>Conteúdo útil para orientar, explicar e construir confiança com naturalidade.</h2>
              </div>
              <div className="professional-grid">
                {persona.professionalData?.contents?.slice(0, 3).map((item, index) => (
                  <article key={`${item.title}-${index}`} className="professional-card">
                    <span className="professional-label">{index === 0 ? 'Conteúdo relevante' : 'Posicionamento'}</span>
                    <strong>{item.title}</strong>
                    <p>{item.summary}</p>
                    {item.stance ? <p>{item.stance}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {(persona.professionalData?.identity?.headline || persona.professionalData?.identity?.principles?.length) ? (
            <section className="customer-highlight-section" aria-label="Identidade profissional">
              <div className="customer-section-heading">
                <span className="catalog-kicker">Identidade profissional</span>
                <h2>{persona.professionalData?.identity?.headline || 'Princípios que sustentam a atuação.'}</h2>
              </div>
              <div className="professional-grid">
                {(persona.professionalData?.identity?.principles ?? []).slice(0, 5).map((principle) => (
                  <div key={principle} className="professional-card professional-card--chip">
                    <span className="professional-label">Princípio</span>
                    <strong>{principle}</strong>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {showServicesSection ? (
      <section className={`customer-highlight-section customer-section ${mobileSection === 'chat' ? 'mobile-collapsed' : ''}`} aria-label="Serviços da marca">
        <div className="catalog-copy">
          <span className="catalog-kicker">Serviços</span>
          <h2>Entenda como essa marca atua e encontre a melhor frente para o seu contexto.</h2>
          <p>{buildCatalogIntro(persona)}</p>
        </div>

        <div className="professional-grid">
          {serviceOffers.length > 0 ? (
            serviceOffers.map((item, index) => (
              <article key={`${item.title}-${index}`} className="professional-card">
                <span className="professional-label">{item.label?.trim() || (index === 0 ? 'Em destaque' : 'Atendimento')}</span>
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
              </article>
            ))
          ) : (
            <article className="professional-card">
              <span className="professional-label">Atendimento</span>
              <strong>{persona.brandName}</strong>
              <p>{persona.businessDescription || 'Essa marca atende por contexto, conversa com clareza e organiza o próximo passo com você.'}</p>
            </article>
          )}
        </div>
      </section>
      ) : null}

      {isSchedulingEnabled && !isEmergencyMode ? (
      <section className={`customer-highlight-section customer-section ${mobileSection === 'chat' ? 'mobile-collapsed' : ''}`} aria-label="Agendamento">
        <div className="catalog-copy">
          <span className="catalog-kicker">Agenda</span>
          <h2>{persona?.schedulingConfig?.title || 'Agende seu atendimento com facilidade.'}</h2>
          <p>{persona?.schedulingConfig?.description || 'Escolha o serviço, selecione um horário e eu encaminho tudo para a operação confirmar com você.'}</p>
        </div>
        <div className="schedule-summary-grid">
          {persona?.schedulingConfig?.serviceOptions?.length ? (
            <article className="professional-card">
              <span className="professional-label">Serviços atendidos</span>
              <div className="customer-chip-row">
                {persona.schedulingConfig?.serviceOptions?.map((serviceOption) => (
                  <span key={serviceOption} className="customer-chip">
                    {serviceOption}
                  </span>
                ))}
              </div>
            </article>
          ) : null}
          <article className="professional-card schedule-meta">
            <span className="professional-label">Como funciona</span>
            <p>Escolha um dia disponível no calendário e depois selecione um horário.</p>
            <p>Dias indisponíveis não podem ser agendados.</p>
            {enabledAttendanceModes.length <= 1 ? (
              <p>
                {effectiveScheduleAttendanceMode === 'online'
                  ? 'Atendimento online'
                  : effectiveScheduleAttendanceMode === 'domicilio'
                    ? 'Atendimento em domicílio'
                    : 'Atendimento presencial'}
              </p>
            ) : (
              <p>Escolha como você prefere ser atendido antes de concluir a marcação.</p>
            )}
          </article>
        </div>
        <div className="persona-toggle-row">
          <button
            type="button"
            className="persona-toggle selected guidance-submit-button"
            onClick={() => (isScheduleFormOpen ? setIsScheduleFormOpen(false) : openScheduleWizard())}
          >
            Agendar horário
          </button>
        </div>
        {scheduleSubmitMessage ? <p className="guidance-submit-feedback">{scheduleSubmitMessage}</p> : null}
        {isScheduleFormOpen ? (
          <form className="schedule-booking-form" onSubmit={handleScheduleSubmit}>
            <div className="schedule-wizard-progress">
              <span className="schedule-wizard-progress-label">{scheduleProgressLabel}</span>
              <div className="schedule-wizard-progress-dots" aria-hidden="true">
                {scheduleSteps.map((step, index) => (
                  <span key={step} className={`schedule-wizard-progress-dot ${index <= currentScheduleStepIndex ? 'active' : ''}`} />
                ))}
              </div>
            </div>

            {currentScheduleStep === 'service' ? (
              <section className="schedule-step-card active schedule-step-screen">
                <div className="schedule-step-header">
                  <span className="professional-label">{scheduleProgressLabel}</span>
                  <strong>Escolha o serviço</strong>
                </div>
                <div className="schedule-choice-grid">
                  {(persona?.schedulingConfig?.serviceOptions?.length ? persona.schedulingConfig.serviceOptions : ['Atendimento']).map((serviceOption) => (
                    <button
                      key={serviceOption}
                      type="button"
                      className={`schedule-choice-card ${scheduleForm.service === serviceOption ? 'active' : ''}`}
                      onClick={() => {
                        handleScheduleFieldChange('service', serviceOption)
                        setCurrentScheduleStep(showScheduleModeStep ? 'mode' : 'date')
                      }}
                    >
                      <strong>{serviceOption}</strong>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {currentScheduleStep === 'mode' ? (
              <section className="schedule-step-card active schedule-step-screen">
                <div className="schedule-step-header">
                  <span className="professional-label">{scheduleProgressLabel}</span>
                  <strong>Como você prefere ser atendido?</strong>
                </div>
                <div className="schedule-choice-grid">
                  {enabledAttendanceModes.map((modeKey) => (
                    <button
                      key={modeKey}
                      type="button"
                      className={`schedule-choice-card ${effectiveScheduleAttendanceMode === modeKey ? 'active' : ''}`}
                      onClick={() => {
                        handleScheduleFieldChange('attendanceMode', modeKey)
                        setCurrentScheduleStep('date')
                      }}
                    >
                      <strong>{SCHEDULE_ATTENDANCE_MODE_LABELS[modeKey]}</strong>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {currentScheduleStep === 'date' ? (
              <section className="schedule-step-card active schedule-step-screen">
                <div className="schedule-step-header">
                  <span className="professional-label">{scheduleProgressLabel}</span>
                  <strong>Escolha um dia disponível</strong>
                </div>
                <div className="schedule-calendar-head">
                  <button type="button" className="persona-toggle subtle" onClick={() => setScheduleDisplayMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
                    Mês anterior
                  </button>
                  <strong>{scheduleDisplayMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
                  <button type="button" className="persona-toggle subtle" onClick={() => setScheduleDisplayMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
                    Próximo mês
                  </button>
                </div>
                <div className="schedule-calendar-grid">
                  {CALENDAR_WEEKDAY_LABELS.map((label) => (
                    <span key={label} className="schedule-calendar-weekday">{label}</span>
                  ))}
                  {scheduleCalendarDays.map((calendarDate, index) => {
                    if (!calendarDate) {
                      return <span key={`empty-${index}`} className="schedule-calendar-empty" aria-hidden="true" />
                    }

                    const dateKey = formatLocalDate(calendarDate)
                    const isPastDate = calendarDate < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
                    const isAvailable = !isPastDate && isCalendarDateAvailable(calendarDate)

                    return (
                      <button
                        key={dateKey}
                        type="button"
                        className={`schedule-calendar-day ${isAvailable ? 'available' : 'disabled'} ${scheduleForm.date === dateKey ? 'selected' : ''}`}
                        onClick={() => {
                          if (!isAvailable) {
                            return
                          }
                          handleScheduleFieldChange('date', dateKey)
                          setCurrentScheduleStep('time')
                        }}
                        disabled={!isAvailable}
                      >
                        <span>{calendarDate.getDate()}</span>
                        {!isAvailable ? <small>×</small> : null}
                      </button>
                    )
                  })}
                </div>
                <p className="schedule-empty-copy">Dias indisponíveis não podem ser agendados.</p>
              </section>
            ) : null}

            {currentScheduleStep === 'time' ? (
              <section className="schedule-step-card active schedule-step-screen">
                <div className="schedule-step-header">
                  <span className="professional-label">{scheduleProgressLabel}</span>
                  <strong>Selecione um horário</strong>
                </div>
                {availableTimeSlots.length > 0 ? (
                  <div className="schedule-choice-grid">
                    {availableTimeSlots.map((hourOption) => (
                      <button
                        key={hourOption}
                        type="button"
                        className={`schedule-choice-card ${scheduleForm.time === hourOption ? 'active' : ''}`}
                        onClick={async () => {
                          if (hasScheduleAvailabilityExpired(scheduleAvailabilityFetchedAt)) {
                            await recoverFromStaleScheduleAvailability()
                            return
                          }
                          handleScheduleFieldChange('time', hourOption)
                          setCurrentScheduleStep('form')
                        }}
                      >
                        <strong>{hourOption}</strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="schedule-empty-copy">Nenhum horário disponível para este dia.</p>
                )}
              </section>
            ) : null}

            {currentScheduleStep === 'form' ? (
              <section className="schedule-step-card active schedule-step-screen">
                <div className="schedule-step-header">
                  <span className="professional-label">{scheduleProgressLabel}</span>
                  <strong>Seus dados</strong>
                </div>
                <div className="admin-config-grid">
                  <label className="persona-field">
                    <span>Nome</span>
                    <input className="persona-input" value={scheduleForm.name} onChange={(event) => handleScheduleFieldChange('name', event.target.value)} placeholder="Seu nome" required />
                  </label>
                  <label className="persona-field">
                    <span>Telefone</span>
                    <input className="persona-input" value={scheduleForm.phone} onChange={(event) => handleScheduleFieldChange('phone', event.target.value)} placeholder="Seu WhatsApp" required />
                  </label>
                  {effectiveScheduleAttendanceMode === 'presencial' && (persona.address || persona.city || persona.state) ? (
                    <div className="persona-field admin-config-grid-span">
                      <span>Local do atendimento</span>
                      <p className="schedule-empty-copy">{[persona.address, persona.city, persona.state].filter(Boolean).join(' • ')}</p>
                    </div>
                  ) : null}
                  {effectiveScheduleAttendanceMode === 'online' ? (
                    <div className="persona-field admin-config-grid-span">
                      <span>Instruções</span>
                      <p className="schedule-empty-copy">O link ou instruções serão enviados após confirmação.</p>
                    </div>
                  ) : null}
                  {effectiveScheduleAttendanceMode === 'domicilio' ? (
                    <label className="persona-field admin-config-grid-span">
                      <span>Endereço, bairro ou referência</span>
                      <input className="persona-input" value={scheduleForm.locationDetails} onChange={(event) => handleScheduleFieldChange('locationDetails', event.target.value)} placeholder="Informe onde o atendimento deve acontecer." required />
                    </label>
                  ) : null}
                  <label className="persona-field admin-config-grid-span">
                    <span>Observação opcional</span>
                    <textarea className="persona-input persona-textarea" value={scheduleForm.note} onChange={(event) => handleScheduleFieldChange('note', event.target.value)} placeholder="Descreva rapidamente o contexto do atendimento." rows={3} />
                  </label>
                </div>
              </section>
            ) : null}

            {showScheduleConfirmStep ? (
              <section className="schedule-step-card active schedule-step-screen">
                <div className="schedule-step-header">
                  <span className="professional-label">{scheduleProgressLabel}</span>
                  <strong>Agendamento solicitado com sucesso</strong>
                </div>
                <p className="schedule-empty-copy">Seu pedido foi concluído. Você pode encerrar por aqui ou iniciar um novo agendamento agora.</p>
                <div className="schedule-confirm-summary">
                  <p><strong>Serviço:</strong> {scheduleForm.service}</p>
                  <p><strong>Modalidade:</strong> {SCHEDULE_ATTENDANCE_MODE_LABELS[effectiveScheduleAttendanceMode as 'presencial' | 'online' | 'domicilio']}</p>
                  <p><strong>Data:</strong> {scheduleForm.date}</p>
                  <p><strong>Horário:</strong> {scheduleForm.time}</p>
                </div>
              </section>
            ) : null}

            <div className="schedule-wizard-footer">
              {currentScheduleStep !== 'confirm' ? (
                <>
                  <button type="button" className="persona-toggle subtle" onClick={goToPreviousScheduleStep} disabled={isScheduleSubmitting}>
                    Voltar
                  </button>
                  {currentScheduleStep === 'form' ? (
                    <button type="submit" className="persona-toggle selected guidance-submit-button" disabled={isScheduleSubmitting}>
                      {isScheduleSubmitting ? 'Enviando...' : 'Confirmar agendamento'}
                    </button>
                  ) : (
                    <button type="button" className="persona-toggle selected guidance-submit-button" disabled>
                      Escolha uma opção para continuar
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="persona-toggle subtle"
                    onClick={closeScheduleWizard}
                  >
                    Sair do agendamento
                  </button>
                  <button
                    type="button"
                    className="persona-toggle selected guidance-submit-button"
                    onClick={openScheduleWizard}
                  >
                    Iniciar novo agendamento
                  </button>
                  <button
                    type="button"
                    className="persona-toggle subtle"
                    onClick={() => {
                      if (scheduleConfirmation?.whatsappUrl) {
                        window.open(scheduleConfirmation.whatsappUrl, '_blank', 'noopener,noreferrer')
                      }
                    }}
                    disabled={!scheduleConfirmation?.whatsappUrl}
                  >
                    Falar no WhatsApp
                  </button>
                </>
              )}
            </div>
          </form>
        ) : null}
      </section>
      ) : null}

      {showProductsSection ? (
      <section className={`catalog-section customer-section ${mobileSection === 'chat' || isEmergencyMode ? 'mobile-collapsed' : ''}`} aria-label="Catálogo da marca">
        <div className="catalog-copy">
          <span className="catalog-kicker">{showServicesSection ? 'Produtos' : 'Explorar opções'}</span>
          <h2>Escolha uma opção ou fale comigo para eu te ajudar a encontrar o melhor para você.</h2>
          <p>{buildCatalogIntro(persona)}</p>
        </div>

        <div className="catalog-grid">
          {catalogItems.map((item) => (
            <ProductCard key={item.id} item={item} onPrimaryAction={handleCatalogAction} onOpen={setSelectedItem} onWhatsAppAction={whatsappNumber ? handleWhatsAppOpen : undefined} />
          ))}
        </div>
      </section>
      ) : null}

      <div className={showGuidancePanels ? 'guidance-flow-layout' : 'guidance-flow-layout guidance-flow-layout--inactive'}>

      <section className={`customer-chat-card customer-section ${showGuidancePanels ? 'guidance-flow-chat' : ''} ${mobileSection === 'catalog' && !isEmergencyMode && hasDiscoverySection ? 'mobile-collapsed' : ''}`}>
        <div className="customer-chat-intro">
          <div className="customer-chat-toolbar">
            <span className="catalog-kicker">{buildModeHeadline(activeMode)}</span>
            <button type="button" className="customer-chat-reset" onClick={handleNewConversation}>
              Nova conversa
            </button>
          </div>
          <h2>{buildModeSubtext(activeMode)}</h2>
          {isProfessionalGuidanceMode && guidanceConsentState === 'accepted' && messages.length > 0 ? (
            <p className="brand-subtext">
              {isGuidanceFlowClosed
                ? 'Resumo inicial pronto. O caso ainda não foi enviado para análise profissional.'
                : 'Estou te guiando com base em diretrizes profissionais para te ajudar neste momento.'}
            </p>
          ) : null}
          {showGuidancePendingBanner ? (
            <div className="guidance-inline-cta" aria-live="polite">
              <p className="guidance-inline-cta-copy">
                Existe uma orientação inicial pendente. Você pode retomar o fluxo crítico, aceitar agora ou seguir sem orientação.
              </p>
              <div className="persona-toggle-row">
                <button type="button" className="persona-toggle selected guidance-submit-button" onClick={resumePendingGuidanceMode}>
                  Retomar orientação
                </button>
                <button type="button" className="persona-toggle subtle" onClick={acceptGuidanceConsent}>
                  Aceitar orientação
                </button>
                <button type="button" className="persona-toggle subtle" onClick={declineGuidanceConsent}>
                  Continuar sem orientação
                </button>
              </div>
            </div>
          ) : null}
          {availableModes.length > 1 ? (
            <div className="customer-mode-row">
              {availableModes.filter((mode) => mode !== 'emergency').map((mode) => (
                <button key={mode} type="button" className={`customer-mode-chip ${activeMode === mode ? 'active' : ''}`} onClick={() => handleModeChange(mode)}>
                  {mode === 'sales' ? 'Vendas' : mode === 'scheduling' ? 'Agendamento' : 'Atendimento'}
                </button>
              ))}
              {emergencyEnabled ? (
                <button type="button" className={`customer-mode-chip customer-mode-chip--emergency ${activeMode === 'emergency' ? 'active' : ''}`} onClick={handleEmergencyMode}>
                  Emergência
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {isSchedulingEnabled && !isEmergencyMode ? (
          <div className="guidance-inline-cta schedule-inline-cta">
            <p className="guidance-inline-cta-copy">
              Se quiser, já posso te direcionar para marcar um horário.
            </p>
            <div className="persona-toggle-row">
              <button
                type="button"
                className="persona-toggle selected guidance-submit-button"
                onClick={() => {
                  setIsScheduleFormOpen(true)
                  setMobileSection('chat')
                  setScheduleForm((currentForm) => ({
                    ...currentForm,
                    service:
                      currentForm.service ||
                      persona?.schedulingConfig?.serviceOptions?.[0] ||
                      '',
                  }))
                }}
              >
                Agendar atendimento
              </button>
            </div>
          </div>
        ) : null}

        <section className="chat-panel customer-chat-panel">
          <ChatList messages={messages} assistantLabel={null} />
        </section>

        <form className="composer composer-docked customer-composer" onSubmit={sendMessage}>
          <div className="composer-row">
            <input
              id="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onFocus={() => setMobileSection('chat')}
              placeholder={guidanceNeedsConsent ? 'Primeiro escolha se quer ativar a orientação inicial.' : 'Me chama aqui...'}
              autoComplete="off"
              disabled={guidanceNeedsConsent}
            />
            <button type="submit" disabled={guidanceNeedsConsent || isLoading || !message.trim()}>
              {isLoading ? 'Ja te respondo...' : 'Enviar'}
            </button>
          </div>
        </form>
      </section>

      {showGuidancePanels ? (
        <div className="guidance-flow-side">
          <section className="customer-highlight-section guidance-dossier-panel" aria-label="Dossiê do caso">
            <div className="customer-section-heading">
              <span className="catalog-kicker">Dossiê do caso</span>
              <h2>{isGuidanceFlowClosed ? 'As principais informações do caso já estão organizadas, mas o envio ainda depende da sua confirmação.' : 'À medida que conversamos, vou organizar aqui os pontos principais.'}</h2>
            </div>
            {isCaseSubmitReady ? (
              <div className="guidance-inline-cta" aria-live="polite">
                <p className="guidance-inline-cta-copy">
                  <strong>Caso pronto para envio.</strong> O resumo foi organizado, mas ainda não foi enviado para análise profissional.
                </p>
                <div className="persona-toggle-row">
                  <button type="button" className="persona-toggle selected guidance-submit-button" onClick={() => setIsSubmitConfirmOpen(true)}>
                    Enviar caso
                  </button>
                  <button
                    type="button"
                    className="persona-toggle subtle"
                    onClick={() => {
                      setMobileSection('chat')
                    }}
                  >
                    Revisar antes de enviar
                  </button>
                </div>
              </div>
            ) : null}
            <div className="professional-grid professional-grid--guidance">
              <article className="professional-card">
                <span className="professional-label">Situação identificada</span>
                <strong>{caseSummary?.tipo || guidanceDossier.situacao_identificada || 'Aguardando informações'}</strong>
                <p>{guidanceDossier.contexto || 'Em coleta'}</p>
              </article>
              <article className="professional-card">
                <span className="professional-label">Impacto / prejuízo</span>
                <p>{caseSummary?.dados?.[1] || guidanceDossier.impacto || 'Em coleta'}</p>
              </article>
              <article className="professional-card">
                <span className="professional-label">Evidências registradas</span>
                <ul className="customer-summary-list">
                  {(caseSummary?.evidencias?.length ? caseSummary.evidencias : guidanceDossier.evidencias).map((item, index) => (
                    <li key={`dossier-evidence-inline-${index}`}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="professional-card">
                <span className="professional-label">Próximos passos</span>
                <ul className="customer-summary-list">
                  {(caseSummary?.passos?.length ? caseSummary.passos : guidanceDossier.proximos_passos).map((item, index) => (
                    <li key={`dossier-steps-inline-${index}`}>{item}</li>
                  ))}
                </ul>
              </article>
            </div>
            {caseSummary ? (
              <div className="persona-toggle-row">
                {isCaseSubmitReady ? (
                  <button type="button" className="persona-toggle selected guidance-submit-button" onClick={() => setIsSubmitConfirmOpen(true)}>
                    Enviar caso
                  </button>
                ) : null}
                <button type="button" className="persona-toggle subtle" disabled>
                  Baixar resumo
                </button>
                {isCaseSubmitted ? (
                  <>
                    <button type="button" className="persona-toggle subtle" onClick={handleSummaryForward}>
                      Falar no WhatsApp
                    </button>
                    <button type="button" className="persona-toggle subtle" disabled>
                      Ver status do caso
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="persona-toggle subtle"
                    onClick={() => {
                      setGuidanceConsentState('declined')
                      setIsGuidanceFlowClosed(false)
                      setMobileSection('chat')
                    }}
                  >
                    Continuar conversa
                  </button>
                )}
              </div>
            ) : null}
            {caseSubmitMessage ? <p className="guidance-submit-feedback">{caseSubmitMessage}</p> : null}
            {!isCaseSubmitReady && guidanceCtaState.showWhatsAppCta && hasConfiguredWhatsApp ? (
              <div className="guidance-inline-cta" aria-live="polite">
                <p className="guidance-inline-cta-copy">
                  {ctaSecondaryText}
                </p>
                <div className="persona-toggle-row">
                  <button type="button" className="persona-toggle selected guidance-submit-button" onClick={handleSuggestedWhatsAppForward}>
                    {ctaPrimaryText}
                  </button>
                  <button type="button" className="persona-toggle subtle" onClick={() => imageEvidenceInputRef.current?.click()}>
                    Adicionar mais evidências
                  </button>
                  <button
                    type="button"
                    className="persona-toggle subtle"
                    onClick={() =>
                      setGuidanceCtaState((currentState) => ({
                        ...currentState,
                        showWhatsAppCta: false,
                      }))
                    }
                  >
                    Continuar conversa
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className={`customer-highlight-section guidance-evidence-panel ${highlightEvidencePanel ? 'highlighted' : ''}`} aria-label="Evidências do caso">
            <div className="customer-section-heading">
              <span className="catalog-kicker">Evidências do caso</span>
              <h2>Anexe provas para fortalecer o dossiê e deixar a análise mais objetiva.</h2>
            </div>
            <article className="professional-card">
              <p className="guidance-evidence-copy">Anexe fotos, vídeos ou áudios para fortalecer o dossiê e facilitar a análise do caso.</p>
              <div className="persona-toggle-row">
                <button type="button" className="persona-toggle subtle" onClick={() => imageEvidenceInputRef.current?.click()}>
                  Adicionar fotos
                </button>
                <button type="button" className="persona-toggle subtle" onClick={() => videoEvidenceInputRef.current?.click()}>
                  Adicionar vídeo
                </button>
                <button type="button" className="persona-toggle subtle" onClick={() => audioEvidenceInputRef.current?.click()}>
                  Adicionar áudio
                </button>
              </div>
              <div className="persona-toggle-row">
                <button type="button" className="persona-toggle subtle" onClick={handleNoEvidenceConfirmation}>
                  Não tenho evidências agora
                </button>
              </div>
              <input
                ref={imageEvidenceInputRef}
                type="file"
                accept="image/*"
                multiple
                className="guidance-evidence-input"
                onChange={(event) => handleEvidenceSelection('image', event.target.files)}
              />
              <input
                ref={videoEvidenceInputRef}
                type="file"
                accept="video/*"
                className="guidance-evidence-input"
                onChange={(event) => handleEvidenceSelection('video', event.target.files)}
              />
              <input
                ref={audioEvidenceInputRef}
                type="file"
                accept="audio/*"
                className="guidance-evidence-input"
                onChange={(event) => handleEvidenceSelection('audio', event.target.files)}
              />
              {guidanceEvidenceItems.length > 0 ? (
                <ul className="customer-summary-list">
                  {guidanceEvidenceItems.map((item, index) => (
                    <li key={`${item.type}-${item.name}-inline-${index}`}>
                      {item.type === 'image' ? 'Foto' : item.type === 'video' ? 'Vídeo' : 'Áudio'}: {item.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma evidência adicionada até aqui.</p>
              )}
            </article>
          </section>

          <section className="customer-highlight-section guidance-status-panel" aria-label="Status do dossiê">
            <div className="customer-section-heading">
              <span className="catalog-kicker">Status do dossiê</span>
              <h2>À medida que a conversa avança, eu atualizo aqui o que já está pronto no caso.</h2>
            </div>
            <article className="professional-card">
              <p>
                {isCaseSubmitted
                  ? 'O caso já foi enviado para análise profissional.'
                  : caseProgress.readyForSubmission
                    ? 'O caso já tem base suficiente para encaminhamento, mas ainda não foi enviado.'
                  : caseProgress.isPartiallyReady
                      ? `Já organizei ${caseProgress.completedCount} de 4 etapas principais do caso.`
                      : 'Estou verificando os pontos essenciais para estruturar o caso com segurança.'}
              </p>
              <ul className="guidance-progress-list">
                <li>
                  <strong>Contexto do caso</strong>
                  <span className={`guidance-progress-badge guidance-progress-badge--${guidanceProgress.contexto}`}>{caseChecklist.context ? 'Concluído' : buildGuidanceProgressLabel(guidanceProgress.contexto)}</span>
                </li>
                <li>
                  <strong>Impacto / prejuízo</strong>
                  <span className={`guidance-progress-badge guidance-progress-badge--${guidanceProgress.impacto}`}>{caseChecklist.impact ? 'Concluído' : buildGuidanceProgressLabel(guidanceProgress.impacto)}</span>
                </li>
                <li>
                  <strong>Evidências</strong>
                  <span className={`guidance-progress-badge guidance-progress-badge--${guidanceProgress.evidencias}`}>
                    {caseChecklist.evidence ? (caseProgress.hasEvidence ? 'Concluído' : 'Sem evidência agora') : buildGuidanceProgressLabel(guidanceProgress.evidencias)}
                  </span>
                </li>
                <li>
                  <strong>Próximos passos</strong>
                  <span className={`guidance-progress-badge guidance-progress-badge--${guidanceProgress.proximos_passos}`}>{caseChecklist.nextSteps ? 'Concluído' : buildGuidanceProgressLabel(guidanceProgress.proximos_passos)}</span>
                </li>
              </ul>
            </article>
          </section>
        </div>
      ) : null}

      </div>

      <footer className="brandsoul-signature" aria-label="Assinatura do BrandSoul">
        <img src={brandsoulLogo} alt="BrandSoul" className="brandsoul-footer-mark" />
        <span>Powered by BrandSoul</span>
      </footer>

      {isSubmitConfirmOpen ? (
        <div className="product-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmar encaminhamento do caso" onClick={() => setIsSubmitConfirmOpen(false)}>
          <div className="product-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="product-modal-close" onClick={() => setIsSubmitConfirmOpen(false)}>
              Fechar
            </button>
            <div className="product-modal-copy">
              <span className="product-modal-section-label">Confirmação</span>
              <h3>Seu caso ainda não foi enviado.</h3>
              <p>Ao confirmar, vou encaminhar para análise profissional com:</p>
              <ul className="customer-summary-list">
                <li>resumo organizado</li>
                <li>evidências anexadas</li>
                <li>informações do ocorrido</li>
              </ul>
              <p>Deseja enviar o caso agora?</p>
            </div>
            <div className="persona-toggle-row">
              <button type="button" className="persona-toggle selected guidance-submit-button" onClick={handleCaseSubmit} disabled={isCaseSubmitting}>
                {isCaseSubmitting ? 'Enviando caso...' : 'Confirmar envio do caso'}
              </button>
              <button type="button" className="persona-toggle subtle" onClick={() => setIsSubmitConfirmOpen(false)} disabled={isCaseSubmitting}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ProductModal item={selectedItem} onClose={() => setSelectedItem(null)} onPrimaryAction={handleCatalogAction} onWhatsAppAction={whatsappNumber ? handleWhatsAppOpen : undefined} />
    </main>
  )
}
