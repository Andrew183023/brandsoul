import { normalizeWhatsAppNumber } from './whatsapp'

export type ToneOption = 'divertido' | 'inteligente' | 'sério' | 'ousado'

export type PowerOption = 'atração' | 'clareza' | 'velocidade' | 'conexão'
export type VoiceStyleOption = 'soft' | 'strong' | 'balanced' | 'adaptive' | 'irreverent'
export type ActModeOption = 'seller' | 'consultant' | 'stylist' | 'coach' | 'chef'
export type BusinessGoalOption = 'volume' | 'ticket' | 'rotation' | 'launch'
export type SparkModeOption = 'sales' | 'service' | 'scheduling' | 'emergency'
export type EmergencyTypeOption = 'legal' | 'health' | 'technical'
export type BrandTypeOption = 'business' | 'professional'
export type BusinessModelOption = 'product' | 'service' | 'professional'
export type ProfessionalOperationMode = 'institutional' | 'authority' | 'guidance'
export type ProfessionalGuidancePlaybookKey = 'acidente_transito' | 'consumidor'

export interface OpeningHours {
  start: string
  end: string
}

export interface BrandTheme {
  primaryColor?: string
  secondaryColor?: string
}

export interface PageSectionsConfig {
  showCarousel?: boolean
  showPromotions?: boolean
  showNewArrivals?: boolean
}

export interface SparkModes {
  sales: boolean
  service: boolean
  scheduling: boolean
  emergency: boolean
}

export interface EmergencyModeConfig {
  enabled: boolean
  autoStart: boolean
  showUploadEarly: boolean
}

export interface CtaConfig {
  whatsappEnabled: boolean
  whatsappNumber?: string
  whatsappMessageTemplate?: string
  showAfterEvidence: boolean
  showOnCompletion: boolean
  primaryText?: string
  secondaryText?: string
}

export interface BrandFeatures {
  products: boolean
  services: boolean
  scheduling: boolean
  emergency: boolean
}

export interface ServiceOffer {
  title: string
  summary: string
  label?: string
}

export interface WeeklyAvailabilityDayConfig {
  enabled: boolean
  start?: string
  end?: string
}

export interface WeeklyAvailabilityConfig {
  monday?: WeeklyAvailabilityDayConfig
  tuesday?: WeeklyAvailabilityDayConfig
  wednesday?: WeeklyAvailabilityDayConfig
  thursday?: WeeklyAvailabilityDayConfig
  friday?: WeeklyAvailabilityDayConfig
  saturday?: WeeklyAvailabilityDayConfig
  sunday?: WeeklyAvailabilityDayConfig
}

export interface AttendanceModesConfig {
  presencial: boolean
  online: boolean
  domicilio: boolean
}

export interface SchedulingConfig {
  enabled?: boolean
  title?: string
  description?: string
  serviceOptions?: string[]
  durationMinutes?: number
  availableDays?: string[]
  availableHours?: string[]
  weeklyAvailability?: WeeklyAvailabilityConfig
  blockedDates?: string[]
  blockedSlots?: string[]
  slotIntervalMinutes?: number
  attendanceMode?: 'presencial' | 'online' | 'domicilio'
  attendanceModes?: AttendanceModesConfig
  whatsappNotificationEnabled?: boolean
  whatsappNumber?: string
  whatsappMessageTemplate?: string
  manualConfirmation?: boolean
}

export interface ProfessionalCase {
  caseType: string
  context: string
  approach: string
  learning?: string
}

export interface ProfessionalContent {
  title: string
  summary: string
  stance?: string
}

export interface ProfessionalIdentity {
  headline?: string
  principles?: string[]
}

export interface ProfessionalGuidanceConfig {
  situationType?: string
  initialResponse?: string
  initialQuestions?: string[]
  actionChecklist?: string[]
  dataCollection?: string[]
  orientationLimits?: string
  communicationTone?: string
  closingMessage?: string
  playbooks?: Partial<Record<ProfessionalGuidancePlaybookKey, ProfessionalGuidancePlaybook>>
}

export interface ProfessionalGuidancePlaybook {
  situationType: ProfessionalGuidancePlaybookKey
  initialResponse: string
  initialQuestions: string[]
  actionChecklist: string[]
  dataCollection: string[]
  orientationLimits: string
  closingMessage: string
}

export interface ProfessionalPageData {
  operationMode?: ProfessionalOperationMode
  presentation?: string
  practiceAreas?: string[]
  differentials?: string[]
  cases?: ProfessionalCase[]
  contents?: ProfessionalContent[]
  identity?: ProfessionalIdentity
  guidance?: ProfessionalGuidanceConfig
}

export interface BrandPersona {
  brandName: string
  logo?: string
  tone: ToneOption
  power: PowerOption
  businessModel?: BusinessModelOption
  brandType?: BrandTypeOption
  features?: BrandFeatures
  voiceStyle: VoiceStyleOption
  actMode?: ActModeOption
  businessGoal?: BusinessGoalOption
  modes?: SparkModes
  emergencyType?: EmergencyTypeOption
  emergencyMode?: EmergencyModeConfig
  ctaConfig?: CtaConfig
  businessDescription?: string
  institutionalImage?: string
  theme?: BrandTheme
  pageSections?: PageSectionsConfig
  carouselImages?: string[]
  openingHours?: OpeningHours
  address?: string
  city?: string
  state?: string
  deliveryAvailable?: boolean
  businessHours?: string
  serviceRegion?: string
  brandHighlight?: string
  whatsapp?: string
  email?: string
  instagram?: string
  facebook?: string
  tiktok?: string
  site?: string
  contactInfo?: string
  serviceOffers?: ServiceOffer[]
  schedulingConfig?: SchedulingConfig
  professionalData?: ProfessionalPageData
}

export const PERSONA_STORAGE_KEY = 'brandsoul.persona'
export const BUSINESS_DESCRIPTION_MAX_LENGTH = 140
export const BRAND_KNOWLEDGE_MAX_LENGTH = 140

export const toneOptions: Array<{ value: ToneOption; label: string; emoji: string }> = [
  { value: 'divertido', label: 'Divertido', emoji: '😏' },
  { value: 'inteligente', label: 'Inteligente', emoji: '🧠' },
  { value: 'sério', label: 'Sério', emoji: '💼' },
  { value: 'ousado', label: 'Ousado', emoji: '⚡' },
]

export const powerOptions: Array<{ value: PowerOption; label: string; emoji: string }> = [
  { value: 'atração', label: 'Atração', emoji: '🔥' },
  { value: 'clareza', label: 'Clareza', emoji: '🧠' },
  { value: 'velocidade', label: 'Velocidade', emoji: '⚡' },
  { value: 'conexão', label: 'Conexão', emoji: '🤝' },
]

export const voiceStyleOptions: Array<{ value: VoiceStyleOption; label: string; description: string }> = [
  { value: 'soft', label: 'Soft', description: 'Sou mais sereno e delicado' },
  { value: 'strong', label: 'Forte', description: 'Sou mais direto e confiante' },
  { value: 'balanced', label: 'Equilibrado', description: 'Sou claro e equilibrado' },
  { value: 'adaptive', label: 'Adaptativo', description: 'Me ajusto conforme a conversa' },
  { value: 'irreverent', label: 'Irreverente', description: 'Sou leve, faço humor e não sou tão formal' },
]

export const actModeOptions: Array<{ value: ActModeOption; label: string; emoji: string; description: string }> = [
  { value: 'seller', label: 'Vendedor especialista', emoji: '💰', description: 'Destaco benefícios e ajudo na decisão' },
  { value: 'consultant', label: 'Consultor', emoji: '💬', description: 'Explico opções com clareza e segurança' },
  { value: 'stylist', label: 'Estilista', emoji: '👕', description: 'Sugiro combinações, ocasiões e estilo' },
  { value: 'coach', label: 'Coach', emoji: '🧠', description: 'Incentivo ação com energia positiva' },
  { value: 'chef', label: 'Chef', emoji: '🍳', description: 'Recomendo sabores, experiência e sensação' },
]

export const businessGoalOptions: Array<{ value: BusinessGoalOption; label: string; emoji: string; description: string }> = [
  { value: 'volume', label: 'Vender mais volume', emoji: '📦', description: 'Prioriza itens fáceis de girar e vender mais vezes' },
  { value: 'ticket', label: 'Aumentar ticket médio', emoji: '💰', description: 'Puxa combinações e escolhas de maior valor' },
  { value: 'rotation', label: 'Girar estoque', emoji: '🔄', description: 'Ajuda a dar saída ao que precisa circular' },
  { value: 'launch', label: 'Destacar novidades', emoji: '🚀', description: 'Coloca foco no que acabou de chegar ou merece holofote' },
]

export const emergencyTypeOptions: Array<{ value: EmergencyTypeOption; label: string; emoji: string; description: string }> = [
  { value: 'legal', label: 'Jurídico', emoji: '⚖️', description: 'Para ocorrências que pedem relato, provas e contexto formal.' },
  { value: 'health', label: 'Saúde', emoji: '🩺', description: 'Para triagem inicial, urgência e orientação com cuidado.' },
  { value: 'technical', label: 'Técnico', emoji: '🛠️', description: 'Para falhas, incidentes e coleta de dados do problema.' },
]

export const brandTypeOptions: Array<{ value: BrandTypeOption; label: string; emoji: string; description: string }> = [
  { value: 'business', label: 'Empresa', emoji: '🏪', description: 'Página comercial com foco em marca, catálogo e conversa.' },
  { value: 'professional', label: 'Profissional', emoji: '⚖️', description: 'Página de autoridade com conteúdo, atuação e ajuda inicial.' },
]

export const businessModelOptions: Array<{ value: BusinessModelOption; label: string; emoji: string; description: string }> = [
  { value: 'product', label: 'Produtos', emoji: '🛍️', description: 'Catálogo, destaques e conversa comercial orientada a escolha.' },
  { value: 'service', label: 'Serviços', emoji: '🧰', description: 'Serviços, agenda e condução por contexto e atendimento.' },
  { value: 'professional', label: 'Profissional', emoji: '⚖️', description: 'Autoridade, conteúdo, emergência e orientação inicial.' },
]

export const professionalOperationModeOptions: Array<{ value: ProfessionalOperationMode; label: string; emoji: string; description: string }> = [
  { value: 'institutional', label: 'Presença institucional', emoji: '🏛️', description: 'Apresenta atuação, perfil e credibilidade com sobriedade.' },
  { value: 'authority', label: 'Conteúdo e autoridade', emoji: '📚', description: 'Destaca posicionamento, conteúdo e leitura técnica do profissional.' },
  { value: 'guidance', label: 'Modo de orientação', emoji: '🧭', description: 'Conduz orientação inicial por diretrizes profissionais, sem substituir a análise completa.' },
]

export const professionalGuidancePlaybooks: Record<ProfessionalGuidancePlaybookKey, ProfessionalGuidancePlaybook> = {
  acidente_transito: {
    situationType: 'acidente_transito',
    initialResponse: 'Vamos com calma. Vou te orientar nos primeiros passos importantes.',
    initialQuestions: ['Você está seguro neste momento?', 'Alguém se feriu?', 'O acidente aconteceu agora ou já faz algum tempo?'],
    actionChecklist: [
      'Verificar segurança do local',
      'Acionar emergência se necessário',
      'Fotografar veículos (frente, traseira, lateral)',
      'Registrar placa dos veículos',
      'Gravar breve vídeo do local',
      'Coletar dados dos envolvidos',
    ],
    dataCollection: ['Localização', 'Data e hora', 'Fotos', 'Vídeos', 'Nome dos envolvidos (se possível)'],
    orientationLimits: 'Não avaliar culpa, não afirmar responsabilidade e não orientar acordo definitivo.',
    closingMessage: 'Com essas informações organizadas, um profissional poderá analisar melhor seu caso.',
  },
  consumidor: {
    situationType: 'consumidor',
    initialResponse: 'Entendi. Vou te ajudar a organizar essa situação.',
    initialQuestions: ['Qual foi o problema principal?', 'Você chegou a entrar em contato com a empresa?', 'Tem comprovantes ou registros?'],
    actionChecklist: ['Guardar comprovantes', 'Registrar prints/conversas', 'Anotar datas e valores', 'Evitar decisões precipitadas'],
    dataCollection: ['Nota fiscal', 'Prints', 'Histórico da conversa', 'Data da compra'],
    orientationLimits: 'Não garantir indenização e não afirmar ganho de causa.',
    closingMessage: 'Com essas informações, um profissional poderá te orientar de forma mais completa.',
  },
}

export function loadBrandPersona(): BrandPersona | null {
  const rawPersona = window.localStorage.getItem(PERSONA_STORAGE_KEY)
  if (!rawPersona) {
    return null
  }

  try {
    const parsedPersona = JSON.parse(rawPersona) as Partial<BrandPersona>
    if (!parsedPersona.brandName || !parsedPersona.tone || !parsedPersona.power) {
      return null
    }

    const normalizedTone = normalizeTone(parsedPersona.tone)
    const normalizedPower = normalizePower(parsedPersona.power)

    if (!normalizedTone || !normalizedPower) {
      return null
    }

    return {
      brandName: parsedPersona.brandName,
      logo: normalizeImageField(parsedPersona.logo),
      tone: normalizedTone,
      power: normalizedPower,
      businessModel: normalizeBusinessModel(parsedPersona.businessModel, parsedPersona.brandType) ?? 'product',
      brandType: normalizeBrandType(parsedPersona.brandType) ?? 'business',
      features: normalizeFeatures(parsedPersona.features, parsedPersona.businessModel, parsedPersona.brandType),
      voiceStyle: normalizeVoiceStyle(parsedPersona.voiceStyle) ?? 'balanced',
      actMode: normalizeActMode(parsedPersona.actMode) ?? 'seller',
      businessGoal: normalizeBusinessGoal(parsedPersona.businessGoal) ?? 'volume',
      modes: normalizeModes(parsedPersona.modes),
      emergencyType: normalizeEmergencyType(parsedPersona.emergencyType),
      emergencyMode: normalizeEmergencyMode(parsedPersona.emergencyMode),
      ctaConfig: normalizeCtaConfig(parsedPersona.ctaConfig),
      businessDescription: normalizeBusinessDescription(parsedPersona.businessDescription),
      institutionalImage: normalizeImageField(parsedPersona.institutionalImage),
      theme: normalizeTheme(parsedPersona.theme),
      pageSections: normalizePageSections(parsedPersona.pageSections),
      carouselImages: normalizeImageList(parsedPersona.carouselImages),
      openingHours: normalizeOpeningHours(parsedPersona.openingHours),
      address: normalizeBrandKnowledgeField(parsedPersona.address),
      city: normalizeBrandKnowledgeField(parsedPersona.city),
      state: normalizeBrandKnowledgeField(parsedPersona.state),
      deliveryAvailable: normalizeDeliveryAvailable(parsedPersona.deliveryAvailable),
      businessHours: normalizeBrandKnowledgeField(parsedPersona.businessHours),
      serviceRegion: normalizeBrandKnowledgeField(parsedPersona.serviceRegion),
      brandHighlight: normalizeBrandKnowledgeField(parsedPersona.brandHighlight),
      whatsapp: normalizeWhatsAppNumber(parsedPersona.whatsapp) ?? normalizeLegacyWhatsApp(parsedPersona.contactInfo),
      email: normalizeBrandKnowledgeField(parsedPersona.email),
      instagram: normalizeBrandKnowledgeField(parsedPersona.instagram),
      facebook: normalizeBrandKnowledgeField(parsedPersona.facebook),
      tiktok: normalizeBrandKnowledgeField(parsedPersona.tiktok),
      site: normalizeBrandKnowledgeField(parsedPersona.site),
      contactInfo: normalizeBrandKnowledgeField(parsedPersona.contactInfo),
      serviceOffers: normalizeServiceOffers(parsedPersona.serviceOffers),
      schedulingConfig: normalizeSchedulingConfig(parsedPersona.schedulingConfig),
      professionalData: normalizeProfessionalData(parsedPersona.professionalData),
    }
  } catch {
    return null
  }
}

export function saveBrandPersona(persona: BrandPersona) {
  const normalizedWhatsapp = normalizeWhatsAppNumber(persona.whatsapp)
  window.localStorage.setItem(
    PERSONA_STORAGE_KEY,
    JSON.stringify({
      ...persona,
      logo: normalizeImageField(persona.logo),
      businessModel: normalizeBusinessModel(persona.businessModel, persona.brandType) ?? 'product',
      brandType: normalizeBrandType(persona.brandType) ?? 'business',
      features: normalizeFeatures(persona.features, persona.businessModel, persona.brandType),
      voiceStyle: normalizeVoiceStyle(persona.voiceStyle) ?? 'balanced',
      actMode: normalizeActMode(persona.actMode) ?? 'seller',
      businessGoal: normalizeBusinessGoal(persona.businessGoal) ?? 'volume',
      modes: normalizeModes(persona.modes),
      emergencyType: normalizeEmergencyType(persona.emergencyType),
      emergencyMode: normalizeEmergencyMode(persona.emergencyMode),
      ctaConfig: normalizeCtaConfig(persona.ctaConfig),
      businessDescription: normalizeBusinessDescription(persona.businessDescription),
      institutionalImage: normalizeImageField(persona.institutionalImage),
      theme: normalizeTheme(persona.theme),
      pageSections: normalizePageSections(persona.pageSections),
      carouselImages: normalizeImageList(persona.carouselImages),
      openingHours: normalizeOpeningHours(persona.openingHours),
      address: normalizeBrandKnowledgeField(persona.address),
      city: normalizeBrandKnowledgeField(persona.city),
      state: normalizeBrandKnowledgeField(persona.state),
      deliveryAvailable: normalizeDeliveryAvailable(persona.deliveryAvailable),
      businessHours: normalizeBrandKnowledgeField(persona.businessHours),
      serviceRegion: normalizeBrandKnowledgeField(persona.serviceRegion),
      brandHighlight: normalizeBrandKnowledgeField(persona.brandHighlight),
      whatsapp: normalizedWhatsapp,
      email: normalizeBrandKnowledgeField(persona.email),
      instagram: normalizeBrandKnowledgeField(persona.instagram),
      facebook: normalizeBrandKnowledgeField(persona.facebook),
      tiktok: normalizeBrandKnowledgeField(persona.tiktok),
      site: normalizeBrandKnowledgeField(persona.site),
      contactInfo: normalizedWhatsapp ?? normalizeBrandKnowledgeField(persona.contactInfo),
      serviceOffers: normalizeServiceOffers(persona.serviceOffers),
      schedulingConfig: normalizeSchedulingConfig(persona.schedulingConfig),
      professionalData: normalizeProfessionalData(persona.professionalData),
    }),
  )
}

function normalizeTone(value: string): ToneOption | null {
  switch (value) {
    case 'divertida':
    case 'divertido':
      return 'divertido'
    case 'inteligente':
      return 'inteligente'
    case 'séria':
    case 'sério':
      return 'sério'
    case 'ousada':
    case 'ousado':
      return 'ousado'
    default:
      return null
  }
}

function normalizePower(value: string): PowerOption | null {
  switch (value) {
    case 'atração':
      return 'atração'
    case 'clareza':
      return 'clareza'
    case 'velocidade':
      return 'velocidade'
    case 'conexão':
      return 'conexão'
    default:
      return null
  }
}

export function navigateTo(pathname: string) {
  window.history.pushState({}, '', pathname)
  window.dispatchEvent(new Event('popstate'))
}

function normalizeBusinessDescription(value?: string): string | undefined {
  const normalizedValue = value?.trim().slice(0, BUSINESS_DESCRIPTION_MAX_LENGTH)
  return normalizedValue ? normalizedValue : undefined
}

function normalizeBrandKnowledgeField(value?: string): string | undefined {
  const normalizedValue = value?.trim().slice(0, BRAND_KNOWLEDGE_MAX_LENGTH)
  return normalizedValue ? normalizedValue : undefined
}

function normalizeDeliveryAvailable(value?: boolean): boolean | undefined {
  if (typeof value !== 'boolean') {
    return undefined
  }

  return value
}

function normalizeTheme(theme?: BrandTheme): BrandTheme | undefined {
  if (!theme) {
    return undefined
  }

  const primaryColor = normalizeColor(theme.primaryColor)
  const secondaryColor = normalizeColor(theme.secondaryColor)

  if (!primaryColor && !secondaryColor) {
    return undefined
  }

  return {
    primaryColor,
    secondaryColor,
  }
}

function normalizePageSections(pageSections?: PageSectionsConfig): PageSectionsConfig | undefined {
  if (!pageSections) {
    return undefined
  }

  const normalizedSections = {
    showCarousel: pageSections.showCarousel === true,
    showPromotions: pageSections.showPromotions === true,
    showNewArrivals: pageSections.showNewArrivals === true,
  }

  return normalizedSections.showCarousel || normalizedSections.showPromotions || normalizedSections.showNewArrivals
    ? normalizedSections
    : undefined
}

function normalizeVoiceStyle(value?: string): VoiceStyleOption | null {
  switch (value) {
    case 'soft':
      return 'soft'
    case 'strong':
      return 'strong'
    case 'balanced':
      return 'balanced'
    case 'adaptive':
      return 'adaptive'
    case 'irreverent':
      return 'irreverent'
    default:
      return null
  }
}

function normalizeBusinessGoal(value?: string): BusinessGoalOption | null {
  switch (value) {
    case 'volume':
      return 'volume'
    case 'ticket':
      return 'ticket'
    case 'rotation':
      return 'rotation'
    case 'launch':
      return 'launch'
    default:
      return null
  }
}

function normalizeActMode(value?: string): ActModeOption | null {
  switch (value) {
    case 'seller':
      return 'seller'
    case 'consultant':
      return 'consultant'
    case 'stylist':
      return 'stylist'
    case 'coach':
      return 'coach'
    case 'chef':
      return 'chef'
    default:
      return null
  }
}

function normalizeBrandType(value?: string): BrandTypeOption | null {
  switch (value) {
    case 'business':
      return 'business'
    case 'professional':
      return 'professional'
    default:
      return null
  }
}

function normalizeBusinessModel(value?: string, brandType?: string): BusinessModelOption | null {
  if (value === 'product' || value === 'service' || value === 'professional') {
    return value
  }

  if (brandType === 'professional') {
    return 'professional'
  }

  return null
}

function normalizeEmergencyType(value?: string): EmergencyTypeOption | undefined {
  switch (value) {
    case 'legal':
      return 'legal'
    case 'health':
      return 'health'
    case 'technical':
      return 'technical'
    default:
      return undefined
  }
}

function normalizeModes(value?: Partial<SparkModes>): SparkModes {
  return {
    sales: value?.sales !== false,
    service: value?.service !== false,
    scheduling: value?.scheduling === true,
    emergency: value?.emergency === true,
  }
}

function buildDefaultFeatures(businessModel: BusinessModelOption): BrandFeatures {
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

function normalizeFeatures(value?: Partial<BrandFeatures>, businessModel?: string, brandType?: string): BrandFeatures {
  const resolvedBusinessModel = normalizeBusinessModel(businessModel, brandType) ?? 'product'
  const defaults = buildDefaultFeatures(resolvedBusinessModel)

  return {
    products: value?.products ?? defaults.products,
    services: value?.services ?? defaults.services,
    scheduling: value?.scheduling ?? defaults.scheduling,
    emergency: value?.emergency ?? defaults.emergency,
  }
}

function normalizeEmergencyMode(value?: Partial<EmergencyModeConfig>): EmergencyModeConfig {
  return {
    enabled: value?.enabled === true,
    autoStart: value?.autoStart === true,
    showUploadEarly: value?.showUploadEarly !== false,
  }
}

function normalizeCtaConfig(value?: Partial<CtaConfig>): CtaConfig {
  return {
    whatsappEnabled: value?.whatsappEnabled === true,
    whatsappNumber: normalizeWhatsAppNumber(value?.whatsappNumber),
    whatsappMessageTemplate: normalizeTextValue(value?.whatsappMessageTemplate, 320),
    showAfterEvidence: value?.showAfterEvidence !== false,
    showOnCompletion: value?.showOnCompletion !== false,
    primaryText: normalizeTextValue(value?.primaryText, 48),
    secondaryText: normalizeTextValue(value?.secondaryText, 140),
  }
}

function normalizeProfessionalData(value?: ProfessionalPageData): ProfessionalPageData | undefined {
  if (!value) {
    return undefined
  }

  const operationMode = normalizeProfessionalOperationMode(value.operationMode) ?? 'institutional'
  const presentation = normalizeBrandKnowledgeField(value.presentation)
  const practiceAreas = normalizeStringList(value.practiceAreas, 5, 60)
  const differentials = normalizeStringList(value.differentials, 4, 80)
  const cases = Array.isArray(value.cases)
    ? value.cases
        .map((item) => normalizeProfessionalCase(item))
        .filter((item): item is ProfessionalCase => Boolean(item))
        .slice(0, 3)
    : undefined
  const contents = Array.isArray(value.contents)
    ? value.contents
        .map((item) => normalizeProfessionalContent(item))
        .filter((item): item is ProfessionalContent => Boolean(item))
        .slice(0, 3)
    : undefined
  const identity = normalizeProfessionalIdentity(value.identity)
  const guidance = normalizeProfessionalGuidance(value.guidance)

  if (!presentation && !practiceAreas && !differentials && !cases && !contents && !identity && !guidance) {
    return undefined
  }

  return {
    operationMode,
    presentation,
    practiceAreas,
    differentials,
    cases,
    contents,
    identity,
    guidance,
  }
}

function normalizeServiceOffers(value?: ServiceOffer[]): ServiceOffer[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const normalizedValues = value
    .map((item) => {
      const title = normalizeTextValue(item?.title, 80)
      const summary = normalizeTextValue(item?.summary, 140)
      const label = normalizeTextValue(item?.label, 40)

      if (!title || !summary) {
        return null
      }

      return { title, summary, label }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 4)

  return normalizedValues.length > 0 ? normalizedValues : undefined
}

function normalizeSchedulingConfig(value?: SchedulingConfig): SchedulingConfig | undefined {
  if (!value) {
    return undefined
  }

  const title = normalizeTextValue(value.title, 80)
  const description = normalizeTextValue(value.description, 180)
  const serviceOptions = normalizeStringList(value.serviceOptions, 8, 80)
  const durationMinutes = typeof value.durationMinutes === 'number' && value.durationMinutes > 0 ? value.durationMinutes : undefined
  const availableDays = normalizeStringList(value.availableDays, 7, 20)
  const availableHours = normalizeStringList(value.availableHours, 12, 40)
  const weeklyAvailability = normalizeWeeklyAvailability(value.weeklyAvailability, availableDays, availableHours)
  const blockedDates = normalizeStringList(value.blockedDates, 32, 20)
  const blockedSlots = normalizeStringList(value.blockedSlots, 64, 80)
  const slotIntervalMinutes = typeof value.slotIntervalMinutes === 'number' && value.slotIntervalMinutes > 0 ? value.slotIntervalMinutes : undefined
  const attendanceMode =
    value.attendanceMode === 'online' || value.attendanceMode === 'domicilio' || value.attendanceMode === 'presencial'
      ? value.attendanceMode
      : undefined
  const attendanceModes = normalizeAttendanceModesConfig(value.attendanceModes, attendanceMode)
  const whatsappNotificationEnabled = value.whatsappNotificationEnabled === true
  const whatsappNumber = normalizeWhatsAppNumber(value.whatsappNumber)
  const whatsappMessageTemplate = normalizeTextValue(value.whatsappMessageTemplate, 320)
  const manualConfirmation = value.manualConfirmation === true
  const enabled = value.enabled === true

  if (
    !enabled &&
    !title &&
    !description &&
    !serviceOptions &&
    !durationMinutes &&
    !availableDays &&
    !availableHours &&
    !weeklyAvailability &&
    !blockedDates &&
    !blockedSlots &&
    !slotIntervalMinutes &&
    !attendanceMode &&
    !attendanceModes &&
    !whatsappNotificationEnabled &&
    !whatsappNumber &&
    !whatsappMessageTemplate &&
    !manualConfirmation
  ) {
    return undefined
  }

  return {
    enabled,
    title,
    description,
    serviceOptions,
    durationMinutes,
    availableDays,
    availableHours,
    weeklyAvailability,
    blockedDates,
    blockedSlots,
    slotIntervalMinutes,
    attendanceMode,
    attendanceModes,
    whatsappNotificationEnabled,
    whatsappNumber,
    whatsappMessageTemplate,
    manualConfirmation,
  }
}

function normalizeAttendanceModesConfig(
  value?: AttendanceModesConfig,
  fallbackMode?: SchedulingConfig['attendanceMode'],
): AttendanceModesConfig | undefined {
  const normalizedValue: AttendanceModesConfig = {
    presencial: value?.presencial === true,
    online: value?.online === true,
    domicilio: value?.domicilio === true,
  }

  if (fallbackMode === 'presencial') {
    normalizedValue.presencial = true
  } else if (fallbackMode === 'online') {
    normalizedValue.online = true
  } else if (fallbackMode === 'domicilio') {
    normalizedValue.domicilio = true
  }

  if (!normalizedValue.presencial && !normalizedValue.online && !normalizedValue.domicilio) {
    return undefined
  }

  return normalizedValue
}

function normalizeWeeklyAvailability(
  value?: WeeklyAvailabilityConfig,
  fallbackDays?: string[],
  fallbackHours?: string[],
): WeeklyAvailabilityConfig | undefined {
  const weekdayKeys: Array<keyof WeeklyAvailabilityConfig> = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ]

  const normalizedEntries = weekdayKeys.reduce<WeeklyAvailabilityConfig>((result, key) => {
    const entry = value?.[key]
    if (!entry) {
      return result
    }

    const normalizedEntry: WeeklyAvailabilityDayConfig = {
      enabled: entry.enabled === true,
      start: normalizeTimeValue(entry.start),
      end: normalizeTimeValue(entry.end),
    }

    if (!normalizedEntry.enabled && !normalizedEntry.start && !normalizedEntry.end) {
      return result
    }

    result[key] = normalizedEntry
    return result
  }, {})

  if (Object.keys(normalizedEntries).length > 0) {
    return normalizedEntries
  }

  if (!fallbackDays?.length) {
    return undefined
  }

  const defaultStart = normalizeTimeValue(fallbackHours?.[0]) ?? '09:00'
  const defaultEnd = normalizeTimeValue(fallbackHours?.[fallbackHours.length - 1]) ?? '18:00'
  const dayMap: Record<string, keyof WeeklyAvailabilityConfig> = {
    segunda: 'monday',
    terca: 'tuesday',
    terça: 'tuesday',
    quarta: 'wednesday',
    quinta: 'thursday',
    sexta: 'friday',
    sabado: 'saturday',
    sábado: 'saturday',
    domingo: 'sunday',
  }

  const fallbackConfig = fallbackDays.reduce<WeeklyAvailabilityConfig>((result, item) => {
    const normalizedKey = dayMap[item.trim().toLowerCase()]
    if (!normalizedKey) {
      return result
    }

    result[normalizedKey] = {
      enabled: true,
      start: defaultStart,
      end: defaultEnd,
    }
    return result
  }, {})

  return Object.keys(fallbackConfig).length > 0 ? fallbackConfig : undefined
}

function normalizeTimeValue(value?: string) {
  if (!value) {
    return undefined
  }

  const trimmedValue = value.trim()
  return /^\d{2}:\d{2}$/.test(trimmedValue) ? trimmedValue : undefined
}

function normalizeProfessionalOperationMode(value?: string): ProfessionalOperationMode | null {
  if (value === 'institutional' || value === 'authority' || value === 'guidance') {
    return value
  }

  return null
}

function normalizeProfessionalGuidance(value?: ProfessionalGuidanceConfig): ProfessionalGuidanceConfig | undefined {
  if (!value) {
    return undefined
  }

  const situationType = normalizeTextValue(value.situationType, 80)
  const initialResponse = normalizeTextValue(value.initialResponse, 180)
  const initialQuestions = normalizeStringList(value.initialQuestions, 6, 120)
  const actionChecklist = normalizeStringList(value.actionChecklist, 6, 100)
  const dataCollection = normalizeStringList(value.dataCollection, 6, 100)
  const orientationLimits = normalizeTextValue(value.orientationLimits, 180)
  const communicationTone = normalizeTextValue(value.communicationTone, 80)
  const closingMessage = normalizeTextValue(value.closingMessage, 180)
  const playbooks = normalizeProfessionalGuidancePlaybooks(value.playbooks)

  if (!situationType && !initialResponse && !initialQuestions && !actionChecklist && !dataCollection && !orientationLimits && !communicationTone && !closingMessage && !playbooks) {
    return undefined
  }

  return {
    situationType,
    initialResponse,
    initialQuestions,
    actionChecklist,
    dataCollection,
    orientationLimits,
    communicationTone,
    closingMessage,
    playbooks,
  }
}

function normalizeProfessionalGuidancePlaybooks(
  value?: Partial<Record<ProfessionalGuidancePlaybookKey, ProfessionalGuidancePlaybook>>,
): Partial<Record<ProfessionalGuidancePlaybookKey, ProfessionalGuidancePlaybook>> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const normalizedEntries = (Object.keys(professionalGuidancePlaybooks) as ProfessionalGuidancePlaybookKey[])
    .map((key) => {
      const playbook = value[key]
      if (!playbook) {
        return null
      }

      const initialResponse = normalizeTextValue(playbook.initialResponse, 180)
      const initialQuestions = normalizeStringList(playbook.initialQuestions, 6, 120)
      const actionChecklist = normalizeStringList(playbook.actionChecklist, 6, 100)
      const dataCollection = normalizeStringList(playbook.dataCollection, 6, 100)
      const orientationLimits = normalizeTextValue(playbook.orientationLimits, 180)
      const closingMessage = normalizeTextValue(playbook.closingMessage, 180)

      if (!initialResponse || !initialQuestions || !actionChecklist || !dataCollection || !orientationLimits || !closingMessage) {
        return null
      }

      return [
        key,
        {
          situationType: key,
          initialResponse,
          initialQuestions,
          actionChecklist,
          dataCollection,
          orientationLimits,
          closingMessage,
        },
      ] as const
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined
}

function normalizeProfessionalCase(value?: ProfessionalCase): ProfessionalCase | null {
  const caseType = normalizeTextValue(value?.caseType, 60)
  const context = normalizeTextValue(value?.context, 120)
  const approach = normalizeTextValue(value?.approach, 120)
  const learning = normalizeTextValue(value?.learning, 120)

  if (!caseType || !context || !approach) {
    return null
  }

  return { caseType, context, approach, learning }
}

function normalizeProfessionalContent(value?: ProfessionalContent): ProfessionalContent | null {
  const title = normalizeTextValue(value?.title, 80)
  const summary = normalizeTextValue(value?.summary, 140)
  const stance = normalizeTextValue(value?.stance, 100)

  if (!title || !summary) {
    return null
  }

  return { title, summary, stance }
}

function normalizeProfessionalIdentity(value?: ProfessionalIdentity): ProfessionalIdentity | undefined {
  if (!value) {
    return undefined
  }

  const headline = normalizeTextValue(value.headline, 100)
  const principles = normalizeStringList(value.principles, 5, 80)
  if (!headline && !principles) {
    return undefined
  }

  return { headline, principles }
}

function normalizeStringList(values?: string[], maxItems = 4, maxLength = 80): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined
  }

  const normalizedValues = values.map((value) => normalizeTextValue(value, maxLength)).filter((value): value is string => Boolean(value)).slice(0, maxItems)
  return normalizedValues.length > 0 ? normalizedValues : undefined
}

function normalizeTextValue(value?: string, maxLength = BRAND_KNOWLEDGE_MAX_LENGTH): string | undefined {
  const normalizedValue = value?.trim().slice(0, maxLength)
  return normalizedValue ? normalizedValue : undefined
}

function normalizeLegacyWhatsApp(value?: string): string | undefined {
  return normalizeWhatsAppNumber(value)
}

function normalizeImageField(value?: string): string | undefined {
  const normalizedValue = value?.trim()
  if (!normalizedValue) {
    return undefined
  }

  return normalizedValue.slice(0, 2_000_000)
}

function normalizeImageList(values?: string[]): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined
  }

  const normalizedValues = values.map((value) => normalizeImageField(value)).filter((value): value is string => Boolean(value)).slice(0, 3)
  return normalizedValues.length > 0 ? normalizedValues : undefined
}

function normalizeColor(value?: string): string | undefined {
  const normalizedValue = value?.trim()
  if (!normalizedValue) {
    return undefined
  }

  return /^#[0-9a-fA-F]{6}$/.test(normalizedValue) ? normalizedValue : undefined
}

function normalizeOpeningHours(value?: Partial<OpeningHours>): OpeningHours | undefined {
  const start = normalizeTimeField(value?.start)
  const end = normalizeTimeField(value?.end)

  if (!start || !end) {
    return undefined
  }

  return { start, end }
}

function normalizeTimeField(value?: string) {
  const normalizedValue = value?.trim()
  if (!normalizedValue || !/^\d{2}:\d{2}$/.test(normalizedValue)) {
    return undefined
  }

  return normalizedValue
}
