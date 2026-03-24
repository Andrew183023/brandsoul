import type { CatalogItem } from '../types/catalog'
import type { SparkMemory } from './sparkMemory'
import type { ActModeOption, BusinessGoalOption, PowerOption, ToneOption, VoiceStyleOption } from './persona'

export type ContentActionType = 'instagram_post' | 'story' | 'whatsapp_message' | 'promotion' | 'cta'

export interface ContentAction {
  type: ContentActionType
  label: string
  prompt: string
}

interface ContentActionPersonaContext {
  brandName: string
  deliveryAvailable?: boolean
  businessHours?: string
  serviceRegion?: string
  brandHighlight?: string
  tone: ToneOption
  power: PowerOption
  voiceStyle: VoiceStyleOption
  actMode?: ActModeOption
  businessGoal?: BusinessGoalOption
}

function resolveTimeWindowLabel(currentHour: number, sparkMemory: SparkMemory) {
  if (sparkMemory.interaction_windows.includes('noite') || currentHour >= 18) {
    return 'hoje a noite'
  }

  if (sparkMemory.interaction_windows.includes('tarde') || currentHour >= 12) {
    return 'hoje a tarde'
  }

  return 'hoje'
}

function resolveContentFocus(
  persona: ContentActionPersonaContext,
  sparkMemory: SparkMemory,
  catalogItems: CatalogItem[],
) {
  const primaryCatalogItem = catalogItems[0]?.name

  if (sparkMemory.top_intents.includes('delivery') || persona.deliveryAvailable) {
    return primaryCatalogItem
      ? `delivery e ${primaryCatalogItem}`
      : 'delivery'
  }

  if (sparkMemory.common_topics.includes('promocao')) {
    return primaryCatalogItem ? `uma promocao com ${primaryCatalogItem}` : 'uma promocao de hoje'
  }

  if (sparkMemory.top_intents.includes('contact_action')) {
    return 'conversao e contato direto'
  }

  if (persona.businessGoal === 'ticket') {
    const premiumItem = catalogItems.find((item) => item.priority === 'high' || item.isFeatured)?.name
    return premiumItem ? `combinacoes em torno de ${premiumItem}` : 'uma escolha de maior valor'
  }

  if (persona.businessGoal === 'launch') {
    const launchItem = catalogItems.find((item) => item.isFeatured)?.name
    return launchItem ? `novidade e destaque em ${launchItem}` : 'o que eu quero colocar em destaque agora'
  }

  if (persona.businessGoal === 'rotation') {
    const rotationItem = catalogItems.find((item) => item.priority === 'low')?.name
    return rotationItem ? `giro de ${rotationItem}` : 'itens que merecem mais saida agora'
  }

  if (primaryCatalogItem) {
    return primaryCatalogItem
  }

  if (persona.brandHighlight?.trim()) {
    return persona.brandHighlight.trim()
  }

  return 'o que eu tenho de mais forte agora'
}

function resolveVoiceGuide(persona: ContentActionPersonaContext) {
  if (persona.voiceStyle === 'irreverent') {
    return 'com uma pegada irreverente e leve'
  }

  if (persona.voiceStyle === 'strong') {
    return 'com voz forte e direta'
  }

  if (persona.voiceStyle === 'soft') {
    return 'com voz soft e acolhedora'
  }

  if (persona.voiceStyle === 'adaptive') {
    return 'com voz adaptativa e contextual'
  }

  return 'com voz equilibrada e clara'
}

export function buildContentActions(
  persona: ContentActionPersonaContext,
  sparkMemory: SparkMemory,
  currentHour: number,
  catalogItems: CatalogItem[],
): ContentAction[] {
  const timeWindowLabel = resolveTimeWindowLabel(currentHour, sparkMemory)
  const focus = resolveContentFocus(persona, sparkMemory, catalogItems)
  const voiceGuide = resolveVoiceGuide(persona)

  return [
    {
      type: 'instagram_post',
      label: 'Criar post',
      prompt: `Cria um post para ${timeWindowLabel} focado em ${focus}, ${voiceGuide}. Quero Titulo, Texto, CTA e hashtags.`,
    },
    {
      type: 'story',
      label: 'Criar story',
      prompt: `Cria um story curto para ${timeWindowLabel} focado em ${focus}, ${voiceGuide}. Quero Abertura, Texto e CTA.`,
    },
    {
      type: 'whatsapp_message',
      label: 'Criar mensagem WhatsApp',
      prompt: `Cria uma mensagem de WhatsApp para ${timeWindowLabel} focada em ${focus}, ${voiceGuide}. Quero Mensagem e CTA.`,
    },
    {
      type: 'promotion',
      label: 'Criar promocao',
      prompt: `Cria uma promocao curta para ${timeWindowLabel} focada em ${focus}, ${voiceGuide}. Quero Titulo, Texto promocional e CTA.`,
    },
  ]
}
