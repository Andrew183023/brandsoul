import { normalizeWhatsAppNumber } from './whatsapp'

export type ToneOption = 'divertido' | 'inteligente' | 'sério' | 'ousado'

export type PowerOption = 'atração' | 'clareza' | 'velocidade' | 'conexão'
export type VoiceStyleOption = 'soft' | 'strong' | 'balanced' | 'adaptive' | 'irreverent'
export type ActModeOption = 'seller' | 'consultant' | 'stylist' | 'coach' | 'chef'
export type BusinessGoalOption = 'volume' | 'ticket' | 'rotation' | 'launch'

export interface OpeningHours {
  start: string
  end: string
}

export interface BrandPersona {
  brandName: string
  logo?: string
  tone: ToneOption
  power: PowerOption
  voiceStyle: VoiceStyleOption
  actMode?: ActModeOption
  businessGoal?: BusinessGoalOption
  businessDescription?: string
  institutionalImage?: string
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
  { value: 'irreverent', label: 'Irreverente', description: 'Sou leve, faço humor e nao sou tao formal' },
]

export const actModeOptions: Array<{ value: ActModeOption; label: string; emoji: string; description: string }> = [
  { value: 'seller', label: 'Vendedor especialista', emoji: '💰', description: 'Destaco beneficios e ajudo na decisao' },
  { value: 'consultant', label: 'Consultor', emoji: '💬', description: 'Explico opcoes com clareza e seguranca' },
  { value: 'stylist', label: 'Estilista', emoji: '👕', description: 'Sugiro combinacoes, ocasioes e estilo' },
  { value: 'coach', label: 'Coach', emoji: '🧠', description: 'Incentivo acao com energia positiva' },
  { value: 'chef', label: 'Chef', emoji: '🍳', description: 'Recomendo sabores, experiencia e sensacao' },
]

export const businessGoalOptions: Array<{ value: BusinessGoalOption; label: string; emoji: string; description: string }> = [
  { value: 'volume', label: 'Vender mais volume', emoji: '📦', description: 'Prioriza itens faceis de girar e vender mais vezes' },
  { value: 'ticket', label: 'Aumentar ticket medio', emoji: '💰', description: 'Puxa combinacoes e escolhas de maior valor' },
  { value: 'rotation', label: 'Girar estoque', emoji: '🔄', description: 'Ajuda a dar saida ao que precisa circular' },
  { value: 'launch', label: 'Destacar novidades', emoji: '🚀', description: 'Coloca foco no que acabou de chegar ou merece holofote' },
]

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
      voiceStyle: normalizeVoiceStyle(parsedPersona.voiceStyle) ?? 'balanced',
      actMode: normalizeActMode(parsedPersona.actMode) ?? 'seller',
      businessGoal: normalizeBusinessGoal(parsedPersona.businessGoal) ?? 'volume',
      businessDescription: normalizeBusinessDescription(parsedPersona.businessDescription),
      institutionalImage: normalizeImageField(parsedPersona.institutionalImage),
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
      voiceStyle: normalizeVoiceStyle(persona.voiceStyle) ?? 'balanced',
      actMode: normalizeActMode(persona.actMode) ?? 'seller',
      businessGoal: normalizeBusinessGoal(persona.businessGoal) ?? 'volume',
      businessDescription: normalizeBusinessDescription(persona.businessDescription),
      institutionalImage: normalizeImageField(persona.institutionalImage),
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
