import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import axios from 'axios'

import ChatList from './components/ChatList'
import ContentHistoryPanel from './components/ContentHistoryPanel'
import Spark from './components/Spark'
import SparkSuggestions, { type Suggestion } from './components/SparkSuggestions'
import type { Message } from './components/ChatMessage'
import { buildApiHeaders, buildApiUrl } from './lib/api'
import { getBusinessStatus } from './lib/businessStatus'
import { buildContentActions, type ContentAction } from './lib/contentActions'
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
  businessGoalOptions,
  loadBrandPersona,
  navigateTo,
  saveBrandPersona,
  type ActModeOption,
  type BusinessGoalOption,
  type PowerOption,
  type ToneOption,
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
    complements: '',
  }
}

function buildPublicPageUrl() {
  return `${window.location.origin}/`
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
const BOOTSTRAP_ERROR_MESSAGE = 'Tive um ruido aqui agora. Me chama de novo que eu volto.'
const BOOTSTRAP_LOCK_KEY = 'brandsoul_bootstrap_lock'
const BOOTSTRAP_LOCK_MAX_AGE = 8000
const INSTAGRAM_COMMENT_POST_ID = 'mock-post-001'
const INSTAGRAM_COMMENT_ID = 'mock-comment-001'

const channelModeOptions: Array<{ value: ChannelMode; label: string; detail: string }> = [
  { value: 'web', label: 'Web', detail: 'Site e chat direto' },
  { value: 'instagram_dm', label: 'Instagram DM', detail: 'Conversa privada' },
  { value: 'instagram_comment', label: 'Instagram Comentario', detail: 'Espaco publico' },
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
      sourceLabel: 'Comentario',
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
    return 'Me diga o que voce quer destravar na operacao, marketing ou comunicacao...'
  }

  if (channelMode === 'instagram_dm') {
    return 'Me chama na DM para eu te responder daqui...'
  }

  if (channelMode === 'instagram_comment') {
    return 'Escreva um comentario e eu respondo em publico...'
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
    return 'Voce nao esta falando com um perfil.'
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
      text: 'Agora estou fechado. Posso preparar uma mensagem para segurar interesse e puxar a proxima abertura.',
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
      text: `Posso conduzir a conversa para ${highPriorityItem.name} e abrir espaco para uma combinacao de maior valor.`,
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
      text: 'Posso criar uma mensagem curta para puxar contato e conversao sem friccao.',
    })
  }

  if (persona.businessHours?.trim()) {
    pushSuggestion({
      type: 'operation',
      text: 'Posso deixar meu horario mais claro na comunicacao de hoje.',
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
      text: 'Posso puxar uma acao curta agora para dar mais ritmo ao dia.',
    })
  }

  return suggestions.slice(0, 3)
}

function buildSuggestionPrompt(suggestion: Suggestion) {
  if (suggestion.type === 'marketing') {
    return `Me ajuda a criar um post sobre isso: ${suggestion.text}`
  }

  if (suggestion.type === 'sales') {
    return `Perfeito. Me ajuda a transformar isso em uma acao comercial: ${suggestion.text}`
  }

  return `Me ajuda a comunicar isso de forma clara para os clientes: ${suggestion.text}`
}

export default function App() {
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
  const [contextMode, setContextMode] = useState<ContextMode>(initialContextMode)
  const [channelMode, setChannelMode] = useState<ChannelMode>(initialChannelMode)
  const [instagramUsername, setInstagramUsername] = useState(loadInstagramUsername())
  const [detectedIntent, setDetectedIntent] = useState('unknown')
  const [commercialIntent, setCommercialIntent] = useState(false)
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | undefined>(undefined)
  const [messages, setMessages] = useState<Message[]>(initialSavedMessages)
  const [dismissedSuggestionTexts, setDismissedSuggestionTexts] = useState<string[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>(() => loadCatalogItems())
  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft>(createEmptyCatalogDraft())
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null)
  const [configStatus, setConfigStatus] = useState('')
  const [linkCopyStatus, setLinkCopyStatus] = useState('')
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
  const publicPageUrl = useMemo(() => buildPublicPageUrl(), [])
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
  const shouldShowLearningSignal = useMemo(() => hasMeaningfulSparkMemory(sparkMemory), [sparkMemory])

  const buildPersonaPayload = () => ({
    tone,
    power,
    voice_style: voiceStyle,
    act_mode: actMode,
    business_goal: businessGoal,
    business_description: businessDescription || undefined,
    opening_hours: openingHours,
    address: address || undefined,
    city: city || undefined,
    state: state || undefined,
    delivery_available: deliveryAvailable,
    business_hours: businessHours || undefined,
    service_region: serviceRegion || undefined,
    brand_highlight: brandHighlight || undefined,
    whatsapp: whatsapp || undefined,
    email: email || undefined,
    instagram: instagram || undefined,
    facebook: facebook || undefined,
    tiktok: tiktok || undefined,
    site: site || undefined,
    contact_info: whatsapp || email || instagram || site || undefined,
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

  useEffect(() => {
    if (!savedPersona) {
      navigateTo('/create')
      return
    }

    setBrandName(savedPersona.brandName)
    setLogo(savedPersona.logo ?? '')
    setBusinessDescription(savedPersona.businessDescription ?? '')
    setInstitutionalImage(savedPersona.institutionalImage ?? '')
    setOpeningStart(savedPersona.openingHours?.start ?? '')
    setOpeningEnd(savedPersona.openingHours?.end ?? '')
    setAddress(savedPersona.address ?? '')
    setCity(savedPersona.city ?? '')
    setState(savedPersona.state ?? '')
    setDeliveryAvailable(savedPersona.deliveryAvailable)
    setBusinessHours(savedPersona.businessHours ?? '')
    setServiceRegion(savedPersona.serviceRegion ?? '')
    setBrandHighlight(savedPersona.brandHighlight ?? '')
    setWhatsapp(savedPersona.whatsapp ?? savedPersona.contactInfo ?? '')
    setEmail(savedPersona.email ?? '')
    setInstagram(savedPersona.instagram ?? '')
    setFacebook(savedPersona.facebook ?? '')
    setTiktok(savedPersona.tiktok ?? '')
    setSite(savedPersona.site ?? '')
    setTone(savedPersona.tone)
    setPower(savedPersona.power)
    setVoiceStyle(savedPersona.voiceStyle ?? 'balanced')
    setActMode(savedPersona.actMode ?? 'seller')
    setBusinessGoal(savedPersona.businessGoal ?? 'volume')
    setCatalogItems(loadCatalogItems())

    if (!hasBootstrappedRef.current && initialSavedMessages.length === 0) {
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
  }, [initialSavedMessages.length, savedPersona])

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
    navigateTo('/create')
  }

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
      setLinkCopyStatus('Nao consegui copiar agora')
    }
  }

  const handleOpenPublicPage = () => {
    window.open(publicPageUrl, '_blank', 'noopener,noreferrer')
  }

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
      setConfigStatus('Nao consegui carregar essa imagem agora.')
    } finally {
      event.target.value = ''
    }
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
      setConfigStatus('Nao consegui carregar a logo agora.')
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
      setConfigStatus('Nao consegui carregar a imagem do produto.')
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
      setConfigStatus('Nao consegui carregar as imagens adicionais.')
    } finally {
      event.target.value = ''
    }
  }

  const handleCatalogSave = () => {
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
      complements: catalogDraft.complements
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    })

    if (!normalizedItem) {
      setConfigStatus('Preencha nome e descricao do item para salvar o catalogo.')
      return
    }

    setCatalogItems((currentItems) =>
      editingCatalogId !== null
        ? currentItems.map((item) => (item.id === editingCatalogId ? normalizedItem : item))
        : [...currentItems, normalizedItem].slice(0, 6),
    )
    setCatalogDraft(createEmptyCatalogDraft())
    setEditingCatalogId(null)
    setConfigStatus('')
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
      complements: item.complements?.join(', ') ?? '',
    })
    if (configStatus) {
      setConfigStatus('')
    }
  }

  const handleCatalogRemove = (itemId: string) => {
    setCatalogItems((currentItems) => currentItems.filter((item) => item.id !== itemId))
    if (editingCatalogId === itemId) {
      setEditingCatalogId(null)
      setCatalogDraft(createEmptyCatalogDraft())
    }
    if (configStatus) {
      setConfigStatus('')
    }
  }

  const handleSaveBrandConfiguration = () => {
    saveBrandPersona({
      brandName: brandName.trim() || 'BrandSoul Demo',
      logo: logo || undefined,
      tone,
      power,
      voiceStyle,
      actMode,
      businessGoal,
      businessDescription: businessDescription.trim() || undefined,
      institutionalImage: institutionalImage || undefined,
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
    })
    saveCatalogItems(catalogItems)
    setConfigStatus('Configuracao salva. A pagina publica ja reflete isso.')
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

  return (
    <main className={`app-shell ${contextMode === 'admin' ? 'app-shell-admin' : ''}`}>
      <section className="identity-panel">
        <div className="identity-copy">
          <div className="eyebrow">BrandSoul Interface</div>
          <h1>A Centelha responde com presenca.</h1>
          <p className="hero-copy">
            Um ponto de contato vivo para a marca: ritmo, atitude e resposta em tempo real.
          </p>
        </div>

        <div className="identity-chip-grid" aria-label="Identidade atual da marca">
          <div className="identity-chip brand">
            <span className="identity-chip-label">Marca</span>
            <strong>{brandName}</strong>
          </div>
          <div className="identity-chip">
            <span className="identity-chip-label">Tone</span>
            <strong>{tone}</strong>
          </div>
          <div className="identity-chip">
            <span className="identity-chip-label">Power</span>
            <strong>{power}</strong>
          </div>
        </div>

        {businessDescription.trim() ? (
          <div className="identity-context" aria-label="Atuacao da marca">
            <span className="identity-context-label">Atuacao</span>
            <p>{businessDescription.trim()}</p>
          </div>
        ) : null}

        <div className="spark-spotlight">
          <div className={`spark-stage ${isIntroPulseActive ? 'spark-intro-active' : ''}`}>
            <Spark state={sparkState} tone={tone} power={power} />
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

        <section className="admin-config-panel" aria-label="Configuracao da marca">
          <div className="admin-config-header">
            <span className="eyebrow">Configuracao viva</span>
            <h2>Presenca, contato e catalogo</h2>
            <p>Atualize os dados reais da empresa e reflita isso na pagina publica e nas respostas da Centelha.</p>
          </div>

          <details className="admin-config-section" open>
            <summary className="admin-config-section-title">Marca</summary>
            <div className="admin-config-section-body">
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
              <span className="persona-label">Atuacao</span>
              <textarea
                className="persona-input persona-textarea"
                value={businessDescription}
                onChange={(event) => setBusinessDescription(event.target.value)}
                placeholder="O que a empresa faz e como quer ser percebida."
                rows={3}
              />
            </label>

            <div className="persona-field admin-config-grid-span">
              <span className="persona-label">Como eu me comunico</span>
              <div className="persona-style-grid">
                {voiceStyleOptions.map((option) => {
                  const isSelected = voiceStyle === option.value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`persona-style-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setVoiceStyle(option.value)}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  )
                })}
              </div>
              {voiceStyle === 'irreverent' ? (
                <div className="persona-voice-warning">
                  Esse estilo usa humor e uma linguagem mais ousada. Ative apenas se isso fizer sentido para sua marca.
                </div>
              ) : null}
            </div>

            <div className="persona-field admin-config-grid-span">
              <span className="persona-label">Como eu atuo com seus clientes</span>
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
              <span className="persona-label">Objetivo do negocio agora</span>
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

          <details className="admin-config-section" open>
            <summary className="admin-config-section-title">Marca publica</summary>
            <div className="admin-config-section-body">
            <div className="admin-public-link-card">
              <div className="admin-public-link-copy">
                <span className="persona-label">Link atual</span>
                <strong>{publicPageUrl}</strong>
                <span>Esse e o link que posso abrir para clientes agora.</span>
              </div>
              <div className="admin-config-actions">
                <button type="button" className="chat-header-button subtle" onClick={handleCopyPublicPageLink}>
                  {linkCopyStatus || 'Copiar link'}
                </button>
                <button type="button" className="chat-header-button" onClick={handleOpenPublicPage}>
                  Abrir pagina em nova aba
                </button>
              </div>
            </div>
            </div>
          </details>

          <details className="admin-config-section" open>
            <summary className="admin-config-section-title">Marca e contato</summary>
            <div className="admin-config-section-body">
            <div className="admin-config-grid">
              <label className="persona-field">
                <span className="persona-label">WhatsApp da marca</span>
                <input className="persona-input" value={whatsapp} onChange={(event) => setWhatsapp(sanitizeWhatsAppInput(event.target.value))} placeholder="Ex: +5531999999999" />
                <span className="persona-field-hint">Use o numero com codigo do pais e DDD, sem espacos.</span>
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

            <div className="admin-image-panel">
              <div className="admin-image-preview-shell">
                {institutionalImage ? <img src={institutionalImage} alt={`Imagem institucional de ${brandName}`} className="admin-image-preview" /> : <div className="admin-image-placeholder">Imagem institucional</div>}
              </div>
              <label className="persona-field admin-upload-field">
                <span className="persona-label">Foto institucional</span>
                <input className="persona-input" type="file" accept="image/*" onChange={handleInstitutionalImageChange} />
              </label>
            </div>
            </div>
          </details>

          <details className="admin-config-section" open>
            <summary className="admin-config-section-title">Acoes do dia</summary>
            <div className="admin-config-section-body">
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
                <span className="persona-label">Regiao</span>
                <input className="persona-input" value={serviceRegion} onChange={(event) => setServiceRegion(event.target.value)} placeholder="Belo Horizonte" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Horario</span>
                <input className="persona-input" value={businessHours} onChange={(event) => setBusinessHours(event.target.value)} placeholder="18h as 23h" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Diferencial</span>
                <input className="persona-input" value={brandHighlight} onChange={(event) => setBrandHighlight(event.target.value)} placeholder="Sabor autoral e atendimento agil" />
              </label>
              <div className="persona-field admin-checkbox-field">
                <span className="persona-label">Delivery</span>
                <div className="persona-toggle-row">
                  <button type="button" className={`persona-toggle ${deliveryAvailable === true ? 'selected' : ''}`} onClick={() => setDeliveryAvailable(true)}>
                    Sim
                  </button>
                  <button type="button" className={`persona-toggle ${deliveryAvailable === false ? 'selected' : ''}`} onClick={() => setDeliveryAvailable(false)}>
                    Nao
                  </button>
                  <button type="button" className={`persona-toggle subtle ${deliveryAvailable === undefined ? 'selected' : ''}`} onClick={() => setDeliveryAvailable(undefined)}>
                    Ainda nao
                  </button>
                </div>
              </div>
            </div>
            </div>
          </details>

          <details className="admin-config-section" open>
            <summary className="admin-config-section-title">Localizacao</summary>
            <div className="admin-config-section-body">
            <div className="admin-config-grid">
              <label className="persona-field">
                <span className="persona-label">Endereco</span>
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
            </div>
          </details>

          <details className="admin-config-section" open>
            <summary className="admin-config-section-title">Catalogo</summary>
            <div className="admin-config-section-body">
            <div className="admin-config-grid">
              <label className="persona-field">
                <span className="persona-label">Nome do item</span>
                <input className="persona-input" value={catalogDraft.name} onChange={(event) => handleCatalogDraftChange('name', event.target.value)} placeholder="Selecao Essencial" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Categoria</span>
                <input className="persona-input" value={catalogDraft.category} onChange={(event) => handleCatalogDraftChange('category', event.target.value)} placeholder="Selecao" />
              </label>
              <label className="persona-field">
                <span className="persona-label">Preco</span>
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
                  <option value="medium">Media</option>
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
                  <option value="available">Disponivel</option>
                  <option value="low">Poucas unidades</option>
                  <option value="out">Esgotado</option>
                </select>
              </label>
              <div className="persona-field admin-checkbox-field">
                <span className="persona-label">Destaque</span>
                <label className="persona-inline-checkbox">
                  <input type="checkbox" checked={catalogDraft.isFeatured} onChange={(event) => handleCatalogDraftChange('isFeatured', event.target.checked)} />
                  <span>Quero empurrar esse item nas sugestoes</span>
                </label>
              </div>
            </div>

            <label className="persona-field">
              <span className="persona-label">Descricao</span>
              <textarea
                className="persona-input persona-textarea"
                value={catalogDraft.description}
                onChange={(event) => handleCatalogDraftChange('description', event.target.value)}
                placeholder="Uma opcao completa para ajudar o cliente a encontrar o melhor para ele."
                rows={3}
              />
            </label>

            <label className="persona-field">
              <span className="persona-label">Complementares</span>
              <input
                className="persona-input"
                value={catalogDraft.complements}
                onChange={(event) => handleCatalogDraftChange('complements', event.target.value)}
                placeholder="Ex: bebida, sobremesa, acessorio"
              />
              <span className="persona-field-hint">Opcional. Separe por virgulas para eu considerar combinacoes.</span>
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
                  Cancelar edicao
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
                      <small>{item.availability === 'out' ? 'Esgotado' : item.availability === 'low' ? 'Poucas unidades' : 'Disponivel'}</small>
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

          <div className="admin-config-actions admin-config-actions--save">
            <button type="button" className="persona-submit" onClick={handleSaveBrandConfiguration}>
              Salvar configuracao
            </button>
            {configStatus ? <span className="admin-config-status">{configStatus}</span> : null}
          </div>
        </section>
      </section>

      <section className="chat-card">
        <header className="chat-card-header">
          <div className="chat-card-header-main">
            <div className="chat-card-title">Conversa com a Centelha</div>
            <div className="chat-card-subtitle">
              {contextMode === 'admin'
                ? messages.length <= 1
                  ? 'Conversa interna da marca'
                  : 'Memoria estrategica ativa'
                : messages.length <= 1
                  ? 'Atendimento em simulacao'
                  : 'Contexto publico ativo'}
            </div>
          </div>

          <div className="channel-selector-panel">
            <div className="channel-selector-copy">
              <span className="channel-selector-label">Plano de uso</span>
              <span className="channel-selector-subtitle">
                {contextMode === 'admin'
                  ? 'A Centelha fala por dentro, como nucleo estrategico da marca.'
                  : 'A Centelha fala em publico, como voz da marca para clientes e leads.'}
              </span>
            </div>

            <div className="channel-selector-row context-mode-row" role="tablist" aria-label="Selecione o modo de contexto">
              <button
                type="button"
                className={`channel-mode-button ${contextMode === 'admin' ? 'active' : ''}`}
                onClick={() => handleContextModeChange('admin')}
              >
                <strong>Operacao / Admin</strong>
                <span>Conversa interna, sugestao e leitura de padroes</span>
              </button>
              <button
                type="button"
                className={`channel-mode-button ${contextMode === 'customer' ? 'active' : ''}`}
                onClick={() => handleContextModeChange('customer')}
              >
                <strong>Atendimento</strong>
                <span>Cliente, venda, orientacao e proximo passo</span>
              </button>
            </div>

            {contextMode === 'customer' ? (
              <>
                <div className="channel-selector-copy">
                  <span className="channel-selector-label">Simulador de canais</span>
                  <span className="channel-selector-subtitle">Teste a mesma Centelha em contextos sociais diferentes.</span>
                  <div className="debug-insights" aria-label="Metadados de inteligencia">
                    <div className="debug-chip">
                      <span className="debug-label">Intencao</span>
                      <strong className="debug-value">{detectedIntent}</strong>
                    </div>
                    <div className="debug-chip">
                      <span className="debug-label">Comercial</span>
                      <strong className="debug-value">{commercialIntent ? 'sim' : 'nao'}</strong>
                    </div>
                    {shouldShowBusinessProfile ? (
                      <div className="debug-chip debug-chip-wide">
                        <span className="debug-label">Perfil</span>
                        <strong className="debug-value">{formatBusinessProfile(effectiveBusinessProfile)}</strong>
                      </div>
                    ) : null}
                  </div>
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

                <div className="interaction-entry-panel">
                  <div className="interaction-entry-copy">
                    <span className="channel-selector-label">Centelha ↔ Centelha</span>
                    <span className="channel-selector-subtitle">
                      A simulacao entre marcas agora vive em uma pagina propria, mais organizada e com palco dedicado.
                    </span>
                  </div>
                  <button type="button" className="chat-header-button interaction-entry-button" onClick={handleOpenInteractionPage}>
                    Abrir pagina dedicada
                  </button>
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
              </>
            ) : (
              <div className="admin-mode-panel">
                <span className="channel-selector-label">Conversa interna</span>
                <span className="channel-selector-subtitle">
                  Use este modo para operar a marca por dentro: marketing, conteudo, rotina, leitura de sinais e decisao.
                </span>
                <div className="debug-insights" aria-label="Leitura interna da Centelha">
                  <div className="debug-chip">
                    <span className="debug-label">Memoria</span>
                    <strong className="debug-value">{shouldShowLearningSignal ? 'ativa' : 'inicial'}</strong>
                  </div>
                  <div className="debug-chip">
                    <span className="debug-label">Foco</span>
                    <strong className="debug-value">estrategia</strong>
                  </div>
                  {shouldShowBusinessProfile ? (
                    <div className="debug-chip debug-chip-wide">
                      <span className="debug-label">Perfil</span>
                      <strong className="debug-value">{formatBusinessProfile(effectiveBusinessProfile)}</strong>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="chat-session-header">
            <div className="chat-session-meta">
              <span className="chat-session-brand">{brandName}</span>
              <span className="chat-session-chip">{contextMode === 'admin' ? 'Admin' : 'Atendimento'}</span>
              <span className="chat-session-chip">{tone}</span>
              <span className="chat-session-chip">{power}</span>
              <span className="chat-session-chip">Canal: {channelContext.channelLabel}</span>
              <span className="chat-session-chip">Origem: {channelContext.sourceLabel}</span>
              {channelContext.usernameLabel ? <span className="chat-session-chip">Usuario: {channelContext.usernameLabel}</span> : null}
              <span className="chat-session-memory">{memoryStatus}</span>
              {shouldShowLearningSignal ? <span className="chat-session-learning">Aprendizado recente</span> : null}
            </div>

            <div className="chat-session-actions">
              <button type="button" className="chat-header-button subtle" onClick={handleNewConversation}>
                Nova conversa
              </button>
              <button type="button" className="chat-header-button" onClick={handleEditCentelha}>
                Editar Centelha
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
