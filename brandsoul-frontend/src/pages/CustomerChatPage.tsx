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
import { loadBrandPersona, PERSONA_STORAGE_KEY, type BrandPersona } from '../lib/persona'
import { buildWhatsAppMessage, buildWhatsAppUrl, normalizeWhatsAppNumber } from '../lib/whatsapp'
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

interface ChannelResponseMetadata {
  detected_intent?: string
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

const USER_ID_STORAGE_KEY = 'brandsoul_user_id'
const BOOTSTRAP_LOCK_KEY = 'brandsoul_bootstrap_lock'
const BOOTSTRAP_LOCK_MAX_AGE = 8000
const BOOTSTRAP_ERROR_MESSAGE = 'Tive um ruído aqui agora. Me chama de novo que eu volto.'

function getCustomerMessageStorageKey(brandSlug?: string) {
  return brandSlug ? `brandsoul_messages:customer:web:${brandSlug}` : 'brandsoul_messages:customer:web'
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

function buildPersonaPayload(persona: BrandPersona) {
  return {
    tone: persona.tone,
    power: persona.power,
    voice_style: persona.voiceStyle,
    act_mode: persona.actMode || 'seller',
    business_goal: persona.businessGoal || 'volume',
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

export default function CustomerChatPage({ brandSlug }: { brandSlug?: string }) {
  const customerMessagesStorageKey = useMemo(() => getCustomerMessageStorageKey(brandSlug), [brandSlug])
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
  const introPulseTimeoutRef = useRef<number | null>(null)
  const hasBootstrappedRef = useRef(messages.length > 0)
  const sparkMemoryStorageKey = useMemo(
    () =>
      getSparkMemoryStorageKey({
        brandName: persona?.brandName ?? 'BrandSoul Demo',
        tone: persona?.tone ?? 'divertido',
        power: persona?.power ?? 'atração',
        contextMode: 'customer',
        channelMode: 'web',
      }),
    [persona],
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
        ...(catalogSummary.length > 0 ? { catalog_summary: catalogSummary } : {}),
        ...(locationSummary ? { location_summary: locationSummary } : {}),
        ...(pageHighlights ? { page_highlights: pageHighlights } : {}),
      })

      if (bootstrapRequestIdRef.current !== requestId) {
        return
      }

      setMessages([{ role: 'ai', content: result.data.response }])
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
  }, [messages.length, persona, publicBrandStatus])

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
        ...(catalogSummary.length > 0 ? { catalog_summary: catalogSummary } : {}),
        ...(locationSummary ? { location_summary: locationSummary } : {}),
        ...(pageHighlights ? { page_highlights: pageHighlights } : {}),
      })

      setMessages((previousMessages) => [...previousMessages, { role: 'ai', content: result.data.response }])
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
    await sendUserMessage(buildItemMessage(item))
  }

  const handleWhatsAppOpen = (item?: CatalogItem | null) => {
    const url = buildWhatsAppUrl(whatsappNumber, buildWhatsAppMessage(item))
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
      </section>

      <section className="customer-mobile-nav" aria-label="Navegação da experiência">
        <button type="button" className={`customer-mobile-toggle ${mobileSection === 'catalog' ? 'active' : ''}`} onClick={() => setMobileSection('catalog')}>
          Explorar opções
        </button>
        <button type="button" className={`customer-mobile-toggle ${mobileSection === 'chat' ? 'active' : ''}`} onClick={() => setMobileSection('chat')}>
          Falar comigo
        </button>
      </section>

      {showCarousel && persona.carouselImages ? (
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

      {showPromotions && promotionItems.length > 0 ? (
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

      {showNewArrivals && newArrivalItems.length > 0 ? (
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

      <section className={`catalog-section customer-section ${mobileSection === 'chat' ? 'mobile-collapsed' : ''}`} aria-label="Catálogo da marca">
        <div className="catalog-copy">
          <span className="catalog-kicker">Explorar opções</span>
          <h2>Escolha uma opção ou fale comigo para eu te ajudar a encontrar o melhor para você.</h2>
          <p>{buildCatalogIntro(persona)}</p>
        </div>

        <div className="catalog-grid">
          {catalogItems.map((item) => (
            <ProductCard key={item.id} item={item} onPrimaryAction={handleCatalogAction} onOpen={setSelectedItem} onWhatsAppAction={whatsappNumber ? handleWhatsAppOpen : undefined} />
          ))}
        </div>
      </section>

      <section className={`customer-chat-card customer-section ${mobileSection === 'catalog' ? 'mobile-collapsed' : ''}`}>
        <div className="customer-chat-intro">
          <span className="catalog-kicker">Falar comigo</span>
          <h2>Me chama por aqui e eu te acompanho na escolha.</h2>
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
              placeholder="Me chama aqui..."
              autoComplete="off"
            />
            <button type="submit" disabled={isLoading || !message.trim()}>
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
