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
import { loadBrandPersona, PERSONA_STORAGE_KEY, type BrandFeatures, type BrandPersona, type BusinessModelOption, type SparkModes } from '../lib/persona'
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
import '../App.css'

type SparkState = 'idle' | 'thinking' | 'speaking'
type CustomerMode = 'sales' | 'service' | 'scheduling' | 'emergency'

interface ChannelResponseMetadata {
  detected_intent?: string
  flow_closed?: boolean
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

const USER_ID_STORAGE_KEY = 'brandsoul_user_id'
const BOOTSTRAP_LOCK_KEY = 'brandsoul_bootstrap_lock'
const BOOTSTRAP_LOCK_MAX_AGE = 8000
const BOOTSTRAP_ERROR_MESSAGE = 'Tive um ruído aqui agora. Me chama de novo que eu volto.'

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
  const userId = useMemo(() => getOrCreateUserId(), [])
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
  const introPulseTimeoutRef = useRef<number | null>(null)
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
  const whatsappNumber = useMemo(() => normalizeWhatsAppNumber(persona?.whatsapp ?? persona?.contactInfo), [persona])
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
  const guidanceNeedsConsent = isProfessionalGuidanceMode && guidanceConsentState === 'pending'
  const showProductsSection = activeFeatures.products && !isProfessionalBrand && !isEmergencyMode
  const showServicesSection = activeFeatures.services && !isProfessionalBrand && !isEmergencyMode
  const hasDiscoverySection = showProductsSection || showServicesSection
  const serviceOffers = useMemo(
    () => (persona?.serviceOffers ?? []).filter((item) => item.title.trim() || item.summary.trim() || (item.label ?? '').trim()),
    [persona?.serviceOffers],
  )
  const showProfessionalSections = Boolean(persona && isProfessionalBrand && hasProfessionalContent(persona))

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
      return
    }

    setGuidanceConsentState('declined')
    setIsGuidanceFlowClosed(false)
    setCaseSummary(null)
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
        const publicBrand = await fetchPublicBrand(brandSlug)
        if (!isMounted) {
          return
        }

        setPersona(publicBrand.spark)
        setCatalogItems(publicBrand.catalog)
        setActiveMode(getDefaultMode(publicBrand.spark))
        setPublicBrandStatus('ready')
      } catch (error) {
        if (!isMounted) {
          return
        }

        console.error(error)
        setPersona(null)
        setCatalogItems([])
        setPublicBrandStatus('not-found')
      }
    }

    void loadPublicBrand()

    return () => {
      isMounted = false
    }
  }, [brandSlug])

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

  const startConversation = async (force = false) => {
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

    setIsLoading(true)
    setSparkState('idle')

    const nextSparkMemory = recordInteractionWindow(incrementConversationCount(loadSparkMemory(sparkMemoryStorageKey)))
    saveSparkMemory(sparkMemoryStorageKey, nextSparkMemory)
    setSparkMemory(nextSparkMemory)

    try {
      const result = await axios.post<ChannelMessageResponse>(buildApiUrl('/channel/message'), {
        channel: 'web',
        user_id: userId,
        brand_name: persona.brandName,
        ...(brandSlug ? { tenant_slug: brandSlug } : {}),
        mode: activeMode,
        guidance_consent: guidanceConsentState === 'accepted',
        message: '',
        persona: buildPersonaPayload(persona),
        messages: [],
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
  }, [guidanceConsentState, isProfessionalGuidanceMode, messages.length, persona, publicBrandStatus])

  useEffect(() => {
    if (messages.length > 0) {
      window.localStorage.setItem(customerMessagesStorageKey, JSON.stringify(messages))
      return
    }

    window.localStorage.removeItem(customerMessagesStorageKey)
  }, [customerMessagesStorageKey, messages])

  const sendUserMessage = async (rawMessage: string) => {
    if (!persona) {
      return
    }

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

  const handleSummaryForward = () => {
    if (!caseSummary || !whatsappNumber) {
      return
    }

    const url = buildWhatsAppUrl(whatsappNumber, formatSummaryForWhatsApp(caseSummary))
    if (!url) {
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
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

      {isProfessionalGuidanceMode ? (
        <section className="customer-highlight-section" aria-label="Consentimento para orientação inicial">
          <div className="customer-section-heading">
            <span className="catalog-kicker">Modo de orientação</span>
            <h2>Você deseja receber uma orientação inicial baseada em diretrizes profissionais?</h2>
          </div>
          <div className="professional-grid">
            <article className="professional-card">
              <span className="professional-label">Antes de iniciar</span>
              <p>
                {guidanceConsentState === 'accepted'
                  ? 'Orientação inicial ativada. Vou te conduzir com clareza, calma e limite profissional.'
                  : guidanceConsentState === 'declined'
                    ? 'Você optou por seguir sem orientação inicial. A conversa continua em modo profissional informativo.'
                    : 'Essa orientação tem caráter informativo e não substitui a análise completa de um profissional.'}
              </p>
              <div className="persona-toggle-row">
                <button
                  type="button"
                  className={`persona-toggle ${guidanceConsentState === 'accepted' ? 'selected' : ''}`}
                  onClick={() => {
                    setGuidanceConsentState('accepted')
                    if (messages.length === 0) {
                      hasBootstrappedRef.current = true
                      void startConversation(true)
                    }
                  }}
                >
                  Aceitar orientação
                </button>
                <button type="button" className={`persona-toggle subtle ${guidanceConsentState === 'declined' ? 'selected' : ''}`} onClick={() => setGuidanceConsentState('declined')}>
                  Continuar sem orientação
                </button>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {caseSummary ? (
        <section className="customer-highlight-section" aria-label="Resumo do seu caso">
          <div className="customer-section-heading">
            <span className="catalog-kicker">Resumo do seu caso</span>
            <h2>Organizei um dossiê simples para facilitar o próximo passo.</h2>
          </div>
          <div className="professional-grid">
            <article className="professional-card">
              <span className="professional-label">Situação identificada</span>
              <strong>{caseSummary.tipo || 'Orientação inicial'}</strong>
            </article>
            <article className="professional-card">
              <span className="professional-label">Informações coletadas</span>
              {(caseSummary.dados ?? []).length > 0 ? (
                <ul className="customer-summary-list">
                  {(caseSummary.dados ?? []).map((item, index) => (
                    <li key={`dados-${index}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Ainda não organizei pontos suficientes para esse resumo.</p>
              )}
            </article>
            <article className="professional-card">
              <span className="professional-label">Evidências registradas</span>
              {(caseSummary.evidencias ?? []).length > 0 ? (
                <ul className="customer-summary-list">
                  {(caseSummary.evidencias ?? []).map((item, index) => (
                    <li key={`evidencias-${index}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma evidência foi citada até aqui.</p>
              )}
            </article>
            <article className="professional-card">
              <span className="professional-label">Próximos passos sugeridos</span>
              {(caseSummary.passos ?? []).length > 0 ? (
                <ul className="customer-summary-list">
                  {(caseSummary.passos ?? []).map((item, index) => (
                    <li key={`passos-${index}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>O próximo passo principal é levar esse contexto para análise profissional.</p>
              )}
            </article>
          </div>
          <div className="persona-toggle-row">
            <button type="button" className="persona-toggle selected" onClick={handleSummaryForward} disabled={!whatsappNumber}>
              Encaminhar para profissional
            </button>
            <button type="button" className="persona-toggle subtle" disabled>
              Baixar resumo
            </button>
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

      {showProfessionalSections ? (
        <>
          <section className="customer-highlight-section" aria-label="Perfil profissional">
            <div className="customer-section-heading">
              <span className="catalog-kicker">Perfil profissional</span>
              <h2>{persona.professionalData?.presentation || 'Atuação técnica com presença clara e responsável.'}</h2>
            </div>
            <div className="professional-grid">
              {(persona.professionalData?.practiceAreas ?? []).slice(0, 5).map((area) => (
                <div key={area} className="professional-card professional-card--chip">
                  <span className="professional-label">Em destaque</span>
                  <strong>{area}</strong>
                </div>
              ))}
              {(persona.professionalData?.differentials ?? []).slice(0, 3).map((differential) => (
                <div key={differential} className="professional-card">
                  <span className="professional-label">Mais ativo</span>
                  <p>{differential}</p>
                </div>
              ))}
            </div>
          </section>

          {professionalOperationMode === 'authority' && (persona.professionalData?.cases?.length ?? 0) > 0 ? (
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

          {professionalOperationMode === 'authority' && (persona.professionalData?.contents?.length ?? 0) > 0 ? (
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

      {activeFeatures.scheduling && !isProfessionalBrand && !isEmergencyMode ? (
      <section className={`customer-highlight-section customer-section ${mobileSection === 'chat' ? 'mobile-collapsed' : ''}`} aria-label="Agendamento">
        <div className="catalog-copy">
          <span className="catalog-kicker">Agenda</span>
          <h2>{persona.schedulingConfig?.title || 'Se quiser, eu também posso conduzir o agendamento.'}</h2>
          <p>{persona.schedulingConfig?.description || 'Me chama no chat para eu coletar o contexto, entender disponibilidade e te guiar até o próximo passo.'}</p>
        </div>
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

      <section className={`customer-chat-card customer-section ${mobileSection === 'catalog' && !isEmergencyMode && hasDiscoverySection ? 'mobile-collapsed' : ''}`}>
        <div className="customer-chat-intro">
          <span className="catalog-kicker">{buildModeHeadline(activeMode)}</span>
          <h2>{buildModeSubtext(activeMode)}</h2>
          {isProfessionalGuidanceMode && guidanceConsentState === 'accepted' && messages.length > 0 ? (
            <p className="brand-subtext">
              {isGuidanceFlowClosed
                ? 'Fluxo inicial concluído. Agora você pode encaminhar o resumo ou seguir a conversa em modo normal.'
                : 'Estou te guiando com base em diretrizes profissionais para te ajudar neste momento.'}
            </p>
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

      <footer className="brandsoul-signature" aria-label="Assinatura do BrandSoul">
        <img src={brandsoulLogo} alt="BrandSoul" className="brandsoul-footer-mark" />
        <span>Powered by BrandSoul</span>
      </footer>

      <ProductModal item={selectedItem} onClose={() => setSelectedItem(null)} onPrimaryAction={handleCatalogAction} onWhatsAppAction={whatsappNumber ? handleWhatsAppOpen : undefined} />
    </main>
  )
}
