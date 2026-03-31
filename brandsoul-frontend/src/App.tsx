import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import axios from 'axios'

import ChatList from './lib/components/ChatList'
import BrandSpark from './lib/components/BrandSpark'
import ContentHistoryPanel from './lib/components/ContentHistoryPanel'
import HintBox from './lib/components/HintBox'
import SparkSuggestions, { type Suggestion } from './lib/components/SparkSuggestions'
import type { Message } from './lib/components/ChatMessage'
import { buildApiHeaders, buildApiUrl } from './lib/api'
import { getBusinessStatus } from './lib/businessStatus'
import { buildContentActions, type ContentAction } from './lib/contentActions'
import { fetchSpark, saveSpark } from './lib/sparkApi'
import { createCatalogItem, deleteCatalogItem, fetchCatalogItems, updateCatalogItem } from './lib/catalogApi'
import { readFileAsDataUrl, readFilesAsDataUrls } from './lib/media'
import { sanitizeWhatsAppInput } from './lib/whatsapp'
import {
  buildContentHistoryItem,
  clearContentHistory,
  getContentHistoryStorageKey,
  loadContentHistory,
  parseStructuredContent,
  prependContentHistoryItem,
  type ContentHistoryItem,
} from './lib/contentHistory'
import { inferInteractionProfilePreview, type BusinessProfile } from './lib/interactionProfilePreview'
import {
  actModeOptions,
  businessModelOptions,
  type CtaConfig,
  type BrandPersona,
  type BrandTypeOption,
  type BrandFeatures,
  type BusinessModelOption,
  professionalGuidancePlaybooks,
  type ProfessionalGuidancePlaybookKey,
  professionalOperationModeOptions,
  businessGoalOptions,
  emergencyTypeOptions,
  loadBrandPersona,
  navigateTo,
  powerOptions,
  saveBrandPersona,
  type ActModeOption,
  type BusinessGoalOption,
  type EmergencyModeConfig,
  type EmergencyTypeOption,
  type PowerOption,
  type ProfessionalPageData,
  type ProfessionalOperationMode,
  type SchedulingConfig,
  type ServiceOffer,
  type SparkModes,
  type ToneOption,
  toneOptions,
  type VoiceStyleOption,
  voiceStyleOptions,
} from './lib/persona'
import { buildCatalogSummary, loadCatalogItems, normalizeCatalogItem, saveCatalogItems } from './lib/catalog'
import {
  buildSparkMemorySummary,
  getSparkMemoryStorageKey,
  hasMeaningfulSparkMemory,
  incrementConversationCount,
  loadSparkMemory,
  recordDetectedIntent,
  recordInteractionWindow,
  recordSuggestionExposure,
  recordSuggestionSelection,
  saveSparkMemory,
  type SparkMemory,
} from './lib/sparkMemory'
import { loadSession, logout, type AuthTenant, type AuthUser } from './lib/session'
import { buildPublicBrandUrl, loadCurrentTenant, refreshCurrentTenant } from './lib/tenant'
import type { CatalogAvailability, CatalogItem, CatalogPriority } from './types/catalog'
import './App.css'

type SparkState = 'idle' | 'thinking' | 'speaking'
type ChannelSparkState = SparkState
type ChannelMode = 'web' | 'instagram_dm' | 'instagram_comment'
type ContextMode = 'customer' | 'admin'

interface SuggestionPersonaContext {
  brandName: string
  deliveryAvailable?: boolean
  businessHours?: string
  whatsapp?: string
  email?: string
  tone: ToneOption
  power: PowerOption
  voiceStyle: VoiceStyleOption
  actMode: ActModeOption
  businessGoal: BusinessGoalOption
}

interface CatalogDraft {
  name: string
  description: string
  image: string
  images: string[]
  stock: string
  availability: CatalogAvailability
  price: string
  highlight: string
  category: string
  priority: CatalogPriority
  isFeatured: boolean
  isPromotion: boolean
  isNewArrival: boolean
  complements: string
}

function createEmptyCatalogDraft(): CatalogDraft {
  return {
    name: '',
    description: '',
    image: '',
    images: [],
    stock: '',
    availability: 'available',
    price: '',
    highlight: '',
    category: '',
    priority: 'medium',
    isFeatured: false,
    isPromotion: false,
    isNewArrival: false,
    complements: '',
  }
}

function createDefaultModes(): SparkModes {
  return {
    sales: true,
    service: true,
    scheduling: false,
    emergency: false,
  }
}

function createDefaultEmergencyMode(businessModel: BusinessModelOption): EmergencyModeConfig {
  return {
    enabled: businessModel === 'professional',
    autoStart: false,
    showUploadEarly: true,
  }
}

function createDefaultCtaConfig(): CtaConfig {
  return {
    whatsappEnabled: false,
    whatsappNumber: '',
    whatsappMessageTemplate: 'Olá, organizei meu caso pelo BrandSoul e gostaria de encaminhar para análise.\n\nTipo de situação: {tipo}\nResumo: {resumo}\nImpacto: {impacto}\nEvidências: {evidencias}\n\nPodemos seguir com a análise?',
    showAfterEvidence: true,
    showOnCompletion: true,
    primaryText: 'Encaminhar para profissional',
    secondaryText: 'Leve este caso organizado para análise profissional.',
  }
}

function createDefaultFeatures(businessModel: BusinessModelOption): BrandFeatures {
  if (businessModel === 'service') {
    return {
      products: false,
      services: true,
      scheduling: true,
      emergency: false,
    }
  }

  if (businessModel === 'professional') {
    return {
      products: false,
      services: true,
      scheduling: false,
      emergency: true,
    }
  }

  return {
    products: true,
    services: false,
    scheduling: false,
    emergency: false,
  }
}

function createEmptyServiceOffers(): ServiceOffer[] {
  return [
    { title: '', summary: '', label: '' },
    { title: '', summary: '', label: '' },
  ]
}

function createEmptySchedulingConfig(): SchedulingConfig {
  return {
    title: '',
    description: '',
  }
}

function createEmptyProfessionalData(): ProfessionalPageData {
  return {
    operationMode: 'institutional',
    presentation: '',
    practiceAreas: [],
    differentials: [],
    cases: [
      { caseType: '', context: '', approach: '', learning: '' },
      { caseType: '', context: '', approach: '', learning: '' },
    ],
    contents: [
      { title: '', summary: '', stance: '' },
      { title: '', summary: '', stance: '' },
    ],
    identity: {
      headline: '',
      principles: [],
    },
    guidance: {
      situationType: '',
      initialResponse: '',
      initialQuestions: [],
      actionChecklist: [],
      dataCollection: [],
      orientationLimits: '',
      communicationTone: '',
      closingMessage: '',
      playbooks: professionalGuidancePlaybooks,
    },
  }
}

type AdminConfigSectionKey =
  | 'base'
  | 'operationType'
  | 'professionalProfile'
  | 'professionalMode'
  | 'professionalGuidance'
  | 'sparkPersonality'
  | 'publicBrand'
  | 'visualStyle'
  | 'serviceSchedule'
  | 'catalog'
  | 'services'
  | 'emergency'
  | 'cta'

type AdminConfigSectionsState = Record<AdminConfigSectionKey, boolean>

function createCollapsedAdminSections(): AdminConfigSectionsState {
  return {
    base: false,
    operationType: false,
    professionalProfile: false,
    professionalMode: false,
    professionalGuidance: false,
    sparkPersonality: false,
    publicBrand: false,
    visualStyle: false,
    serviceSchedule: false,
    catalog: false,
    services: false,
    emergency: false,
    cta: false,
  }
}

function createAdminSectionsWithSingleOpen(section: AdminConfigSectionKey): AdminConfigSectionsState {
  return {
    ...createCollapsedAdminSections(),
    [section]: true,
  }
}

function parseCommaSeparatedList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatCommaSeparatedList(values?: string[]) {
  return values?.join(', ') ?? ''
}

function hasText(value?: string | null) {
  return Boolean(value?.trim())
}

function hasItems<T>(value?: T[] | null) {
  return Boolean(value && value.length > 0)
}

function getSectionProgressStatus(completed: number, total: number) {
  if (completed <= 0) {
    return 'Pendente'
  }

  if (completed >= total) {
    return 'Completo'
  }

  return 'Parcial'
}

interface ChannelResponseMetadata {
  source?: string
  intent?: string
  username?: string
  post_id?: string
  comment_id?: string
  detected_intent?: string
  commercial_intent?: string | boolean
  business_profile?: BusinessProfile
}

interface ChannelMessageResponse {
  channel: string
  user_id: string
  response: string
  spark_state: ChannelSparkState
  memory_used: boolean
  metadata?: ChannelResponseMetadata
}

const USER_ID_STORAGE_KEY = 'brandsoul_user_id'
const CHANNEL_MODE_STORAGE_KEY = 'brandsoul_channel_mode'
const CONTEXT_MODE_STORAGE_KEY = 'brandsoul_context_mode'
const INSTAGRAM_USERNAME_STORAGE_KEY = 'brandsoul_instagram_username'
const BOOTSTRAP_ERROR_MESSAGE = 'Tive um ruído aqui agora. Me chama de novo que eu volto.'
const BOOTSTRAP_LOCK_KEY = 'brandsoul_bootstrap_lock'
const BOOTSTRAP_LOCK_MAX_AGE = 8000
const INSTAGRAM_COMMENT_POST_ID = 'mock-post-001'
const INSTAGRAM_COMMENT_ID = 'mock-comment-001'

const channelModeOptions: Array<{ value: ChannelMode; label: string; detail: string }> = [
  { value: 'web', label: 'Web', detail: 'Site e chat direto' },
  { value: 'instagram_dm', label: 'Instagram DM', detail: 'Conversa privada' },
  { value: 'instagram_comment', label: 'Instagram Comentário', detail: 'Espaço público' },
]

function getMessageStorageKey(contextMode: ContextMode, channelMode: ChannelMode) {
  if (contextMode === 'admin') {
    return 'brandsoul_messages:admin'
  }

  return `brandsoul_messages:customer:${channelMode}`
}

function loadMessages(contextMode: ContextMode, channelMode: ChannelMode): Message[] {
  const savedMessages = window.localStorage.getItem(getMessageStorageKey(contextMode, channelMode))
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

function loadChannelMode(): ChannelMode {
  const savedChannelMode = window.localStorage.getItem(CHANNEL_MODE_STORAGE_KEY)
  if (savedChannelMode === 'web' || savedChannelMode === 'instagram_dm' || savedChannelMode === 'instagram_comment') {
    return savedChannelMode
  }

  return 'web'
}

function loadContextMode(): ContextMode {
  const savedContextMode = window.localStorage.getItem(CONTEXT_MODE_STORAGE_KEY)
  return savedContextMode === 'customer' ? 'customer' : 'admin'
}

function loadInstagramUsername() {
  return window.localStorage.getItem(INSTAGRAM_USERNAME_STORAGE_KEY) ?? ''
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

function normalizeInstagramUsername(username: string) {
  return username.trim().replace(/^@+/, '')
}

function isInstagramMode(contextMode: ContextMode, channelMode: ChannelMode) {
  return contextMode === 'customer' && (channelMode === 'instagram_dm' || channelMode === 'instagram_comment')
}

function buildChannelRequestConfig(
  contextMode: ContextMode,
  channelMode: ChannelMode,
  instagramUsername: string,
  intent?: 'conversation_start',
) {
  const normalizedUsername = normalizeInstagramUsername(instagramUsername)

  if (contextMode === 'admin') {
    return {
      channel: 'web',
      metadata: {
        source: 'chat-ui-admin',
        ...(intent ? { intent } : {}),
      },
    }
  }

  if (channelMode === 'instagram_dm') {
    return {
      channel: 'instagram',
      metadata: {
        source: 'dm',
        ...(normalizedUsername ? { username: normalizedUsername } : {}),
        ...(intent ? { intent } : {}),
      },
    }
  }

  if (channelMode === 'instagram_comment') {
    return {
      channel: 'instagram',
      metadata: {
        source: 'comment',
        ...(normalizedUsername ? { username: normalizedUsername } : {}),
        post_id: INSTAGRAM_COMMENT_POST_ID,
        comment_id: INSTAGRAM_COMMENT_ID,
        ...(intent ? { intent } : {}),
      },
    }
  }

  return {
    channel: 'web',
    metadata: {
      source: 'chat-ui',
      ...(intent ? { intent } : {}),
    },
  }
}

function getChannelContext(contextMode: ContextMode, channelMode: ChannelMode, instagramUsername: string) {
  if (contextMode === 'admin') {
    return {
      channelLabel: 'Interno',
      sourceLabel: 'Admin',
      usernameLabel: null,
    }
  }

  const normalizedUsername = normalizeInstagramUsername(instagramUsername)

  if (channelMode === 'instagram_dm') {
    return {
      channelLabel: 'Instagram',
      sourceLabel: 'DM',
      usernameLabel: normalizedUsername ? `@${normalizedUsername}` : null,
    }
  }

  if (channelMode === 'instagram_comment') {
    return {
      channelLabel: 'Instagram',
      sourceLabel: 'Comentário',
      usernameLabel: normalizedUsername ? `@${normalizedUsername}` : null,
    }
  }

  return {
    channelLabel: 'Web',
    sourceLabel: 'Chat',
    usernameLabel: null,
  }
}

function getComposerPlaceholder(contextMode: ContextMode, channelMode: ChannelMode) {
  if (contextMode === 'admin') {
    return 'Me diga o que você quer destravar na operação, no marketing ou na comunicação...'
  }

  if (channelMode === 'instagram_dm') {
    return 'Me chama na DM para eu te responder daqui...'
  }

  if (channelMode === 'instagram_comment') {
    return 'Escreva um comentário e eu respondo em público...'
  }

  return 'Escreva comigo por aqui...'
}

function buildIntroTagline(tone: ToneOption, power: PowerOption, contextMode: ContextMode) {
  if (contextMode === 'admin') {
    return 'Consciencia interna da marca.'
  }

  if (power === 'velocidade') {
    return 'Presenca viva. Resposta pronta.'
  }

  if (power === 'clareza') {
    return 'Agora a marca fala por si.'
  }

  if (power === 'conexão') {
    return 'Presenca digital viva.'
  }

  if (tone === 'ousado') {
    return 'Você não está falando com um perfil.'
  }

  return 'Voz ativa da marca.'
}

function resolveDetectedIntent(metadata?: ChannelResponseMetadata) {
  return metadata?.detected_intent ?? 'unknown'
}

function resolveCommercialIntent(metadata?: ChannelResponseMetadata) {
  return metadata?.commercial_intent === true || metadata?.commercial_intent === 'true'
}

function resolveBusinessProfile(metadata?: ChannelResponseMetadata) {
  return metadata?.business_profile
}

function formatBusinessProfile(businessProfile?: BusinessProfile) {
  if (!businessProfile) {
    return '—'
  }

  return [
    businessProfile.business_type,
    businessProfile.sector,
    businessProfile.model,
    businessProfile.complexity,
  ].join(' / ')
}

function generateSuggestions(
  persona: SuggestionPersonaContext,
  businessProfile: BusinessProfile | undefined,
  sparkMemory: SparkMemory,
  currentHour: number,
  catalogItems: CatalogItem[],
  contentHistory: ContentHistoryItem[],
  businessStatus?: 'open' | 'closed',
): Suggestion[] {
  const suggestions: Suggestion[] = []
  const recentSuggestions = new Set(sparkMemory.last_suggestions)
  const recentContentTypes = new Set(contentHistory.slice(0, 4).map((item) => item.content_type))
  const featuredItem = catalogItems.find((item) => item.isFeatured)
  const highPriorityItem = catalogItems.find((item) => item.priority === 'high')
  const lowStockItem = catalogItems.find((item) => item.availability === 'low' || (typeof item.stock === 'number' && item.stock <= 3 && item.stock > 0))
  const rotationItem = catalogItems.find((item) => item.priority === 'low')
  const prefersDelivery = sparkMemory.top_intents.includes('delivery') || sparkMemory.common_topics.includes('delivery') || persona.deliveryAvailable
  const hasContactChannel = Boolean(persona.whatsapp?.trim() || persona.email?.trim())

  const pushSuggestion = (suggestion: Suggestion) => {
    if (suggestions.length >= 3 || recentSuggestions.has(suggestion.text)) {
      return
    }

    suggestions.push(suggestion)
  }

  if (businessStatus === 'closed') {
    pushSuggestion({
      type: 'operation',
      text: 'Agora estou fechado. Posso preparar uma mensagem para segurar interesse e puxar a próxima abertura.',
    })
  }

  if (currentHour < 12 && !recentContentTypes.has('instagram_post')) {
    pushSuggestion({
      type: 'marketing',
      text: 'Hoje posso comecar destacando meus produtos principais com um post curto.',
    })
  }

  if (currentHour >= 12 && currentHour < 18 && !recentContentTypes.has('promotion')) {
    pushSuggestion({
      type: 'sales',
      text: 'Talvez seja um bom momento para reforcar o movimento com uma promocao leve.',
    })
  }

  if (currentHour >= 18 && !recentContentTypes.has('story')) {
    pushSuggestion({
      type: 'marketing',
      text: 'Agora e um otimo horario para eu divulgar isso no Instagram com mais impacto.',
    })
  }

  if (persona.businessGoal === 'launch' && featuredItem) {
    pushSuggestion({
      type: 'marketing',
      text: `Agora vale puxar ${featuredItem.name} como destaque principal para ganhar mais atencao.`,
    })
  }

  if (persona.businessGoal === 'ticket' && highPriorityItem) {
    pushSuggestion({
      type: 'sales',
      text: `Posso conduzir a conversa para ${highPriorityItem.name} e abrir espaço para uma combinação de maior valor.`,
    })
  }

  if (lowStockItem) {
    pushSuggestion({
      type: 'sales',
      text: `Tenho poucas unidades de ${lowStockItem.name}. Posso usar escassez de forma elegante agora.`,
    })
  }

  if (persona.businessGoal === 'rotation' && rotationItem) {
    pushSuggestion({
      type: 'sales',
      text: `Posso dar mais giro para ${rotationItem.name} com uma entrada mais convidativa agora.`,
    })
  }

  if (prefersDelivery) {
    pushSuggestion({
      type: 'sales',
      text: 'Hoje posso reforcar meu delivery com uma chamada mais direta.',
    })
  }

  if (hasContactChannel && !recentContentTypes.has('whatsapp_message')) {
    pushSuggestion({
      type: 'sales',
      text: 'Posso criar uma mensagem curta para puxar contato e conversão sem fricção.',
    })
  }

  if (persona.businessHours?.trim()) {
    pushSuggestion({
      type: 'operation',
      text: 'Posso deixar meu horário mais claro na comunicação de hoje.',
    })
  }

  if (businessProfile?.model === 'b2b' && !recentContentTypes.has('cta')) {
    pushSuggestion({
      type: 'sales',
      text: 'Posso abrir uma conversa comercial mais forte para decisores agora.',
    })
  }

  if (sparkMemory.common_topics.includes('promocao') && !recentContentTypes.has('promotion')) {
    pushSuggestion({
      type: 'marketing',
      text: 'Posso transformar esse contexto recente em uma promocao pronta para usar.',
    })
  }

  if (suggestions.length < 2) {
    pushSuggestion({
      type: persona.tone === 'ousado' ? 'marketing' : 'operation',
      text: 'Posso puxar uma ação curta agora para dar mais ritmo ao dia.',
    })
  }

  return suggestions.slice(0, 3)
}

function buildSuggestionPrompt(suggestion: Suggestion) {
  if (suggestion.type === 'marketing') {
    return `Me ajuda a criar um post sobre isso: ${suggestion.text}`
  }

  if (suggestion.type === 'sales') {
    return `Perfeito. Me ajuda a transformar isso em uma ação comercial: ${suggestion.text}`
  }

  return `Me ajuda a comunicar isso de forma clara para os clientes: ${suggestion.text}`
}

export default function App() {
  const savedSession = useMemo(() => loadSession(), [])
  const savedPersona = useMemo(() => loadBrandPersona(), [])
  const initialContextMode = useMemo(() => loadContextMode(), [])
  const initialChannelMode = useMemo(() => loadChannelMode(), [])
  const initialSavedMessages = useMemo(() => loadMessages(initialContextMode, initialChannelMode), [initialChannelMode, initialContextMode])
  const userId = useMemo(() => getOrCreateUserId(), [])
  const [message, setMessage] = useState('')
  const [sparkState, setSparkState] = useState<SparkState>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [memoryStatus, setMemoryStatus] = useState<'Contexto ativo' | 'Nova resposta'>(() =>
    initialSavedMessages.length > 1 ? 'Contexto ativo' : 'Nova resposta',
  )
  const [brandName, setBrandName] = useState(savedPersona?.brandName ?? 'BrandSoul Demo')
  const [logo, setLogo] = useState(savedPersona?.logo ?? '')
  const [businessDescription, setBusinessDescription] = useState(savedPersona?.businessDescription ?? '')
  const [institutionalImage, setInstitutionalImage] = useState(savedPersona?.institutionalImage ?? '')
  const [businessModel, setBusinessModel] = useState<BusinessModelOption>(
    savedPersona?.businessModel ?? (savedPersona?.brandType === 'professional' ? 'professional' : 'product'),
  )
  const [brandType, setBrandType] = useState<BrandTypeOption>(savedPersona?.brandType ?? 'business')
  const [features, setFeatures] = useState<BrandFeatures>(
    savedPersona?.features ?? createDefaultFeatures(savedPersona?.businessModel ?? (savedPersona?.brandType === 'professional' ? 'professional' : 'product')),
  )
  const [serviceOffers, setServiceOffers] = useState<ServiceOffer[]>(savedPersona?.serviceOffers ?? createEmptyServiceOffers())
  const [schedulingConfig, setSchedulingConfig] = useState<SchedulingConfig>(savedPersona?.schedulingConfig ?? createEmptySchedulingConfig())
  const [professionalData, setProfessionalData] = useState<ProfessionalPageData>(savedPersona?.professionalData ?? createEmptyProfessionalData())
  const [themePrimaryColor, setThemePrimaryColor] = useState(savedPersona?.theme?.primaryColor ?? '#ff9460')
  const [themeSecondaryColor, setThemeSecondaryColor] = useState(savedPersona?.theme?.secondaryColor ?? '#ff5e43')
  const [showCarousel, setShowCarousel] = useState(savedPersona?.pageSections?.showCarousel === true)
  const [showPromotions, setShowPromotions] = useState(savedPersona?.pageSections?.showPromotions === true)
  const [showNewArrivals, setShowNewArrivals] = useState(savedPersona?.pageSections?.showNewArrivals === true)
  const [carouselImages, setCarouselImages] = useState<string[]>(savedPersona?.carouselImages ?? [])
  const [openingStart, setOpeningStart] = useState(savedPersona?.openingHours?.start ?? '')
  const [openingEnd, setOpeningEnd] = useState(savedPersona?.openingHours?.end ?? '')
  const [address, setAddress] = useState(savedPersona?.address ?? '')
  const [city, setCity] = useState(savedPersona?.city ?? '')
  const [state, setState] = useState(savedPersona?.state ?? '')
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean | undefined>(savedPersona?.deliveryAvailable)
  const [businessHours, setBusinessHours] = useState(savedPersona?.businessHours ?? '')
  const [serviceRegion, setServiceRegion] = useState(savedPersona?.serviceRegion ?? '')
  const [brandHighlight, setBrandHighlight] = useState(savedPersona?.brandHighlight ?? '')
  const [whatsapp, setWhatsapp] = useState(savedPersona?.whatsapp ?? savedPersona?.contactInfo ?? '')
  const [email, setEmail] = useState(savedPersona?.email ?? '')
  const [instagram, setInstagram] = useState(savedPersona?.instagram ?? '')
  const [facebook, setFacebook] = useState(savedPersona?.facebook ?? '')
  const [tiktok, setTiktok] = useState(savedPersona?.tiktok ?? '')
  const [site, setSite] = useState(savedPersona?.site ?? '')
  const [tone, setTone] = useState<ToneOption>(savedPersona?.tone ?? 'divertido')
  const [power, setPower] = useState<PowerOption>(savedPersona?.power ?? 'atração')
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyleOption>(savedPersona?.voiceStyle ?? 'balanced')
  const [actMode, setActMode] = useState<ActModeOption>(savedPersona?.actMode ?? 'seller')
  const [businessGoal, setBusinessGoal] = useState<BusinessGoalOption>(savedPersona?.businessGoal ?? 'volume')
  const [modes, setModes] = useState<SparkModes>(savedPersona?.modes ?? createDefaultModes())
  const [emergencyType, setEmergencyType] = useState<EmergencyTypeOption>(savedPersona?.emergencyType ?? 'technical')
  const [emergencyMode, setEmergencyMode] = useState<EmergencyModeConfig>(
    savedPersona?.emergencyMode ?? createDefaultEmergencyMode(savedPersona?.businessModel ?? (savedPersona?.brandType === 'professional' ? 'professional' : 'product')),
  )
  const [ctaConfig, setCtaConfig] = useState<CtaConfig>(savedPersona?.ctaConfig ?? createDefaultCtaConfig())
  const [contextMode, setContextMode] = useState<ContextMode>(initialContextMode)
  const [channelMode, setChannelMode] = useState<ChannelMode>(initialChannelMode)
  const [instagramUsername, setInstagramUsername] = useState(loadInstagramUsername())
  const [detectedIntent, setDetectedIntent] = useState('unknown')
  const [commercialIntent, setCommercialIntent] = useState(false)
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | undefined>(undefined)
  const [messages, setMessages] = useState<Message[]>(initialSavedMessages)
  const [dismissedSuggestionTexts, setDismissedSuggestionTexts] = useState<string[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft>(createEmptyCatalogDraft())
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null)
  const [configStatus, setConfigStatus] = useState('')
  const [linkCopyStatus, setLinkCopyStatus] = useState('')
  const [isEditingCentelha, setIsEditingCentelha] = useState(false)
  const [openAdminSections, setOpenAdminSections] = useState<AdminConfigSectionsState>(() => createCollapsedAdminSections())
  const [currentTenant, setCurrentTenant] = useState<AuthTenant | null>(() => loadCurrentTenant())
  const [currentUser] = useState<AuthUser | null>(savedSession?.user ?? null)
  const contentHistoryStorageKey = useMemo(
    () =>
      getContentHistoryStorageKey({
        brandName,
        tone,
        power,
        voiceStyle,
      }),
    [brandName, power, tone, voiceStyle],
  )
  const [contentHistory, setContentHistory] = useState<ContentHistoryItem[]>(() => loadContentHistory(contentHistoryStorageKey))
  const sparkMemoryStorageKey = useMemo(
    () =>
      getSparkMemoryStorageKey({
        brandName,
        tone,
        power,
        contextMode,
        channelMode: contextMode === 'customer' ? channelMode : undefined,
      }),
    [brandName, channelMode, contextMode, power, tone],
  )
  const [sparkMemory, setSparkMemory] = useState<SparkMemory>(() => loadSparkMemory(sparkMemoryStorageKey))
  const timeoutRef = useRef<number | null>(null)
  const introPulseTimeoutRef = useRef<number | null>(null)
  const lastShownSuggestionsKeyRef = useRef('')
  const hasBootstrappedRef = useRef(initialSavedMessages.length > 0)
  const bootstrapRequestIdRef = useRef(0)
  const [isIntroPulseActive, setIsIntroPulseActive] = useState(false)
  const activeMessageStorageKey = useMemo(() => getMessageStorageKey(contextMode, channelMode), [channelMode, contextMode])
  const publicPageUrl = useMemo(() => buildPublicBrandUrl(currentTenant?.slug), [currentTenant?.slug])
  const publicSlugLabel = useMemo(() => (currentTenant?.slug ? `/brands/${currentTenant.slug}` : 'Slug pendente'), [currentTenant?.slug])
  const channelContext = useMemo(
    () => getChannelContext(contextMode, channelMode, instagramUsername),
    [channelMode, contextMode, instagramUsername],
  )
  const localBusinessProfilePreview = useMemo(
    () => inferInteractionProfilePreview(businessDescription),
    [businessDescription],
  )
  const effectiveBusinessProfile = businessProfile ?? localBusinessProfilePreview
  const shouldShowBusinessProfile = Boolean(businessProfile || businessDescription.trim())
  const currentHour = useMemo(() => new Date().getHours(), [])
  const openingHours = useMemo(
    () => (openingStart && openingEnd ? { start: openingStart, end: openingEnd } : undefined),
    [openingEnd, openingStart],
  )
  const businessStatus = useMemo(() => getBusinessStatus(openingHours), [openingHours])
  const voiceStyleLabel = useMemo(
    () => voiceStyleOptions.find((option) => option.value === voiceStyle)?.label ?? 'Equilibrado',
    [voiceStyle],
  )
  const actModeLabel = useMemo(
    () =>
      ({
        seller: 'Vendedor',
        consultant: 'Consultor',
        stylist: 'Estilista',
        coach: 'Coach',
        chef: 'Chef',
      })[actMode] ?? 'Vendedor',
    [actMode],
  )
  const businessGoalLabel = useMemo(
    () =>
      ({
        volume: 'Mais vendas',
        ticket: 'Ticket médio',
        rotation: 'Giro',
        launch: 'Novidades',
      })[businessGoal] ?? 'Mais vendas',
    [businessGoal],
  )
  const identityTagline = useMemo(() => {
    if (sparkState === 'speaking') {
      return 'Presença viva da marca em ação.'
    }

    if (sparkState === 'thinking') {
      return 'Consciência ativa da marca, lendo o próximo movimento.'
    }

    return 'A Centelha da marca, pronta para conversar, orientar e vender.'
  }, [sparkState])
  const identityChips = useMemo(
    () => [
      { label: 'Tom', text: `${tone === 'ousado' ? '⚡' : tone === 'divertido' ? '🎭' : tone === 'inteligente' ? '🧠' : '💼'} ${tone}` },
      { label: 'Estilo', text: `${voiceStyle === 'irreverent' ? '🎤' : voiceStyle === 'adaptive' ? '🎭' : voiceStyle === 'strong' ? '⚡' : voiceStyle === 'soft' ? '🤍' : '✨'} ${voiceStyleLabel}` },
      { label: 'Atuação', text: `${actMode === 'chef' ? '🍳' : actMode === 'stylist' ? '👕' : actMode === 'coach' ? '🧠' : actMode === 'consultant' ? '💬' : '💰'} Atua como ${actModeLabel}` },
      { label: 'Objetivo', text: `${businessGoal === 'launch' ? '🚀' : businessGoal === 'rotation' ? '🔄' : businessGoal === 'ticket' ? '💳' : '🎯'} Foco em ${businessGoalLabel.toLowerCase()}` },
    ],
    [actMode, actModeLabel, businessGoal, businessGoalLabel, tone, voiceStyle, voiceStyleLabel],
  )
  const suggestions = useMemo(
    () =>
      generateSuggestions(
        {
          brandName,
          deliveryAvailable,
          businessHours,
          whatsapp,
          email,
          tone,
          power,
          voiceStyle,
          actMode,
          businessGoal,
        },
        effectiveBusinessProfile,
        sparkMemory,
        currentHour,
        catalogItems,
        contentHistory,
        businessStatus,
      )
        .filter((suggestion) => !dismissedSuggestionTexts.includes(suggestion.text))
        .slice(0, 3),
    [actMode, brandName, businessGoal, businessHours, businessStatus, catalogItems, contentHistory, currentHour, deliveryAvailable, dismissedSuggestionTexts, effectiveBusinessProfile, email, power, sparkMemory, tone, voiceStyle, whatsapp],
  )
  const isIntroMoment = messages.length === 1 && messages[0]?.role === 'ai'
  const introTagline = useMemo(() => buildIntroTagline(tone, power, contextMode), [contextMode, power, tone])
  const shouldShowSuggestions = contextMode === 'admin' && !isLoading && sparkState === 'idle' && message.trim().length === 0 && suggestions.length > 0
  const contentActions = useMemo(
    () =>
      contextMode === 'admin'
        ? buildContentActions(
            {
              brandName,
              deliveryAvailable,
              businessHours,
              serviceRegion,
              brandHighlight,
              tone,
              power,
              voiceStyle,
              actMode,
              businessGoal,
            },
            sparkMemory,
            currentHour,
            catalogItems,
          )
        : [],
    [actMode, brandHighlight, brandName, businessGoal, businessHours, catalogItems, contextMode, currentHour, deliveryAvailable, power, serviceRegion, sparkMemory, tone, voiceStyle],
  )
  const shouldShowContentActions = contextMode === 'admin' && !isLoading && message.trim().length === 0 && contentActions.length > 0
  const memorySummary = useMemo(() => buildSparkMemorySummary(sparkMemory), [sparkMemory])
  const catalogSummary = useMemo(() => buildCatalogSummary(catalogItems), [catalogItems])
  const locationSummary = useMemo(() => {
    const trimmedAddress = address.trim()
    const trimmedCity = city.trim()
    const trimmedState = state.trim()

    if (!trimmedAddress && !trimmedCity && !trimmedState) {
      return undefined
    }

    return {
      address: trimmedAddress || undefined,
      city: trimmedCity || undefined,
      state: trimmedState || undefined,
    }
  }, [address, city, state])
  const pageHighlights = useMemo(() => {
    const hasPromotions = showPromotions && catalogItems.some((item) => item.isPromotion)
    const hasNewArrivals = showNewArrivals && catalogItems.some((item) => item.isNewArrival)

    if (!hasPromotions && !hasNewArrivals) {
      return undefined
    }

    return {
      has_promotions: hasPromotions,
      has_new_arrivals: hasNewArrivals,
    }
  }, [catalogItems, showNewArrivals, showPromotions])
  const shouldShowLearningSignal = useMemo(() => hasMeaningfulSparkMemory(sparkMemory), [sparkMemory])
  const applyPersonaState = useCallback((persona: BrandPersona) => {
    setBrandName(persona.brandName)
    setLogo(persona.logo ?? '')
    setBusinessDescription(persona.businessDescription ?? '')
    setInstitutionalImage(persona.institutionalImage ?? '')
    const nextBusinessModel = persona.businessModel ?? (persona.brandType === 'professional' ? 'professional' : 'product')
    setBusinessModel(nextBusinessModel)
    setBrandType(persona.brandType ?? 'business')
    setFeatures(persona.features ?? createDefaultFeatures(nextBusinessModel))
    setServiceOffers(persona.serviceOffers ?? createEmptyServiceOffers())
    setSchedulingConfig(persona.schedulingConfig ?? createEmptySchedulingConfig())
    setProfessionalData(persona.professionalData ?? createEmptyProfessionalData())
    setThemePrimaryColor(persona.theme?.primaryColor ?? '#ff9460')
    setThemeSecondaryColor(persona.theme?.secondaryColor ?? '#ff5e43')
    setShowCarousel(persona.pageSections?.showCarousel === true)
    setShowPromotions(persona.pageSections?.showPromotions === true)
    setShowNewArrivals(persona.pageSections?.showNewArrivals === true)
    setCarouselImages(persona.carouselImages ?? [])
    setOpeningStart(persona.openingHours?.start ?? '')
    setOpeningEnd(persona.openingHours?.end ?? '')
    setAddress(persona.address ?? '')
    setCity(persona.city ?? '')
    setState(persona.state ?? '')
    setDeliveryAvailable(persona.deliveryAvailable)
    setBusinessHours(persona.businessHours ?? '')
    setServiceRegion(persona.serviceRegion ?? '')
    setBrandHighlight(persona.brandHighlight ?? '')
    setWhatsapp(persona.whatsapp ?? persona.contactInfo ?? '')
    setEmail(persona.email ?? '')
    setInstagram(persona.instagram ?? '')
    setFacebook(persona.facebook ?? '')
    setTiktok(persona.tiktok ?? '')
    setSite(persona.site ?? '')
    setTone(persona.tone)
    setPower(persona.power)
    setVoiceStyle(persona.voiceStyle ?? 'balanced')
    setActMode(persona.actMode ?? 'seller')
    setBusinessGoal(persona.businessGoal ?? 'volume')
    setModes(persona.modes ?? createDefaultModes())
    setEmergencyType(persona.emergencyType ?? 'technical')
    setEmergencyMode(persona.emergencyMode ?? createDefaultEmergencyMode(nextBusinessModel))
    setCtaConfig(persona.ctaConfig ?? createDefaultCtaConfig())
  }, [])

  const currentPersona = useMemo<BrandPersona>(
    () => ({
      brandName: brandName.trim() || 'BrandSoul Demo',
      logo: logo || undefined,
      tone,
      power,
      businessModel,
      brandType,
      features,
      voiceStyle,
      actMode,
      businessGoal,
      modes,
      emergencyType,
      emergencyMode,
      ctaConfig,
      serviceOffers: features.services ? serviceOffers : undefined,
      schedulingConfig: features.scheduling ? schedulingConfig : undefined,
      professionalData: brandType === 'professional' ? professionalData : undefined,
      businessDescription: businessDescription.trim() || undefined,
      institutionalImage: institutionalImage || undefined,
      theme: {
        primaryColor: themePrimaryColor,
        secondaryColor: themeSecondaryColor,
      },
      pageSections: {
        showCarousel,
        showPromotions,
        showNewArrivals,
      },
      carouselImages: carouselImages.length > 0 ? carouselImages : undefined,
      openingHours,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      deliveryAvailable,
      businessHours: businessHours.trim() || undefined,
      serviceRegion: serviceRegion.trim() || undefined,
      brandHighlight: brandHighlight.trim() || undefined,
      whatsapp: whatsapp.trim() || undefined,
      email: email.trim() || undefined,
      instagram: instagram.trim() || undefined,
      facebook: facebook.trim() || undefined,
      tiktok: tiktok.trim() || undefined,
      site: site.trim() || undefined,
      contactInfo: whatsapp.trim() || undefined,
    }),
    [
      actMode,
      address,
      businessModel,
      brandType,
      brandHighlight,
      brandName,
      businessDescription,
      businessGoal,
      businessHours,
      carouselImages,
      city,
      deliveryAvailable,
      email,
      facebook,
      institutionalImage,
      instagram,
      logo,
      modes,
      emergencyMode,
      ctaConfig,
      openingHours,
      power,
      professionalData,
      schedulingConfig,
      serviceRegion,
      serviceOffers,
      showCarousel,
      showNewArrivals,
      showPromotions,
      site,
      state,
      themePrimaryColor,
      themeSecondaryColor,
      tiktok,
      tone,
      voiceStyle,
      whatsapp,
      features,
      emergencyType,
      emergencyMode,
      ctaConfig,
    ],
  )

  const buildPersonaPayload = () => ({
    tone: currentPersona.tone,
    power: currentPersona.power,
    business_model: currentPersona.businessModel,
    brand_type: currentPersona.brandType,
    features: currentPersona.features,
    voice_style: currentPersona.voiceStyle,
    act_mode: currentPersona.actMode,
    business_goal: currentPersona.businessGoal,
    modes: currentPersona.modes,
    emergency_type: currentPersona.emergencyType,
    emergency_mode: currentPersona.emergencyMode
      ? {
          enabled: currentPersona.emergencyMode.enabled,
          auto_start: currentPersona.emergencyMode.autoStart,
          show_upload_early: currentPersona.emergencyMode.showUploadEarly,
        }
      : undefined,
    cta_config: currentPersona.ctaConfig
      ? {
          whatsapp_enabled: currentPersona.ctaConfig.whatsappEnabled,
          whatsapp_number: currentPersona.ctaConfig.whatsappNumber,
          whatsapp_message_template: currentPersona.ctaConfig.whatsappMessageTemplate,
          show_after_evidence: currentPersona.ctaConfig.showAfterEvidence,
          show_on_completion: currentPersona.ctaConfig.showOnCompletion,
          primary_text: currentPersona.ctaConfig.primaryText,
          secondary_text: currentPersona.ctaConfig.secondaryText,
        }
      : undefined,
    service_offers: currentPersona.serviceOffers,
    scheduling_config: currentPersona.schedulingConfig,
    professional_data:
      currentPersona.brandType === 'professional'
        ? {
            operation_mode: currentPersona.professionalData?.operationMode,
            presentation: currentPersona.professionalData?.presentation,
            practice_areas: currentPersona.professionalData?.practiceAreas,
            differentials: currentPersona.professionalData?.differentials,
            cases: currentPersona.professionalData?.cases?.map((item) => ({
              case_type: item.caseType,
              context: item.context,
              approach: item.approach,
              learning: item.learning,
            })),
            contents: currentPersona.professionalData?.contents,
            identity: currentPersona.professionalData?.identity,
            guidance: currentPersona.professionalData?.guidance
              ? {
                  situation_type: currentPersona.professionalData.guidance.situationType,
                  initial_response: currentPersona.professionalData.guidance.initialResponse,
                  initial_questions: currentPersona.professionalData.guidance.initialQuestions,
                  action_checklist: currentPersona.professionalData.guidance.actionChecklist,
                  data_collection: currentPersona.professionalData.guidance.dataCollection,
                  orientation_limits: currentPersona.professionalData.guidance.orientationLimits,
                  communication_tone: currentPersona.professionalData.guidance.communicationTone,
                  closing_message: currentPersona.professionalData.guidance.closingMessage,
                  playbooks: currentPersona.professionalData.guidance.playbooks,
                }
              : undefined,
          }
        : undefined,
    business_description: currentPersona.businessDescription,
    opening_hours: currentPersona.openingHours,
    address: currentPersona.address,
    city: currentPersona.city,
    state: currentPersona.state,
    delivery_available: currentPersona.deliveryAvailable,
    business_hours: currentPersona.businessHours,
    service_region: currentPersona.serviceRegion,
    brand_highlight: currentPersona.brandHighlight,
    whatsapp: currentPersona.whatsapp,
    email: currentPersona.email,
    instagram: currentPersona.instagram,
    facebook: currentPersona.facebook,
    tiktok: currentPersona.tiktok,
    site: currentPersona.site,
    contact_info: currentPersona.contactInfo || currentPersona.email || currentPersona.instagram || currentPersona.site || undefined,
  })

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

  const persistSparkMemory = (updater: (currentMemory: SparkMemory) => SparkMemory) => {
    setSparkMemory((currentMemory) => {
      const nextMemory = updater(currentMemory)
      saveSparkMemory(sparkMemoryStorageKey, nextMemory)
      return nextMemory
    })
  }

  const startConversation = async (
    force = false,
    nextContextMode: ContextMode = contextMode,
    nextChannelMode: ChannelMode = channelMode,
    nextInstagramUsername: string = instagramUsername,
  ) => {
    if (!force && !acquireBootstrapLock()) {
      return
    }

    if (force) {
      window.sessionStorage.setItem(BOOTSTRAP_LOCK_KEY, String(Date.now()))
    }

    const requestId = bootstrapRequestIdRef.current + 1
    bootstrapRequestIdRef.current = requestId

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
    }

    setIsLoading(true)
    setSparkState('idle')
    setMemoryStatus('Nova resposta')

    const nextSparkMemoryStorageKey = getSparkMemoryStorageKey({
      brandName,
      tone,
      power,
      contextMode: nextContextMode,
      channelMode: nextContextMode === 'customer' ? nextChannelMode : undefined,
    })
    const nextSparkMemory = recordInteractionWindow(incrementConversationCount(loadSparkMemory(nextSparkMemoryStorageKey)))
    saveSparkMemory(nextSparkMemoryStorageKey, nextSparkMemory)

    if (nextSparkMemoryStorageKey === sparkMemoryStorageKey) {
      setSparkMemory(nextSparkMemory)
    }

    try {
      const requestConfig = buildChannelRequestConfig(nextContextMode, nextChannelMode, nextInstagramUsername, 'conversation_start')
      const result = await axios.post<ChannelMessageResponse>(
        buildApiUrl('/channel/message'),
        {
        channel: requestConfig.channel,
        user_id: userId,
        brand_name: brandName,
        message: '',
        persona: buildPersonaPayload(),
        messages: [],
        context_mode: nextContextMode,
        business_goal: businessGoal,
        metadata: requestConfig.metadata,
        ...(businessStatus ? { business_status: businessStatus } : {}),
        ...(buildSparkMemorySummary(nextSparkMemory) ? { memory_summary: buildSparkMemorySummary(nextSparkMemory) } : {}),
        ...(catalogSummary.length > 0 ? { catalog_summary: catalogSummary } : {}),
        ...(locationSummary ? { location_summary: locationSummary } : {}),
        ...(pageHighlights ? { page_highlights: pageHighlights } : {}),
        },
        { headers: buildApiHeaders(nextContextMode) },
      )

      if (bootstrapRequestIdRef.current !== requestId) {
        return
      }

      setMessages([{ role: 'ai', content: result.data.response }])
      setMemoryStatus(result.data.memory_used ? 'Contexto ativo' : 'Nova resposta')
      setSparkState('speaking')
      scheduleSparkReset('speaking')
      triggerIntroPulse()
      setDetectedIntent(resolveDetectedIntent(result.data.metadata))
      setCommercialIntent(resolveCommercialIntent(result.data.metadata))
      setBusinessProfile(resolveBusinessProfile(result.data.metadata))
      persistSparkMemory((currentMemory) => recordDetectedIntent(currentMemory, resolveDetectedIntent(result.data.metadata), ''))
    } catch (error) {
      if (bootstrapRequestIdRef.current !== requestId) {
        return
      }

      console.error(error)
      setMessages([{ role: 'ai', content: BOOTSTRAP_ERROR_MESSAGE }])
      setSparkState('idle')
      setMemoryStatus('Nova resposta')
      setDetectedIntent('unknown')
      setCommercialIntent(false)
      setBusinessProfile(undefined)
    } finally {
      if (bootstrapRequestIdRef.current === requestId) {
        releaseBootstrapLock()
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    setContentHistory(loadContentHistory(contentHistoryStorageKey))
  }, [contentHistoryStorageKey])

  useEffect(() => {
    setSparkMemory(loadSparkMemory(sparkMemoryStorageKey))
    lastShownSuggestionsKeyRef.current = ''
  }, [sparkMemoryStorageKey])

  const loadSparkFromBackend = useCallback(async () => {
    const backendSpark = await fetchSpark()
    saveBrandPersona(backendSpark)
    return backendSpark
  }, [])

  useEffect(() => {
    let isMounted = true

    if (savedPersona) {
      applyPersonaState(savedPersona)
    }

    void (async () => {
      try {
        const backendSpark = await loadSparkFromBackend()
        if (!isMounted) {
          return
        }
        applyPersonaState(backendSpark)
      } catch (error) {
        console.error(error)
      }
    })()

    void (async () => {
      try {
        const backendCatalog = await fetchCatalogItems()
        if (!isMounted) {
          return
        }
        setCatalogItems(backendCatalog)
      } catch (error) {
        console.error(error)
        if (isMounted) {
          setCatalogItems(loadCatalogItems())
        }
      }
    })()

    if (!hasBootstrappedRef.current && initialSavedMessages.length === 0) {
      hasBootstrappedRef.current = true
      void startConversation()
    }

    return () => {
      isMounted = false
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }

      if (introPulseTimeoutRef.current) {
        window.clearTimeout(introPulseTimeoutRef.current)
      }
    }
  }, [applyPersonaState, initialSavedMessages.length, loadSparkFromBackend, savedPersona])

  useEffect(() => {
    window.localStorage.setItem(CONTEXT_MODE_STORAGE_KEY, contextMode)
  }, [contextMode])

  useEffect(() => {
    window.localStorage.setItem(CHANNEL_MODE_STORAGE_KEY, channelMode)
  }, [channelMode])

  useEffect(() => {
    if (normalizeInstagramUsername(instagramUsername)) {
      window.localStorage.setItem(INSTAGRAM_USERNAME_STORAGE_KEY, normalizeInstagramUsername(instagramUsername))
      return
    }

    window.localStorage.removeItem(INSTAGRAM_USERNAME_STORAGE_KEY)
  }, [instagramUsername])

  useEffect(() => {
    if (messages.length > 0) {
      window.localStorage.setItem(activeMessageStorageKey, JSON.stringify(messages))
      return
    }

    window.localStorage.removeItem(activeMessageStorageKey)
  }, [activeMessageStorageKey, messages])

  useEffect(() => {
    if (!shouldShowSuggestions) {
      lastShownSuggestionsKeyRef.current = ''
      return
    }

    const suggestionsKey = suggestions.map((suggestion) => suggestion.text).join('|')
    if (!suggestionsKey || lastShownSuggestionsKeyRef.current === suggestionsKey) {
      return
    }

    lastShownSuggestionsKeyRef.current = suggestionsKey
    persistSparkMemory((currentMemory) => recordSuggestionExposure(currentMemory, suggestions.map((suggestion) => suggestion.text)))
  }, [shouldShowSuggestions, suggestions, sparkMemoryStorageKey])

  const handleNewConversation = () => {
    bootstrapRequestIdRef.current += 1
    hasBootstrappedRef.current = true
    window.localStorage.removeItem(activeMessageStorageKey)
    setMessage('')
    setSparkState('idle')
    setIsLoading(false)
    setDetectedIntent('unknown')
    setCommercialIntent(false)
    setBusinessProfile(undefined)
    setDismissedSuggestionTexts([])
    setMemoryStatus('Nova resposta')
    setMessages([])
    setIsIntroPulseActive(false)
    lastShownSuggestionsKeyRef.current = ''
    void startConversation(true, contextMode, channelMode, instagramUsername)
  }

  const handleChannelModeChange = (nextChannelMode: ChannelMode) => {
    if (contextMode !== 'customer') {
      return
    }

    if (nextChannelMode === channelMode) {
      return
    }

    bootstrapRequestIdRef.current += 1
    hasBootstrappedRef.current = true
    window.localStorage.removeItem(getMessageStorageKey('customer', nextChannelMode))
    setChannelMode(nextChannelMode)
    setDetectedIntent('unknown')
    setCommercialIntent(false)
    setBusinessProfile(undefined)
    setDismissedSuggestionTexts([])
    setMessage('')
    setMessages([])
    setSparkState('idle')
    setIsLoading(false)
    setIsIntroPulseActive(false)
    setMemoryStatus('Nova resposta')
    lastShownSuggestionsKeyRef.current = ''
    void startConversation(true, 'customer', nextChannelMode, instagramUsername)
  }

  const handleContextModeChange = (nextContextMode: ContextMode) => {
    if (nextContextMode === contextMode) {
      return
    }

    bootstrapRequestIdRef.current += 1
    hasBootstrappedRef.current = true
    setContextMode(nextContextMode)
    setDetectedIntent('unknown')
    setCommercialIntent(false)
    setBusinessProfile(undefined)
    setDismissedSuggestionTexts([])
    setMessage('')
    setMessages([])
    setSparkState('idle')
    setIsLoading(false)
    setIsIntroPulseActive(false)
    setMemoryStatus('Nova resposta')
    lastShownSuggestionsKeyRef.current = ''
    void startConversation(true, nextContextMode, channelMode, instagramUsername)
  }

  const handleEditCentelha = () => {
    setIsEditingCentelha(true)
    setOpenAdminSections(createAdminSectionsWithSingleOpen('base'))
    window.requestAnimationFrame(() => {
      document.querySelector('.admin-config-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const handleAdminSectionToggle = (section: AdminConfigSectionKey, isOpen: boolean) => {
    setOpenAdminSections((currentSections) => ({
      ...currentSections,
      [section]: isOpen,
    }))
  }

  const focusAdminSection = (section: AdminConfigSectionKey) => {
    setOpenAdminSections(createAdminSectionsWithSingleOpen(section))
  }

  const buildSectionProgress = (checks: boolean[]) => {
    const total = checks.length
    const completed = checks.filter(Boolean).length

    return {
      completed,
      total,
      status: getSectionProgressStatus(completed, total),
      label: `${completed}/${total} preenchido`,
    }
  }

  const baseSectionProgress = buildSectionProgress([
    hasText(brandName),
    hasText(logo),
    hasText(businessDescription),
    hasText(email) || hasText(instagram) || hasText(facebook) || hasText(tiktok) || hasText(site),
    hasText(whatsapp),
    hasText(address) || hasText(city) || hasText(state),
    hasText(institutionalImage),
  ])

  const professionalProfileProgress = buildSectionProgress([
    hasText(professionalData.presentation),
    hasItems(professionalData.practiceAreas),
    hasItems(professionalData.differentials),
    hasText(professionalData.identity?.headline),
    hasItems(professionalData.identity?.principles),
  ])

  const professionalGuidanceProgress = buildSectionProgress([
    hasText(professionalData.guidance?.situationType),
    hasText(professionalData.guidance?.initialResponse),
    hasItems(professionalData.guidance?.initialQuestions),
    hasItems(professionalData.guidance?.actionChecklist),
    hasItems(professionalData.guidance?.dataCollection),
    hasText(professionalData.guidance?.orientationLimits),
    hasText(professionalData.guidance?.communicationTone),
    hasText(professionalData.guidance?.closingMessage),
  ])

  const sparkPersonalityProgress = buildSectionProgress([
    hasText(tone),
    hasText(power),
    hasText(voiceStyle),
    hasText(actMode),
    hasText(businessGoal),
  ])

  const operationTypeProgress = buildSectionProgress([hasText(businessModel)])
  const publicBrandProgress = buildSectionProgress([Boolean(currentTenant?.name || brandName), Boolean(currentTenant?.slug)])
  const visualStyleProgress = buildSectionProgress([hasText(themePrimaryColor), hasText(themeSecondaryColor)])
  const serviceScheduleProgress = buildSectionProgress([
    hasText(openingStart),
    hasText(openingEnd),
    hasText(serviceRegion),
    hasText(businessHours),
    hasText(brandHighlight),
  ])
  const catalogProgress = buildSectionProgress([catalogItems.length > 0])
  const servicesProgress = buildSectionProgress([
    hasText(serviceOffers[0]?.title) || hasText(serviceOffers[1]?.title),
    hasText(schedulingConfig.title) || hasText(schedulingConfig.description),
  ])
  const emergencyProgress = buildSectionProgress([
    emergencyMode.enabled,
    hasText(emergencyType),
    typeof emergencyMode.autoStart === 'boolean',
    typeof emergencyMode.showUploadEarly === 'boolean',
  ])
  const ctaProgress = buildSectionProgress([
    ctaConfig.whatsappEnabled,
    hasText(ctaConfig.whatsappNumber),
    hasText(ctaConfig.primaryText),
    hasText(ctaConfig.secondaryText),
    ctaConfig.showAfterEvidence,
    ctaConfig.showOnCompletion,
  ])

  const renderAdminSectionTitle = (title: string, summary: string, isOpen: boolean, progress: { status: string; label: string }) => (
    <>
      <span className="admin-config-section-title-copy">
        <span>{title}</span>
        {!isOpen ? <span className="admin-config-section-summary">{summary}</span> : null}
      </span>
      <span className={`admin-config-section-badge admin-config-section-badge--${progress.status.toLowerCase()}`}>
        <strong>{progress.status}</strong>
        <span>{progress.label}</span>
      </span>
    </>
  )

  const handleOpenInteractionPage = () => {
    navigateTo('/interaction')
  }

  const handleCatalogDraftChange = <K extends keyof CatalogDraft>(field: K, value: CatalogDraft[K]) => {
    setCatalogDraft((currentDraft) => ({ ...currentDraft, [field]: value }))
    if (configStatus) {
      setConfigStatus('')
    }
  }

  const handleCopyPublicPageLink = async () => {
    try {
      await navigator.clipboard.writeText(publicPageUrl)
      setLinkCopyStatus('Link copiado')
      window.setTimeout(() => {
        setLinkCopyStatus('')
      }, 1600)
    } catch (error) {
      console.error(error)
      setLinkCopyStatus('Não consegui copiar agora')
    }
  }

  const handleOpenPublicPage = () => {
    window.open(publicPageUrl, '_blank', 'noopener,noreferrer')
  }

  const handleLogout = () => {
    logout()
    navigateTo('/login')
  }

  useEffect(() => {
    let isMounted = true

    const syncTenant = async () => {
      try {
        const tenant = await refreshCurrentTenant()
        if (isMounted && tenant) {
          setCurrentTenant(tenant)
        }
      } catch (error) {
        console.error(error)
      }
    }

    void syncTenant()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    console.log('🎨 persona atual:', currentPersona)
  }, [currentPersona])

  const handleInstitutionalImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    try {
      const nextImage = await readFileAsDataUrl(selectedFile)
      setInstitutionalImage(nextImage)
      setConfigStatus('')
    } catch (error) {
      console.error(error)
      setConfigStatus('Não consegui carregar essa imagem agora.')
    } finally {
      event.target.value = ''
    }
  }

  const handleRemoveInstitutionalImage = () => {
    setInstitutionalImage('')
    setConfigStatus('')
  }

  const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    try {
      setLogo(await readFileAsDataUrl(selectedFile))
      setConfigStatus('')
    } catch (error) {
      console.error(error)
      setConfigStatus('Não consegui carregar a logo agora.')
    } finally {
      event.target.value = ''
    }
  }

  const handleCarouselImagesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles || selectedFiles.length === 0) {
      return
    }

    try {
      setCarouselImages(await readFilesAsDataUrls(selectedFiles, 3))
      setConfigStatus('')
    } catch (error) {
      console.error(error)
      setConfigStatus('Não consegui carregar as imagens do destaque.')
    } finally {
      event.target.value = ''
    }
  }

  const handleCatalogImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    try {
      const nextImage = await readFileAsDataUrl(selectedFile)
      handleCatalogDraftChange('image', nextImage)
    } catch (error) {
      console.error(error)
      setConfigStatus('Não consegui carregar a imagem do produto.')
    } finally {
      event.target.value = ''
    }
  }

  const handleCatalogAdditionalImagesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles || selectedFiles.length === 0) {
      return
    }

    try {
      handleCatalogDraftChange('images', await readFilesAsDataUrls(selectedFiles, 3))
    } catch (error) {
      console.error(error)
      setConfigStatus('Não consegui carregar as imagens adicionais.')
    } finally {
      event.target.value = ''
    }
  }

  const handleCatalogSave = async () => {
    const normalizedItem = normalizeCatalogItem({
      id: editingCatalogId ?? undefined,
      name: catalogDraft.name,
      description: catalogDraft.description,
      image: catalogDraft.image,
      images: catalogDraft.images,
      stock: catalogDraft.stock ? Number(catalogDraft.stock) : undefined,
      availability: catalogDraft.availability,
      price: catalogDraft.price,
      highlight: catalogDraft.highlight,
      category: catalogDraft.category,
      priority: catalogDraft.priority,
      isFeatured: catalogDraft.isFeatured,
      isPromotion: catalogDraft.isPromotion,
      isNewArrival: catalogDraft.isNewArrival,
      complements: catalogDraft.complements
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    })

    if (!normalizedItem) {
      setConfigStatus('Preencha nome e descrição do item para salvar o catálogo.')
      return
    }

    try {
      const savedItem =
        editingCatalogId !== null ? await updateCatalogItem(editingCatalogId, normalizedItem) : await createCatalogItem(normalizedItem)

      setCatalogItems((currentItems) => {
        const nextItems =
          editingCatalogId !== null
            ? currentItems.map((item) => (item.id === editingCatalogId ? savedItem : item))
            : [...currentItems, savedItem].slice(0, 6)
        saveCatalogItems(nextItems)
        return nextItems
      })
      setCatalogDraft(createEmptyCatalogDraft())
      setEditingCatalogId(null)
      setConfigStatus('')
    } catch (error) {
      console.error(error)
      setConfigStatus('Não consegui salvar esse item no backend agora.')
    }
  }

  const handleCatalogEdit = (item: CatalogItem) => {
    setEditingCatalogId(item.id)
    setCatalogDraft({
      name: item.name,
      description: item.description,
      image: item.image ?? '',
      images: item.images ?? [],
      stock: typeof item.stock === 'number' ? String(item.stock) : '',
      availability: item.availability ?? 'available',
      price: item.price ?? '',
      highlight: item.highlight ?? '',
      category: item.category ?? '',
      priority: item.priority ?? 'medium',
      isFeatured: item.isFeatured ?? false,
      isPromotion: item.isPromotion ?? false,
      isNewArrival: item.isNewArrival ?? false,
      complements: item.complements?.join(', ') ?? '',
    })
    if (configStatus) {
      setConfigStatus('')
    }
  }

  const handleCatalogRemove = async (itemId: string) => {
    try {
      await deleteCatalogItem(itemId)
      setCatalogItems((currentItems) => {
        const nextItems = currentItems.filter((item) => item.id !== itemId)
        saveCatalogItems(nextItems)
        return nextItems
      })
      if (editingCatalogId === itemId) {
        setEditingCatalogId(null)
        setCatalogDraft(createEmptyCatalogDraft())
      }
      if (configStatus) {
        setConfigStatus('')
      }
    } catch (error) {
      console.error(error)
      setConfigStatus('Não consegui remover esse item no backend agora.')
    }
  }

  const handleSaveBrandConfiguration = async () => {
    saveBrandPersona(currentPersona)

    try {
      await saveSpark(currentPersona)
      const updatedSpark = await loadSparkFromBackend()
      applyPersonaState(updatedSpark)
      setIsEditingCentelha(false)
      setConfigStatus('Configuração salva. A página pública já reflete isso.')
    } catch (error) {
      console.error(error)
      setConfigStatus('Salvei localmente, mas não consegui sincronizar com o backend agora.')
    }
  }

  const sendUserMessage = async (rawMessage: string) => {
    const trimmedMessage = rawMessage.trim()
    if (!trimmedMessage || isLoading) {
      return
    }

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
      const requestConfig = buildChannelRequestConfig(contextMode, channelMode, instagramUsername)
      const result = await axios.post<ChannelMessageResponse>(
        buildApiUrl('/channel/message'),
        {
        channel: requestConfig.channel,
        user_id: userId,
        brand_name: brandName,
        message: trimmedMessage,
        persona: buildPersonaPayload(),
        messages,
        context_mode: contextMode,
        business_goal: businessGoal,
        metadata: requestConfig.metadata,
        ...(businessStatus ? { business_status: businessStatus } : {}),
        ...(memorySummary ? { memory_summary: memorySummary } : {}),
        ...(catalogSummary.length > 0 ? { catalog_summary: catalogSummary } : {}),
        ...(locationSummary ? { location_summary: locationSummary } : {}),
        ...(pageHighlights ? { page_highlights: pageHighlights } : {}),
        },
        { headers: buildApiHeaders(contextMode) },
      )

      setMessages((previousMessages) => [...previousMessages, { role: 'ai', content: result.data.response }])
      saveStructuredContentIfNeeded(result.data.response)
      setMemoryStatus(result.data.memory_used ? 'Contexto ativo' : 'Nova resposta')
      setSparkState(result.data.spark_state)
      scheduleSparkReset(result.data.spark_state)
      setDetectedIntent(resolveDetectedIntent(result.data.metadata))
      setCommercialIntent(resolveCommercialIntent(result.data.metadata))
      setBusinessProfile(resolveBusinessProfile(result.data.metadata))
      persistSparkMemory((currentMemory) =>
        recordDetectedIntent(recordInteractionWindow(currentMemory), resolveDetectedIntent(result.data.metadata), trimmedMessage),
      )
    } catch (error) {
      console.error(error)
      setMessages((previousMessages) => [
        ...previousMessages,
        { role: 'ai', content: 'Travei por um instante aqui. Me escreve de novo e eu continuo.' },
      ])
      setMemoryStatus(nextMessages.length > 1 ? 'Contexto ativo' : 'Nova resposta')
      setSparkState('idle')
      setDetectedIntent('unknown')
      setCommercialIntent(false)
      setBusinessProfile(undefined)
    } finally {
      setIsLoading(false)
    }
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await sendUserMessage(message)
  }

  const handleSuggestionSelect = (suggestion: Suggestion) => {
    setDismissedSuggestionTexts((currentSuggestions) => [...currentSuggestions, suggestion.text])
    persistSparkMemory((currentMemory) => recordSuggestionSelection(currentMemory, suggestion.text))
    void sendUserMessage(buildSuggestionPrompt(suggestion))
  }

  const handleContentActionSelect = (action: ContentAction) => {
    void sendUserMessage(action.prompt)
  }

  const saveStructuredContentIfNeeded = (rawText: string) => {
    if (contextMode !== 'admin') {
      return
    }

    const parsedContent = parseStructuredContent(rawText)
    if (!parsedContent) {
      return
    }

    setContentHistory(prependContentHistoryItem(contentHistoryStorageKey, buildContentHistoryItem(parsedContent)))
  }

  const handleClearContentHistory = () => {
    clearContentHistory(contentHistoryStorageKey)
    setContentHistory([])
  }

  const handleBusinessModelChange = (nextBusinessModel: BusinessModelOption) => {
    setBusinessModel(nextBusinessModel)
    setBrandType(nextBusinessModel === 'professional' ? 'professional' : 'business')
    const defaults = createDefaultFeatures(nextBusinessModel)
    const nextEmergencyMode = createDefaultEmergencyMode(nextBusinessModel)
    const nextFeatures = {
      products: defaults.products,
      services: defaults.services,
      scheduling: defaults.scheduling,
      emergency: nextEmergencyMode.enabled,
    }
    setFeatures(nextFeatures)
    setModes({
      sales: nextFeatures.products,
      service: nextFeatures.services || nextBusinessModel === 'professional',
      scheduling: nextFeatures.scheduling,
      emergency: nextEmergencyMode.enabled,
    })
    setEmergencyMode(nextEmergencyMode)

    if (nextBusinessModel === 'professional') {
      focusAdminSection('professionalProfile')
      return
    }

    if (nextBusinessModel === 'service') {
      focusAdminSection('services')
      return
    }

    focusAdminSection('catalog')
  }

  const handleEmergencyModeConfigChange = <K extends keyof EmergencyModeConfig>(field: K, value: EmergencyModeConfig[K]) => {
    setEmergencyMode((currentMode) => {
      const nextMode = { ...currentMode, [field]: value }

      if (field === 'enabled') {
        setFeatures((currentFeatures) => ({
          ...currentFeatures,
          emergency: value as boolean,
        }))
        setModes((currentModes) => ({
          ...currentModes,
          emergency: value as boolean,
        }))
      }

      return nextMode
    })
  }

  const handleServiceOfferChange = (index: number, field: 'title' | 'summary' | 'label', value: string) => {
    setServiceOffers((currentOffers) => {
      const nextOffers = [...currentOffers]
      while (nextOffers.length <= index) {
        nextOffers.push({ title: '', summary: '', label: '' })
      }
      nextOffers[index] = { ...nextOffers[index], [field]: value }
      return nextOffers
    })
  }

  const handleProfessionalCaseChange = (index: number, field: 'caseType' | 'context' | 'approach' | 'learning', value: string) => {
    setProfessionalData((currentData) => {
      const nextCases = [...(currentData.cases ?? [])]
      while (nextCases.length <= index) {
        nextCases.push({ caseType: '', context: '', approach: '', learning: '' })
      }
      nextCases[index] = { ...nextCases[index], [field]: value }
      return { ...currentData, cases: nextCases }
    })
  }

  const handleProfessionalContentChange = (index: number, field: 'title' | 'summary' | 'stance', value: string) => {
    setProfessionalData((currentData) => {
      const nextContents = [...(currentData.contents ?? [])]
      while (nextContents.length <= index) {
        nextContents.push({ title: '', summary: '', stance: '' })
      }
      nextContents[index] = { ...nextContents[index], [field]: value }
      return { ...currentData, contents: nextContents }
    })
  }

  const handleProfessionalOperationModeChange = (nextMode: ProfessionalOperationMode) => {
    setProfessionalData((currentData) => ({ ...currentData, operationMode: nextMode }))

    if (nextMode === 'guidance') {
      focusAdminSection('professionalGuidance')
      return
    }

    focusAdminSection('professionalProfile')
  }

  const handleApplyGuidancePlaybook = (playbookKey: ProfessionalGuidancePlaybookKey) => {
    const playbook = professionalGuidancePlaybooks[playbookKey]
    setProfessionalData((currentData) => ({
      ...currentData,
      operationMode: 'guidance',
      guidance: {
        ...(currentData.guidance ?? {}),
        situationType: playbook.situationType,
        initialResponse: playbook.initialResponse,
        initialQuestions: playbook.initialQuestions,
        actionChecklist: playbook.actionChecklist,
        dataCollection: playbook.dataCollection,
        orientationLimits: playbook.orientationLimits,
        closingMessage: playbook.closingMessage,
        playbooks: {
          ...(currentData.guidance?.playbooks ?? professionalGuidancePlaybooks),
          [playbookKey]: playbook,
        },
      },
    }))
  }

  return (
    <main className={`app-shell ${contextMode === 'admin' ? 'app-shell-admin' : ''}`}>
      <section className="identity-panel">
        <div className="identity-copy identity-copy--admin">
          <div className="eyebrow">Painel da marca</div>
          <div className="admin-tenant-strip" aria-label="Contexto autenticado da marca">
            <span className="admin-tenant-chip">{currentTenant?.name || brandName}</span>
            <span className="admin-tenant-chip admin-tenant-chip--slug">{publicSlugLabel}</span>
            <span className="admin-tenant-chip admin-tenant-chip--session">{currentUser?.email ? `Sessão ativa: ${currentUser.email}` : 'Sessão ativa'}</span>
          </div>
          <h1>{brandName}</h1>
          <p className="identity-tagline">{identityTagline}</p>
          <p className="hero-copy">Operação viva da marca: conversa, conteúdo e ajustes da Centelha em um fluxo direto.</p>
        </div>

        <div className="identity-chip-grid identity-chip-grid--admin" aria-label="Estado atual da Centelha">
          {identityChips.map((chip) => (
            <div key={chip.label} className="identity-chip identity-chip--alive">
              <span className="identity-chip-label">{chip.label}</span>
              <strong>{chip.text}</strong>
            </div>
          ))}
        </div>

        {businessDescription.trim() ? (
          <div className="identity-context" aria-label="Atuação da marca">
            <span className="identity-context-label">Manifesto curto</span>
            <p className="brand-description">{businessDescription.trim()}</p>
          </div>
        ) : null}

        <div className="spark-spotlight">
          <div className={`spark-stage ${isIntroPulseActive ? 'spark-intro-active' : ''}`}>
            <BrandSpark brandName={brandName} state={sparkState} tone={tone} power={power} logo={logo} />
          </div>
          <div className="spark-caption">
            <span className={`spark-status-dot ${sparkState}`} />
            <span>
              {sparkState === 'thinking'
                ? 'Estou absorvendo o contexto.'
                : sparkState === 'speaking'
                  ? 'Estou respondendo com energia.'
                  : 'Estou aqui, ativa e pronta para conversar.'}
            </span>
          </div>
        </div>

        <div className="future-teaser-card" aria-label="Visão futura">
          <div className="future-teaser-copy">
            <span className="future-teaser-label">Próxima temporada</span>
            <strong>Centelhas conversando entre si.</strong>
            <p>Centelhas colaborando e criando novos movimentos para marcas, em um capítulo futuro do BrandSoul.</p>
          </div>
          <button type="button" className="chat-header-button subtle future-teaser-button" onClick={handleOpenInteractionPage}>
            Ver teaser
          </button>
        </div>

        {isEditingCentelha ? (
        <section className="admin-config-panel" aria-label="Configuração da marca">
          <div className="admin-config-header">
            <span className="eyebrow">Editar Centelha</span>
            <h2>Tipo de operação da marca</h2>
            <p>Escolha como a marca atua e eu ajusto o restante da configuração em um fluxo mais claro e contínuo.</p>
            <HintBox
              compact
              icon="✨"
              title="O que você ajusta aqui?"
              description="Essas configurações moldam como a marca aparece, conversa e conduz o cliente sem misturar produto, serviço e atuação profissional."
            />
          </div>

          <details className="admin-config-section" open={openAdminSections.base} onToggle={(event) => handleAdminSectionToggle('base', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Base da marca', 'Nome, logo, descrição, contato e localização', openAdminSections.base, baseSectionProgress)}</summary>
            <div className="admin-config-section-body">
            <p className="admin-config-section-intro">Quem é sua marca e como ela se apresenta.</p>
            <div className="admin-config-grid">
              <label className="persona-field">
                <span className="persona-label">Nome da marca</span>
                <input className="persona-input" value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Sua marca" />
              </label>
            </div>

            <div className="admin-image-panel compact">
              <div className="brand-logo-upload-preview">
                {logo ? <img src={logo} alt={`Logo de ${brandName}`} className="brand-logo-image" /> : <div className="brand-logo-fallback">{brandName.slice(0, 2).toUpperCase()}</div>}
              </div>
              <label className="persona-field admin-upload-field">
                <span className="persona-label">Logo da marca</span>
                <input className="persona-input" type="file" accept="image/*" onChange={handleLogoChange} />
              </label>
            </div>

            <label className="persona-field">
              <span className="persona-label">Atuação</span>
              <HintBox
                compact
                icon="🏪"
                title="Sobre sua empresa"
                description="Explique em poucas palavras o que sua marca faz. Isso ajuda a Centelha a responder com mais contexto e naturalidade."
              />
              <textarea
                className="persona-input persona-textarea"
                value={businessDescription}
                onChange={(event) => setBusinessDescription(event.target.value)}
                placeholder="O que a empresa faz e como quer ser percebida."
                rows={3}
              />
            </label>

            <div className="admin-config-grid">
              <label className="persona-field">
                <span className="persona-label">WhatsApp da marca</span>
                <HintBox
                  compact
                  icon="📲"
                  title="Para onde a conversa vai depois"
                  description="Quando o cliente estiver pronto para continuar, a marca pode direcionar para você pelo WhatsApp ou outro canal."
                />
                <input className="persona-input" value={whatsapp} onChange={(event) => setWhatsapp(sanitizeWhatsAppInput(event.target.value))} placeholder="Ex: +5531999999999" />
                <span className="persona-field-hint">Use o número com código do país e DDD, sem espaços.</span>
              </label>
              <label className="persona-field">
                <span className="persona-label">Email</span>
                <input className="persona-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contato@suaempresa.com" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Instagram</span>
                <input className="persona-input" value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="@suaempresa" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Facebook</span>
                <input className="persona-input" value={facebook} onChange={(event) => setFacebook(event.target.value)} placeholder="/suaempresa" />
              </label>
              <label className="persona-field">
                <span className="persona-label">TikTok</span>
                <input className="persona-input" value={tiktok} onChange={(event) => setTiktok(event.target.value)} placeholder="@suaempresa" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Site</span>
                <input className="persona-input" value={site} onChange={(event) => setSite(event.target.value)} placeholder="https://suaempresa.com" />
              </label>
            </div>

            <div className="admin-config-grid">
              <label className="persona-field">
                <span className="persona-label">Endereço</span>
                <input className="persona-input" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Rua X, 123" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Cidade</span>
                <input className="persona-input" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Belo Horizonte" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Estado</span>
                <input className="persona-input" value={state} onChange={(event) => setState(event.target.value)} placeholder="MG" />
              </label>
            </div>

            <div className="admin-image-panel">
              <div className="admin-image-preview-shell">
                {institutionalImage ? <img src={institutionalImage} alt={`Imagem institucional de ${brandName}`} className="admin-image-preview" /> : <div className="admin-image-placeholder">Imagem institucional</div>}
              </div>
              <div className="admin-upload-stack">
                <label className="persona-field admin-upload-field">
                  <span className="persona-label">Foto institucional</span>
                  <input className="persona-input" type="file" accept="image/*" onChange={handleInstitutionalImageChange} />
                </label>
                {institutionalImage ? (
                  <button type="button" className="chat-header-button subtle admin-remove-button" onClick={handleRemoveInstitutionalImage}>
                    Remover imagem
                  </button>
                ) : null}
              </div>
            </div>

            </div>
          </details>

          <details className="admin-config-section" open={openAdminSections.operationType} onToggle={(event) => handleAdminSectionToggle('operationType', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Tipo de operação', 'Define se a marca atua com produtos, serviços ou perfil profissional', openAdminSections.operationType, operationTypeProgress)}</summary>
            <div className="admin-config-section-body">
              <p className="admin-config-section-intro">Como sua marca atua e qual trilha principal faz sentido para essa operação.</p>
              <HintBox
                compact
                icon="🧭"
                title="Como sua marca atua"
                description="Escolha o modelo principal desta operação. A interface e os fluxos abaixo se adaptam a essa decisão."
              />
              <div className="persona-style-grid">
                {businessModelOptions.map((option) => {
                  const isSelected = businessModel === option.value

                  return (
                    <button key={option.value} type="button" className={`persona-style-card ${isSelected ? 'selected' : ''}`} onClick={() => handleBusinessModelChange(option.value)}>
                      <strong>
                        {option.emoji} {option.label}
                      </strong>
                      <span>{option.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </details>

          {businessModel === 'professional' ? (
          <details className="admin-config-section" open={openAdminSections.professionalProfile} onToggle={(event) => handleAdminSectionToggle('professionalProfile', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Perfil profissional', 'Apresentação, áreas, diferenciais e princípios', openAdminSections.professionalProfile, professionalProfileProgress)}</summary>
            <div className="admin-config-section-body">
              <p className="admin-config-section-intro">Como esse profissional se apresenta, gera confiança e constrói presença.</p>
              <HintBox
                compact
                icon="⚖️"
                title="Presença e autoridade"
                description="Apresente atuação, áreas e diferenciais de forma sóbria, clara e confiável."
              />
              <div className="admin-config-grid">
                <label className="persona-field admin-config-grid-span">
                  <span className="persona-label">Apresentação</span>
                  <textarea
                    className="persona-input persona-textarea"
                    value={professionalData.presentation ?? ''}
                    onChange={(event) => setProfessionalData((currentData) => ({ ...currentData, presentation: event.target.value }))}
                    placeholder="Ex.: Atuação jurídica estratégica com foco em prevenção, clareza e resposta técnica."
                    rows={3}
                  />
                </label>

                <label className="persona-field">
                  <span className="persona-label">Áreas de atuação</span>
                  <input
                    className="persona-input"
                    value={formatCommaSeparatedList(professionalData.practiceAreas)}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({ ...currentData, practiceAreas: parseCommaSeparatedList(event.target.value) }))
                    }
                    placeholder="Empresarial, trabalhista, contratos"
                  />
                </label>

                <label className="persona-field">
                  <span className="persona-label">Diferenciais</span>
                  <input
                    className="persona-input"
                    value={formatCommaSeparatedList(professionalData.differentials)}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({ ...currentData, differentials: parseCommaSeparatedList(event.target.value) }))
                    }
                    placeholder="Resposta ágil, análise cuidadosa, atuação estratégica"
                  />
                </label>

                <label className="persona-field admin-config-grid-span">
                  <span className="persona-label">Frase de identidade</span>
                  <input
                    className="persona-input"
                    value={professionalData.identity?.headline ?? ''}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({
                        ...currentData,
                        identity: { ...(currentData.identity ?? {}), headline: event.target.value },
                      }))
                    }
                    placeholder="Ex.: Clareza técnica, presença serena e atuação responsável."
                  />
                </label>

                <label className="persona-field admin-config-grid-span">
                  <span className="persona-label">Princípios</span>
                  <input
                    className="persona-input"
                    value={formatCommaSeparatedList(professionalData.identity?.principles)}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({
                        ...currentData,
                        identity: { ...(currentData.identity ?? {}), principles: parseCommaSeparatedList(event.target.value) },
                      }))
                    }
                    placeholder="Ética, clareza, discrição"
                  />
                </label>

                {[0, 1].map((index) => (
                  <div key={`professional-case-${index}`} className="admin-config-grid admin-config-grid-span">
                    <label className="persona-field">
                      <span className="persona-label">Tipo de caso</span>
                      <input
                        className="persona-input"
                        value={professionalData.cases?.[index]?.caseType ?? ''}
                        onChange={(event) => handleProfessionalCaseChange(index, 'caseType', event.target.value)}
                        placeholder="Ex.: Contrato, crise, urgência regulatória"
                      />
                    </label>
                    <label className="persona-field">
                      <span className="persona-label">Contexto</span>
                      <input
                        className="persona-input"
                        value={professionalData.cases?.[index]?.context ?? ''}
                        onChange={(event) => handleProfessionalCaseChange(index, 'context', event.target.value)}
                        placeholder="Em que cenário esse caso aparece"
                      />
                    </label>
                    <label className="persona-field">
                      <span className="persona-label">Abordagem</span>
                      <input
                        className="persona-input"
                        value={professionalData.cases?.[index]?.approach ?? ''}
                        onChange={(event) => handleProfessionalCaseChange(index, 'approach', event.target.value)}
                        placeholder="Como a atuação é conduzida"
                      />
                    </label>
                    <label className="persona-field">
                      <span className="persona-label">Aprendizado</span>
                      <input
                        className="persona-input"
                        value={professionalData.cases?.[index]?.learning ?? ''}
                        onChange={(event) => handleProfessionalCaseChange(index, 'learning', event.target.value)}
                        placeholder="Que leitura isso deixa"
                      />
                    </label>
                  </div>
                ))}

                {[0, 1].map((index) => (
                  <div key={`professional-content-${index}`} className="admin-config-grid admin-config-grid-span">
                    <label className="persona-field">
                      <span className="persona-label">Título do conteúdo</span>
                      <input
                        className="persona-input"
                        value={professionalData.contents?.[index]?.title ?? ''}
                        onChange={(event) => handleProfessionalContentChange(index, 'title', event.target.value)}
                        placeholder="Ex.: O que fazer nas primeiras horas de um conflito contratual"
                      />
                    </label>
                    <label className="persona-field">
                      <span className="persona-label">Resumo</span>
                      <input
                        className="persona-input"
                        value={professionalData.contents?.[index]?.summary ?? ''}
                        onChange={(event) => handleProfessionalContentChange(index, 'summary', event.target.value)}
                        placeholder="Resumo curto e informativo"
                      />
                    </label>
                    <label className="persona-field admin-config-grid-span">
                      <span className="persona-label">Posicionamento</span>
                      <input
                        className="persona-input"
                        value={professionalData.contents?.[index]?.stance ?? ''}
                        onChange={(event) => handleProfessionalContentChange(index, 'stance', event.target.value)}
                        placeholder="Ex.: Visão técnica, preventiva e clara sobre esse tema"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </details>
          ) : null}

          {businessModel === 'professional' ? (
          <details className="admin-config-section" open={openAdminSections.professionalMode} onToggle={(event) => handleAdminSectionToggle('professionalMode', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Modo de atuação', 'Escolhe como o profissional aparece e conduz o atendimento', openAdminSections.professionalMode, buildSectionProgress([hasText(professionalData.operationMode)]))}</summary>
            <div className="admin-config-section-body">
              <p className="admin-config-section-intro">Como esse profissional aparece e conduz a presença digital.</p>
              <HintBox
                compact
                icon="🧭"
                title="Como esse profissional aparece"
                description="Escolha se a presença é mais institucional, orientada por conteúdo ou guiada por diretrizes de orientação inicial."
              />
              <div className="persona-style-grid">
                {professionalOperationModeOptions.map((option) => {
                  const isSelected = (professionalData.operationMode ?? 'institutional') === option.value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`persona-style-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleProfessionalOperationModeChange(option.value)}
                    >
                      <strong>
                        {option.emoji} {option.label}
                      </strong>
                      <span>{option.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </details>
          ) : null}

          {businessModel === 'professional' && professionalData.operationMode === 'guidance' ? (
          <details className="admin-config-section" open={openAdminSections.professionalGuidance} onToggle={(event) => handleAdminSectionToggle('professionalGuidance', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Diretrizes profissionais', 'Playbooks, perguntas, limites e encerramento da orientação', openAdminSections.professionalGuidance, professionalGuidanceProgress)}</summary>
            <div className="admin-config-section-body">
              <p className="admin-config-section-intro">Como a orientação é conduzida, com limite claro e coleta organizada do caso.</p>
              <HintBox
                compact
                icon="🛡️"
                title="Orientação inicial com limite claro"
                description="Defina como a Centelha orienta, coleta dados e encerra a conversa sem prometer resultado nem substituir o profissional."
              />

              <div className="persona-field admin-config-grid-span">
                <span className="persona-label">Playbooks prontos</span>
                <div className="persona-style-grid">
                  <button type="button" className="persona-style-card" onClick={() => handleApplyGuidancePlaybook('acidente_transito')}>
                    <strong>🚗 Acidente de trânsito</strong>
                    <span>Primeiros passos, coleta de evidências e organização inicial do caso.</span>
                  </button>
                  <button type="button" className="persona-style-card" onClick={() => handleApplyGuidancePlaybook('consumidor')}>
                    <strong>🧾 Problema do consumidor</strong>
                    <span>Comprovantes, histórico e organização da situação antes da análise completa.</span>
                  </button>
                </div>
              </div>

              <div className="admin-config-grid">
                <label className="persona-field">
                  <span className="persona-label">Tipo de situação</span>
                  <input
                    className="persona-input"
                    value={professionalData.guidance?.situationType ?? ''}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({
                        ...currentData,
                        guidance: { ...(currentData.guidance ?? {}), situationType: event.target.value },
                      }))
                    }
                    placeholder="Ex.: conflito contratual, urgência trabalhista, orientação regulatória"
                  />
                </label>

                <label className="persona-field admin-config-grid-span">
                  <span className="persona-label">Resposta inicial</span>
                  <textarea
                    className="persona-input persona-textarea"
                    value={professionalData.guidance?.initialResponse ?? ''}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({
                        ...currentData,
                        guidance: { ...(currentData.guidance ?? {}), initialResponse: event.target.value },
                      }))
                    }
                    placeholder="Ex.: Primeiro eu organizo os fatos essenciais, avalio urgência e te explico o próximo passo com clareza."
                    rows={3}
                  />
                </label>

                <label className="persona-field">
                  <span className="persona-label">Perguntas iniciais</span>
                  <input
                    className="persona-input"
                    value={formatCommaSeparatedList(professionalData.guidance?.initialQuestions)}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({
                        ...currentData,
                        guidance: { ...(currentData.guidance ?? {}), initialQuestions: parseCommaSeparatedList(event.target.value) },
                      }))
                    }
                    placeholder="Ex.: Você está seguro?, Alguém se feriu?, Isso aconteceu agora?"
                  />
                </label>

                <label className="persona-field">
                  <span className="persona-label">Checklist de ação</span>
                  <input
                    className="persona-input"
                    value={formatCommaSeparatedList(professionalData.guidance?.actionChecklist)}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({
                        ...currentData,
                        guidance: { ...(currentData.guidance ?? {}), actionChecklist: parseCommaSeparatedList(event.target.value) },
                      }))
                    }
                    placeholder="Ex.: entender contexto, checar prazo, organizar próximos passos"
                  />
                </label>

                <label className="persona-field">
                  <span className="persona-label">Coleta de dados</span>
                  <input
                    className="persona-input"
                    value={formatCommaSeparatedList(professionalData.guidance?.dataCollection)}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({
                        ...currentData,
                        guidance: { ...(currentData.guidance ?? {}), dataCollection: parseCommaSeparatedList(event.target.value) },
                      }))
                    }
                    placeholder="Ex.: data, envolvidos, documentos, impacto, urgência"
                  />
                </label>

                <label className="persona-field admin-config-grid-span">
                  <span className="persona-label">Limites da orientação</span>
                  <textarea
                    className="persona-input persona-textarea"
                    value={professionalData.guidance?.orientationLimits ?? ''}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({
                        ...currentData,
                        guidance: { ...(currentData.guidance ?? {}), orientationLimits: event.target.value },
                      }))
                    }
                    placeholder="Ex.: Não emitir parecer definitivo, não prometer resultado e sempre encaminhar para análise profissional completa."
                    rows={3}
                  />
                </label>

                <label className="persona-field">
                  <span className="persona-label">Tom de comunicação</span>
                  <input
                    className="persona-input"
                    value={professionalData.guidance?.communicationTone ?? ''}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({
                        ...currentData,
                        guidance: { ...(currentData.guidance ?? {}), communicationTone: event.target.value },
                      }))
                    }
                    placeholder="Ex.: sereno, técnico, cuidadoso, objetivo"
                  />
                </label>

                <label className="persona-field admin-config-grid-span">
                  <span className="persona-label">Encerramento</span>
                  <textarea
                    className="persona-input persona-textarea"
                    value={professionalData.guidance?.closingMessage ?? ''}
                    onChange={(event) =>
                      setProfessionalData((currentData) => ({
                        ...currentData,
                        guidance: { ...(currentData.guidance ?? {}), closingMessage: event.target.value },
                      }))
                    }
                    placeholder="Ex.: Com essas informações organizadas, um profissional poderá analisar melhor seu caso."
                    rows={2}
                  />
                </label>
              </div>
            </div>
          </details>
          ) : null}

          <details className="admin-config-section" open={openAdminSections.sparkPersonality} onToggle={(event) => handleAdminSectionToggle('sparkPersonality', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Personalidade da Centelha', 'Tom, energia, estilo de resposta e objetivo atual', openAdminSections.sparkPersonality, sparkPersonalityProgress)}</summary>
            <div className="admin-config-section-body">
              <p className="admin-config-section-intro">Como a Centelha fala, conduz e responde ao contexto da marca.</p>
              <div className="persona-field admin-config-grid-span">
                <span className="persona-label">Personalidade</span>
                <HintBox compact icon="💬" title="Como sua marca fala" description="Define a personalidade da sua marca ao conversar com clientes." />
                <div className="persona-chip-grid">
                  {toneOptions.map((option) => {
                    const isSelected = tone === option.value
                    return (
                      <button key={option.value} type="button" className={`persona-chip ${isSelected ? 'selected' : ''}`} onClick={() => setTone(option.value)}>
                        <span>{option.label}</span>
                        <strong>{option.emoji}</strong>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="persona-field admin-config-grid-span">
                <span className="persona-label">Energia</span>
                <HintBox compact icon="⚡" title="Como sua marca impacta" description="Define a energia principal da comunicação da marca." />
                <div className="persona-chip-grid">
                  {powerOptions.map((option) => {
                    const isSelected = power === option.value
                    return (
                      <button key={option.value} type="button" className={`persona-chip ${isSelected ? 'selected power' : 'power'}`} onClick={() => setPower(option.value)}>
                        <span>{option.label}</span>
                        <strong>{option.emoji}</strong>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="persona-field admin-config-grid-span">
                <span className="persona-label">Como eu me comunico</span>
                <HintBox compact icon="🎙️" title="Forma de se comunicar" description="Ajusta como a marca responde: de forma mais suave, forte, equilibrada ou adaptativa." />
                <div className="persona-style-grid">
                  {voiceStyleOptions.map((option) => {
                    const isSelected = voiceStyle === option.value
                    return (
                      <button key={option.value} type="button" className={`persona-style-card ${isSelected ? 'selected' : ''}`} onClick={() => setVoiceStyle(option.value)}>
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </button>
                    )
                  })}
                </div>
                {voiceStyle === 'irreverent' ? <div className="persona-voice-warning">Esse estilo usa humor e uma linguagem mais ousada. Ative apenas se isso fizer sentido para sua marca.</div> : null}
              </div>

              <div className="persona-field admin-config-grid-span">
                <span className="persona-label">Como eu atuo com seus clientes</span>
                <HintBox compact icon="🧠" title="Como sua marca ajuda" description="Define como a marca age durante a conversa: como vendedora, consultora, estilista, coach ou especialista." />
                <div className="persona-style-grid">
                  {actModeOptions.map((option) => {
                    const isSelected = actMode === option.value
                    return (
                      <button key={option.value} type="button" className={`persona-style-card ${isSelected ? 'selected' : ''}`} onClick={() => setActMode(option.value)}>
                        <strong>
                          {option.emoji} {option.label}
                        </strong>
                        <span>{option.description}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="persona-field admin-config-grid-span">
                <span className="persona-label">Objetivo do negócio agora</span>
                <HintBox compact icon="🎯" title="Foco principal agora" description="Ajuda a IA a entender o que sua marca quer priorizar: vender mais, aumentar ticket, girar estoque ou destacar novidades." />
                <div className="persona-style-grid">
                  {businessGoalOptions.map((option) => {
                    const isSelected = businessGoal === option.value
                    return (
                      <button key={option.value} type="button" className={`persona-style-card ${isSelected ? 'selected' : ''}`} onClick={() => setBusinessGoal(option.value)}>
                        <strong>
                          {option.emoji} {option.label}
                        </strong>
                        <span>{option.description}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </details>

          <details className="admin-config-section" open={openAdminSections.publicBrand} onToggle={(event) => handleAdminSectionToggle('publicBrand', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Marca pública', 'Como a página aparece para o público', openAdminSections.publicBrand, publicBrandProgress)}</summary>
            <div className="admin-config-section-body">
            <p className="admin-config-section-intro">Como a marca aparece para o público e qual link está pronto para compartilhamento.</p>
            <div className="admin-public-link-card">
              <div className="admin-public-link-copy">
                <span className="persona-label">Tenant atual</span>
                <strong>{currentTenant?.name || brandName}</strong>
                <span className="admin-public-link-slug">{publicSlugLabel}</span>
                <span className="persona-label">Link atual</span>
                <strong>{publicPageUrl}</strong>
                <span>Esse é o link que posso abrir para clientes agora.</span>
              </div>
              <div className="admin-config-actions">
                <button type="button" className="chat-header-button subtle" onClick={handleCopyPublicPageLink}>
                  {linkCopyStatus || 'Copiar link'}
                </button>
                <button type="button" className="chat-header-button" onClick={handleOpenPublicPage}>
                  Abrir página em nova aba
                </button>
              </div>
            </div>
            </div>
          </details>

          <details className="admin-config-section" open={openAdminSections.visualStyle} onToggle={(event) => handleAdminSectionToggle('visualStyle', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Estilo visual da página', 'Cores, aparência e identidade visual', openAdminSections.visualStyle, visualStyleProgress)}</summary>
            <div className="admin-config-section-body">
              <p className="admin-config-section-intro">Como a página aparece visualmente e o que ganha destaque para o cliente.</p>
              <div className="admin-config-grid">
                <label className="persona-field">
                  <span className="persona-label">Cor principal</span>
                  <input className="persona-input persona-color-input" type="color" value={themePrimaryColor} onChange={(event) => setThemePrimaryColor(event.target.value)} />
                </label>
                <label className="persona-field">
                  <span className="persona-label">Cor secundaria</span>
                  <input className="persona-input persona-color-input" type="color" value={themeSecondaryColor} onChange={(event) => setThemeSecondaryColor(event.target.value)} />
                </label>
              </div>

              <div className="theme-preview-strip" aria-hidden="true">
                <span style={{ background: themePrimaryColor }} />
                <span style={{ background: themeSecondaryColor }} />
              </div>

              <div className="persona-field admin-config-grid-span">
                <span className="persona-label">O que mostrar na sua página</span>
                <div className="persona-toggle-row">
                  <button type="button" className={`persona-toggle ${showCarousel ? 'selected' : ''}`} onClick={() => setShowCarousel((current) => !current)}>
                    Mostrar carrossel de destaque
                  </button>
                  <button type="button" className={`persona-toggle ${showPromotions ? 'selected' : ''}`} onClick={() => setShowPromotions((current) => !current)}>
                    Mostrar promoções em destaque
                  </button>
                  <button type="button" className={`persona-toggle ${showNewArrivals ? 'selected' : ''}`} onClick={() => setShowNewArrivals((current) => !current)}>
                    Mostrar novidades
                  </button>
                </div>
              </div>

              <div className="persona-field">
                <span className="persona-label">Imagens do carrossel</span>
                <input className="persona-input" type="file" accept="image/*" multiple onChange={handleCarouselImagesChange} />
                <span className="persona-field-hint">Opcional. Use até 3 imagens para um destaque mais comercial.</span>
              </div>

              {carouselImages.length > 0 ? (
                <div className="admin-inline-gallery">
                  {carouselImages.map((image, index) => (
                    <div key={`${image}-${index}`} className="admin-inline-gallery-item">
                      <img src={image} alt={`Destaque ${index + 1}`} className="admin-inline-gallery-image" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </details>

          {businessModel === 'service' ? (
          <details className="admin-config-section" open={openAdminSections.serviceSchedule} onToggle={(event) => handleAdminSectionToggle('serviceSchedule', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Agenda e disponibilidade', 'Horários, região, atendimento e disponibilidade da operação', openAdminSections.serviceSchedule, serviceScheduleProgress)}</summary>
            <div className="admin-config-section-body">
            <p className="admin-config-section-intro">Quando e como essa operação atende, agenda ou responde por região.</p>
            <div className="admin-config-grid">
              <label className="persona-field">
                <span className="persona-label">Abertura</span>
                <input className="persona-input" type="time" value={openingStart} onChange={(event) => setOpeningStart(event.target.value)} />
              </label>
              <label className="persona-field">
                <span className="persona-label">Fechamento</span>
                <input className="persona-input" type="time" value={openingEnd} onChange={(event) => setOpeningEnd(event.target.value)} />
              </label>
              <label className="persona-field">
                <span className="persona-label">Região</span>
                <input className="persona-input" value={serviceRegion} onChange={(event) => setServiceRegion(event.target.value)} placeholder="Belo Horizonte" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Horário</span>
                <input className="persona-input" value={businessHours} onChange={(event) => setBusinessHours(event.target.value)} placeholder="18h às 23h" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Diferencial</span>
                <input className="persona-input" value={brandHighlight} onChange={(event) => setBrandHighlight(event.target.value)} placeholder="Sabor autoral e atendimento ágil" />
              </label>
              <div className="persona-field admin-checkbox-field">
                <span className="persona-label">Delivery</span>
                <div className="persona-toggle-row">
                  <button type="button" className={`persona-toggle ${deliveryAvailable === true ? 'selected' : ''}`} onClick={() => setDeliveryAvailable(true)}>
                    Sim
                  </button>
                  <button type="button" className={`persona-toggle ${deliveryAvailable === false ? 'selected' : ''}`} onClick={() => setDeliveryAvailable(false)}>
                    Não
                  </button>
                  <button type="button" className={`persona-toggle subtle ${deliveryAvailable === undefined ? 'selected' : ''}`} onClick={() => setDeliveryAvailable(undefined)}>
                    Ainda não
                  </button>
                </div>
              </div>
            </div>
            </div>
          </details>
          ) : null}

          {businessModel === 'product' ? (
          <details className="admin-config-section" open={openAdminSections.catalog} onToggle={(event) => handleAdminSectionToggle('catalog', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Catálogo', 'Produtos, imagens, preços, destaque e disponibilidade', openAdminSections.catalog, catalogProgress)}</summary>
            <div className="admin-config-section-body">
            <p className="admin-config-section-intro">Quais produtos entram no fluxo comercial e como eles aparecem na experiência pública.</p>
            <div className="admin-config-grid">
              <label className="persona-field">
                <span className="persona-label">Nome do item</span>
                <input className="persona-input" value={catalogDraft.name} onChange={(event) => handleCatalogDraftChange('name', event.target.value)} placeholder="Seleção Essencial" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Categoria</span>
                <input className="persona-input" value={catalogDraft.category} onChange={(event) => handleCatalogDraftChange('category', event.target.value)} placeholder="Seleção" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Preço</span>
                <input className="persona-input" value={catalogDraft.price} onChange={(event) => handleCatalogDraftChange('price', event.target.value)} placeholder="R$ 59,90" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Selo</span>
                <input className="persona-input" value={catalogDraft.highlight} onChange={(event) => handleCatalogDraftChange('highlight', event.target.value)} placeholder="Mais pedido" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Prioridade</span>
                <select className="persona-input" value={catalogDraft.priority} onChange={(event) => handleCatalogDraftChange('priority', event.target.value as CatalogPriority)}>
                  <option value="high">Alta</option>
                  <option value="medium">Média</option>
                  <option value="low">Baixa</option>
                </select>
              </label>
              <label className="persona-field">
                <span className="persona-label">Estoque</span>
                <input className="persona-input" type="number" min="0" value={catalogDraft.stock} onChange={(event) => handleCatalogDraftChange('stock', event.target.value)} placeholder="8" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Disponibilidade</span>
                <select className="persona-input" value={catalogDraft.availability} onChange={(event) => handleCatalogDraftChange('availability', event.target.value as CatalogAvailability)}>
                  <option value="available">Disponível</option>
                  <option value="low">Poucas unidades</option>
                  <option value="out">Esgotado</option>
                </select>
              </label>
              <div className="persona-field admin-checkbox-field">
                <span className="persona-label">Destaque</span>
                <label className="persona-inline-checkbox">
                  <input type="checkbox" checked={catalogDraft.isFeatured} onChange={(event) => handleCatalogDraftChange('isFeatured', event.target.checked)} />
                  <span>Quero empurrar esse item nas sugestões</span>
                </label>
              </div>
              <div className="persona-field admin-checkbox-field">
                <span className="persona-label">Promoção</span>
                <label className="persona-inline-checkbox">
                  <input type="checkbox" checked={catalogDraft.isPromotion} onChange={(event) => handleCatalogDraftChange('isPromotion', event.target.checked)} />
                  <span>Mostrar esse item na seção de promoções</span>
                </label>
              </div>
              <div className="persona-field admin-checkbox-field">
                <span className="persona-label">Novidade</span>
                <label className="persona-inline-checkbox">
                  <input type="checkbox" checked={catalogDraft.isNewArrival} onChange={(event) => handleCatalogDraftChange('isNewArrival', event.target.checked)} />
                  <span>Mostrar esse item na secao de novidades</span>
                </label>
              </div>
            </div>

            <label className="persona-field">
              <span className="persona-label">Descrição</span>
              <textarea
                className="persona-input persona-textarea"
                value={catalogDraft.description}
                onChange={(event) => handleCatalogDraftChange('description', event.target.value)}
                placeholder="Uma opção completa para ajudar o cliente a encontrar o melhor para ele."
                rows={3}
              />
            </label>

            <label className="persona-field">
              <span className="persona-label">Complementares</span>
              <input
                className="persona-input"
                value={catalogDraft.complements}
                onChange={(event) => handleCatalogDraftChange('complements', event.target.value)}
                placeholder="Ex: bebida, sobremesa, acessório"
              />
              <span className="persona-field-hint">Opcional. Separe por vírgulas para eu considerar combinações.</span>
            </label>

            <div className="admin-image-panel">
              <div className="admin-image-preview-shell product">
                {catalogDraft.image ? <img src={catalogDraft.image} alt={catalogDraft.name || 'Imagem do item'} className="admin-image-preview" /> : <div className="admin-image-placeholder">Imagem principal</div>}
              </div>
              <div className="persona-field admin-upload-stack">
                <label className="persona-field admin-upload-field">
                  <span className="persona-label">Imagem principal</span>
                  <input className="persona-input" type="file" accept="image/*" onChange={handleCatalogImageChange} />
                </label>
                <label className="persona-field admin-upload-field">
                  <span className="persona-label">Imagens adicionais</span>
                  <input className="persona-input" type="file" accept="image/*" multiple onChange={handleCatalogAdditionalImagesChange} />
                </label>
                {catalogDraft.images.length > 0 ? (
                  <div className="product-thumb-grid">
                    {catalogDraft.images.map((image, index) => (
                      <img key={`${image}-${index}`} src={image} alt={`Imagem adicional ${index + 1}`} className="product-thumb" />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="admin-config-actions">
              <button type="button" className="persona-submit" onClick={handleCatalogSave}>
                {editingCatalogId ? 'Atualizar item' : 'Adicionar item'}
              </button>
              {editingCatalogId ? (
                <button
                  type="button"
                  className="chat-header-button subtle"
                  onClick={() => {
                    setEditingCatalogId(null)
                    setCatalogDraft(createEmptyCatalogDraft())
                  }}
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>

            {catalogItems.length > 0 ? (
              <div className="admin-catalog-list">
                {catalogItems.map((item) => (
                  <article key={item.id} className="admin-catalog-item">
                    <div className="admin-catalog-item-copy">
                      {item.image ? <img src={item.image} alt={item.name} className="admin-catalog-thumb" /> : null}
                      <strong>{item.name}</strong>
                      <span>{item.description}</span>
                      <small>{item.availability === 'out' ? 'Esgotado' : item.availability === 'low' ? 'Poucas unidades' : 'Disponível'}</small>
                      {item.price ? <small>{item.price}</small> : null}
                    </div>
                    <div className="admin-catalog-actions">
                      <button type="button" className="chat-header-button subtle" onClick={() => handleCatalogEdit(item)}>
                        Editar
                      </button>
                      <button type="button" className="chat-header-button subtle" onClick={() => handleCatalogRemove(item.id)}>
                        Remover
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            </div>
          </details>
          ) : null}

          {businessModel === 'service' ? (
          <details className="admin-config-section" open={openAdminSections.services} onToggle={(event) => handleAdminSectionToggle('services', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Serviços', 'Ofertas, explicações e condução do próximo passo', openAdminSections.services, servicesProgress)}</summary>
            <div className="admin-config-section-body">
              <p className="admin-config-section-intro">Como a operação de serviços se apresenta, explica a oferta e conduz o próximo passo.</p>
              <HintBox
                compact
                icon="🧰"
                title="Como essa operação atende"
                description="Descreva os serviços aqui. Se a marca também agenda, a explicação da agenda aparece logo abaixo, no mesmo fluxo."
              />
              {[0, 1].map((index) => (
                <div key={`service-offer-${index}`} className="admin-config-grid admin-config-grid-span">
                  <label className="persona-field">
                    <span className="persona-label">Nome do serviço</span>
                    <input
                      className="persona-input"
                      value={serviceOffers[index]?.title ?? ''}
                      onChange={(event) => handleServiceOfferChange(index, 'title', event.target.value)}
                      placeholder="Ex.: Consultoria inicial"
                    />
                  </label>
                  <label className="persona-field">
                    <span className="persona-label">Resumo</span>
                    <input
                      className="persona-input"
                      value={serviceOffers[index]?.summary ?? ''}
                      onChange={(event) => handleServiceOfferChange(index, 'summary', event.target.value)}
                      placeholder="O que esse serviço resolve e como ele é conduzido"
                    />
                  </label>
                  <label className="persona-field">
                    <span className="persona-label">Label</span>
                    <input
                      className="persona-input"
                      value={serviceOffers[index]?.label ?? ''}
                      onChange={(event) => handleServiceOfferChange(index, 'label', event.target.value)}
                      placeholder="Em destaque"
                    />
                  </label>
                </div>
              ))}

              {businessModel === 'service' ? (
                <div className="admin-inline-subsection">
                  <HintBox
                    compact
                    icon="📅"
                    title="Agenda dentro de serviços"
                    description="Explique como o agendamento funciona sem abrir um fluxo separado."
                  />
                  <div className="admin-config-grid">
                    <label className="persona-field">
                      <span className="persona-label">Título da agenda</span>
                      <input
                        className="persona-input"
                        value={schedulingConfig.title ?? ''}
                        onChange={(event) => setSchedulingConfig((currentConfig) => ({ ...currentConfig, title: event.target.value }))}
                        placeholder="Ex.: Vamos organizar seu atendimento"
                      />
                    </label>
                    <label className="persona-field admin-config-grid-span">
                      <span className="persona-label">Descrição da agenda</span>
                      <textarea
                        className="persona-input persona-textarea"
                        value={schedulingConfig.description ?? ''}
                        onChange={(event) => setSchedulingConfig((currentConfig) => ({ ...currentConfig, description: event.target.value }))}
                        placeholder="Explique como funciona o agendamento, quais informações você precisa e como conduz o próximo passo."
                        rows={3}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          </details>
          ) : null}

          {businessModel === 'professional' ? (
          <details className="admin-config-section admin-config-section--emergency" open={openAdminSections.emergency} onToggle={(event) => handleAdminSectionToggle('emergency', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Modo de Atendimento Emergencial', 'Fluxo guiado, dossiê, upload de evidências e resposta crítica', openAdminSections.emergency, emergencyProgress)}</summary>
            <div className="admin-config-section-body">
              <p className="admin-config-section-intro">Como a Centelha conduz casos críticos com coleta, dossiê e resposta organizada.</p>
              <HintBox
                compact
                icon="🚨"
                title="Triagem guiada para casos críticos"
                description="Ative este modo para conduzir atendimentos críticos com coleta de informações e organização de dossiê."
              />
              <div className="admin-config-grid">
                <div className="persona-field admin-checkbox-field">
                  <span className="persona-label">Emergência ativa</span>
                  <div className="persona-toggle-row">
                    <button type="button" className={`persona-toggle ${emergencyMode.enabled ? 'selected' : ''}`} onClick={() => handleEmergencyModeConfigChange('enabled', true)}>
                      Ativar
                    </button>
                    <button type="button" className={`persona-toggle subtle ${!emergencyMode.enabled ? 'selected' : ''}`} onClick={() => handleEmergencyModeConfigChange('enabled', false)}>
                      Desativar
                    </button>
                  </div>
                </div>

                <div className="persona-field admin-checkbox-field">
                  <span className="persona-label">Início automático</span>
                  <div className="persona-toggle-row">
                    <button type="button" className={`persona-toggle ${emergencyMode.autoStart ? 'selected' : ''}`} onClick={() => handleEmergencyModeConfigChange('autoStart', true)}>
                      Sim
                    </button>
                    <button type="button" className={`persona-toggle subtle ${!emergencyMode.autoStart ? 'selected' : ''}`} onClick={() => handleEmergencyModeConfigChange('autoStart', false)}>
                      Não
                    </button>
                  </div>
                </div>

                <div className="persona-field admin-checkbox-field">
                  <span className="persona-label">Upload cedo no fluxo</span>
                  <div className="persona-toggle-row">
                    <button type="button" className={`persona-toggle ${emergencyMode.showUploadEarly ? 'selected' : ''}`} onClick={() => handleEmergencyModeConfigChange('showUploadEarly', true)}>
                      Mostrar cedo
                    </button>
                    <button type="button" className={`persona-toggle subtle ${!emergencyMode.showUploadEarly ? 'selected' : ''}`} onClick={() => handleEmergencyModeConfigChange('showUploadEarly', false)}>
                      Mostrar depois
                    </button>
                  </div>
                </div>
              </div>
              {emergencyMode.enabled ? (
                <div className="persona-style-grid admin-config-emergency-grid">
                  {emergencyTypeOptions.map((option) => {
                    const isSelected = emergencyType === option.value

                    return (
                      <button key={option.value} type="button" className={`persona-style-card ${isSelected ? 'selected' : ''}`} onClick={() => setEmergencyType(option.value)}>
                        <strong>
                          {option.emoji} {option.label}
                        </strong>
                        <span>{option.description}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </details>
          ) : null}

          <details className="admin-config-section" open={openAdminSections.cta} onToggle={(event) => handleAdminSectionToggle('cta', event.currentTarget.open)}>
            <summary className="admin-config-section-title">{renderAdminSectionTitle('Chamadas para ação (CTA)', 'WhatsApp, textos do botão e gatilhos de conversão', openAdminSections.cta, ctaProgress)}</summary>
            <div className="admin-config-section-body">
              <p className="admin-config-section-intro">Quando a Centelha convida o usuário a seguir para o próximo passo e como esse convite aparece.</p>
              <HintBox
                compact
                icon="📲"
                title="Conduza o próximo passo"
                description="Personalize quando e como a Centelha oferece o encaminhamento para WhatsApp durante a orientação e ao concluir o caso."
              />
              <div className="admin-config-grid">
                <div className="persona-field admin-checkbox-field">
                  <span className="persona-label">Ativar envio para WhatsApp</span>
                  <div className="persona-toggle-row">
                    <button type="button" className={`persona-toggle ${ctaConfig.whatsappEnabled ? 'selected' : ''}`} onClick={() => setCtaConfig((current) => ({ ...current, whatsappEnabled: true }))}>
                      Ativar
                    </button>
                    <button type="button" className={`persona-toggle subtle ${!ctaConfig.whatsappEnabled ? 'selected' : ''}`} onClick={() => setCtaConfig((current) => ({ ...current, whatsappEnabled: false }))}>
                      Desativar
                    </button>
                  </div>
                </div>

                <label className="persona-field">
                  <span className="persona-label">Número do WhatsApp</span>
                  <input
                    className="persona-input"
                    value={ctaConfig.whatsappNumber ?? ''}
                    onChange={(event) => setCtaConfig((current) => ({ ...current, whatsappNumber: sanitizeWhatsAppInput(event.target.value) }))}
                    placeholder="Ex: +5531999999999"
                  />
                </label>

                <label className="persona-field">
                  <span className="persona-label">Texto principal do botão</span>
                  <input
                    className="persona-input"
                    value={ctaConfig.primaryText ?? ''}
                    onChange={(event) => setCtaConfig((current) => ({ ...current, primaryText: event.target.value }))}
                    placeholder="Encaminhar para profissional"
                  />
                </label>

                <label className="persona-field">
                  <span className="persona-label">Texto secundário</span>
                  <input
                    className="persona-input"
                    value={ctaConfig.secondaryText ?? ''}
                    onChange={(event) => setCtaConfig((current) => ({ ...current, secondaryText: event.target.value }))}
                    placeholder="Leve este caso organizado para análise profissional."
                  />
                </label>

                <div className="persona-field admin-checkbox-field">
                  <span className="persona-label">Mostrar após envio de evidência</span>
                  <div className="persona-toggle-row">
                    <button type="button" className={`persona-toggle ${ctaConfig.showAfterEvidence ? 'selected' : ''}`} onClick={() => setCtaConfig((current) => ({ ...current, showAfterEvidence: true }))}>
                      Sim
                    </button>
                    <button type="button" className={`persona-toggle subtle ${!ctaConfig.showAfterEvidence ? 'selected' : ''}`} onClick={() => setCtaConfig((current) => ({ ...current, showAfterEvidence: false }))}>
                      Não
                    </button>
                  </div>
                </div>

                <div className="persona-field admin-checkbox-field">
                  <span className="persona-label">Mostrar ao concluir caso</span>
                  <div className="persona-toggle-row">
                    <button type="button" className={`persona-toggle ${ctaConfig.showOnCompletion ? 'selected' : ''}`} onClick={() => setCtaConfig((current) => ({ ...current, showOnCompletion: true }))}>
                      Sim
                    </button>
                    <button type="button" className={`persona-toggle subtle ${!ctaConfig.showOnCompletion ? 'selected' : ''}`} onClick={() => setCtaConfig((current) => ({ ...current, showOnCompletion: false }))}>
                      Não
                    </button>
                  </div>
                </div>

                <label className="persona-field admin-config-grid-span">
                  <span className="persona-label">Template da mensagem</span>
                  <textarea
                    className="persona-input persona-textarea"
                    value={ctaConfig.whatsappMessageTemplate ?? ''}
                    onChange={(event) => setCtaConfig((current) => ({ ...current, whatsappMessageTemplate: event.target.value }))}
                    placeholder={'Olá, organizei meu caso pelo BrandSoul e gostaria de encaminhar para análise.\n\nTipo de situação: {tipo}\nResumo: {resumo}\nImpacto: {impacto}\nEvidências: {evidencias}'}
                    rows={5}
                  />
                  <span className="persona-field-hint">Placeholders disponíveis: {'{tipo}'}, {'{resumo}'}, {'{impacto}'}, {'{evidencias}'}</span>
                </label>
              </div>
            </div>
          </details>

          <div className="admin-config-actions admin-config-actions--save">
            <button type="button" className="persona-submit" onClick={handleSaveBrandConfiguration}>
              Salvar configuração
            </button>
            {configStatus ? <span className="admin-config-status">{configStatus}</span> : null}
          </div>
        </section>
        ) : null}
      </section>

      <section className="chat-card">
        <header className="chat-card-header">
          <div className="chat-card-header-main">
            <div className="chat-card-title">{contextMode === 'admin' ? 'Copiloto da marca' : 'Conversa com a Centelha'}</div>
            <div className="chat-card-subtitle">
              {contextMode === 'admin'
                ? messages.length <= 1
                  ? 'Conversa, conteúdo e decisão no mesmo fluxo.'
                  : 'Memória estratégica ativa.'
                : messages.length <= 1
                  ? 'Atendimento em simulação'
                  : 'Contexto público ativo'}
            </div>
          </div>

          <div className="channel-selector-row context-mode-row admin-context-switch" role="tablist" aria-label="Selecione o modo de contexto">
            <button
              type="button"
              className={`channel-mode-button ${contextMode === 'admin' ? 'active' : ''}`}
              onClick={() => handleContextModeChange('admin')}
            >
              <strong>Operação</strong>
              <span>Conteúdo, rotina e leitura interna</span>
            </button>
            <button
              type="button"
              className={`channel-mode-button ${contextMode === 'customer' ? 'active' : ''}`}
              onClick={() => handleContextModeChange('customer')}
            >
              <strong>Atendimento</strong>
              <span>Cliente, orientação e próximo passo</span>
            </button>
          </div>

          {contextMode === 'customer' ? (
            <div className="channel-selector-panel">
              <div className="debug-insights" aria-label="Metadados de inteligência">
                <div className="debug-chip">
                  <span className="debug-label">Intenção</span>
                  <strong className="debug-value">{detectedIntent}</strong>
                </div>
                <div className="debug-chip">
                  <span className="debug-label">Comercial</span>
                  <strong className="debug-value">{commercialIntent ? 'sim' : 'não'}</strong>
                </div>
                {shouldShowBusinessProfile ? (
                  <div className="debug-chip debug-chip-wide">
                    <span className="debug-label">Perfil</span>
                    <strong className="debug-value">{formatBusinessProfile(effectiveBusinessProfile)}</strong>
                  </div>
                ) : null}
              </div>

              <div className="channel-selector-row" role="tablist" aria-label="Selecione o contexto do canal">
                {channelModeOptions.map((option) => {
                  const isActive = option.value === channelMode

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`channel-mode-button ${isActive ? 'active' : ''}`}
                      onClick={() => handleChannelModeChange(option.value)}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.detail}</span>
                    </button>
                  )
                })}
              </div>

              {isInstagramMode(contextMode, channelMode) ? (
                <div className="channel-username-wrap">
                  <label className="composer-label" htmlFor="instagramUsername">
                    Usuario do Instagram
                  </label>
                  <input
                    id="instagramUsername"
                    className="channel-username-input"
                    value={instagramUsername}
                    onChange={(event) => setInstagramUsername(event.target.value)}
                    placeholder="@usuario"
                    autoComplete="off"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="chat-session-header">
            <div className="chat-session-meta">
              <span className="chat-session-brand">{brandName}</span>
              <span className="chat-session-chip">{tone}</span>
              {contextMode === 'admin' ? (
                <>
                  <span className="chat-session-chip">{voiceStyleLabel}</span>
                  <span className="chat-session-chip">{actModeLabel}</span>
                  <span className="chat-session-chip">{businessGoalLabel}</span>
                </>
              ) : (
                <>
                  <span className="chat-session-chip">{power}</span>
                  <span className="chat-session-chip">Canal: {channelContext.channelLabel}</span>
                  <span className="chat-session-chip">Origem: {channelContext.sourceLabel}</span>
                  {channelContext.usernameLabel ? <span className="chat-session-chip">Usuario: {channelContext.usernameLabel}</span> : null}
                </>
              )}
              <span className="chat-session-memory">{memoryStatus}</span>
              {shouldShowLearningSignal ? <span className="chat-session-learning">Aprendizado recente</span> : null}
            </div>

            <div className="chat-session-actions">
              <button type="button" className="chat-header-button subtle" onClick={handleNewConversation}>
                Nova conversa
              </button>
              <button
                type="button"
                className="chat-header-button"
                onClick={() => {
                  if (isEditingCentelha) {
                    setIsEditingCentelha(false)
                    return
                  }

                  handleEditCentelha()
                }}
              >
                {isEditingCentelha ? 'Fechar edição' : 'Editar Centelha'}
              </button>
              <button type="button" className="chat-header-button" onClick={handleOpenPublicPage}>
                Ver como cliente
              </button>
              <button type="button" className="chat-header-button subtle" onClick={handleCopyPublicPageLink}>
                {linkCopyStatus || 'Compartilhar link'}
              </button>
              <button type="button" className="chat-header-button subtle" onClick={handleLogout}>
                Sair
              </button>
            </div>
          </div>
        </header>

        <section className="chat-panel">
          <ChatList
            messages={messages}
            introTagline={introTagline}
            showIntroTagline={isIntroMoment}
            enableContentBlocks={contextMode === 'admin'}
          />
        </section>

        {shouldShowSuggestions || shouldShowContentActions ? (
          <SparkSuggestions
            suggestions={shouldShowSuggestions ? suggestions : []}
            onSelect={handleSuggestionSelect}
            contentActions={shouldShowContentActions ? contentActions : []}
            onContentActionSelect={handleContentActionSelect}
            introMode={isIntroMoment}
          />
        ) : null}

        {contextMode === 'admin' ? <ContentHistoryPanel items={contentHistory} onClear={handleClearContentHistory} /> : null}

        <form className="composer composer-docked" onSubmit={sendMessage}>
          <label className="composer-label" htmlFor="message">
            {contextMode === 'admin' ? 'Fale comigo por dentro' : 'Mensagem do cliente'}
          </label>
          <div className="composer-row">
            <input
              id="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={getComposerPlaceholder(contextMode, channelMode)}
              autoComplete="off"
            />
            <button type="submit" disabled={isLoading || !message.trim()}>
              {isLoading ? 'Pensando...' : 'Enviar'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
