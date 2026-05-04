import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { OrchestratorSnapshotRecord } from '../domain/orchestratorSnapshot.js'
import type { FlowMindPort } from './flowMindPort.js'
import type { PublicInteractionActionResult } from './publicInteractionActionService.js'
import {
  evaluatePublicFlowMindShadow,
  type PublicFlowMindShadowBackendDecision,
} from './publicFlowMindShadowService.js'

export type PublicEntityInteractionRequest = {
  requestId?: string
  userMessage: string
  businessContext?: {
    businessType?: string
    description?: string
    catalogSummary?: {
      categories: string[]
      featuredItems: string[]
    }
    servicesSummary?: {
      names: string[]
    }
  }
  context?: {
    sessionId?: string
    allowDebug?: boolean
    clientRenderVersion?: string
  }
}

export type PublicEntityDecisionResponse = {
  status: 'ready'
  entityId: string
  requestId: string
  decision: {
    responseText: string
    decision: {
      intent: string
      action: string
      confidence: number
    }
    decisionSource: string
    terminalAuthority: string
    semanticFrozen: boolean
    visualPatch?: {
      visualState?: Record<string, unknown>
      runtimePatch?: Record<string, unknown>
    }
    updatedPresenceIndicators?: {
      cognitiveIndicator?: {
        tone: string
        summary: string
        confidence?: number
      }
      relationshipLabel?: string
      presenceIntensity?: number
    }
    debugSummary?: {
      terminalReason?: string
      dominantReason?: string
      fallbackUsed: boolean
      fallbackReason?: string
      authorityShift?: string
      safeMode?: boolean
    }
  }
  fallback: {
    occurred: boolean
    source: 'backend-authoritative' | 'backend-fallback' | 'frontend-explicit-fallback'
    reason?: string
  }
  actionResult?: PublicInteractionActionResult
  telemetry: {
    evaluatedAt: string
    latencyMs: number
  }
}

export type PublicEntityInteractionAvailability = {
  enabled: boolean
  reason?: string
}

type PublicEntityInteractionBusinessContext = NonNullable<PublicEntityInteractionRequest['businessContext']>

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function includesAnyTerm(value: string, terms: string[]) {
  const normalized = normalizeText(value)
  return terms.some((term) => normalized.includes(term))
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function readSafeSummaryList(values: string[] | undefined, maxItems: number) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .slice(0, maxItems)
}

function buildBusinessContextCue(context: PublicEntityInteractionBusinessContext | undefined) {
  if (!context) {
    return undefined
  }

  const categories = readSafeSummaryList(context.catalogSummary?.categories, 4)
  const featuredItems = readSafeSummaryList(context.catalogSummary?.featuredItems, 4)
  const serviceNames = readSafeSummaryList(context.servicesSummary?.names, 4)
  const segments: string[] = []

  if (typeof context.businessType === 'string' && context.businessType.trim().length > 0) {
    segments.push(`tipo=${context.businessType.trim()}`)
  }

  if (typeof context.description === 'string' && context.description.trim().length > 0) {
    segments.push(`descricao=${truncateText(context.description.trim(), 120)}`)
  }

  if (categories.length > 0) {
    segments.push(`categorias=${categories.join(', ')}`)
  }

  if (featuredItems.length > 0) {
    segments.push(`itens=${featuredItems.join(', ')}`)
  }

  if (serviceNames.length > 0) {
    segments.push(`servicos=${serviceNames.join(', ')}`)
  }

  if (segments.length === 0) {
    return undefined
  }

  return truncateText(segments.join(' | '), 320)
}

function buildContextualizedUserMessage(userMessage: string, businessContext: PublicEntityInteractionBusinessContext | undefined) {
  const cue = buildBusinessContextCue(businessContext)
  if (!cue) {
    return userMessage
  }

  return `${userMessage}\n\nContexto auxiliar do negocio: ${cue}`
}

function resolveBusinessResponseComplement(args: {
  decision: PublicFlowMindShadowBackendDecision
  businessContext: PublicEntityInteractionBusinessContext | undefined
  userMessage: string
}) {
  const { decision, businessContext, userMessage } = args
  if (!businessContext) {
    return undefined
  }

  const featuredItems = readSafeSummaryList(businessContext.catalogSummary?.featuredItems, 4)
  const categories = readSafeSummaryList(businessContext.catalogSummary?.categories, 3)
  const serviceNames = readSafeSummaryList(businessContext.servicesSummary?.names, 4)
  const wantsCatalog = includesAnyTerm(userMessage, ['catalogo', 'cardapio', 'menu', 'marmita', 'produto', 'produtos', 'item', 'itens', 'vende', 'tem'])
  const wantsService = includesAnyTerm(userMessage, ['servico', 'servicos', 'atendimento', 'consulta', 'agendar', 'agenda'])
  const wantsLegalGuidance = includesAnyTerm(userMessage, ['ajuda', 'urgente', 'emergencia', 'caso', 'direito', 'advogado'])
  const shouldGuide = decision.fallbackUsed || decision.action === 'guide' || decision.action === 'sell' || decision.action === 'support'

  if ((businessContext.businessType === 'restaurant' || businessContext.businessType === 'store') && featuredItems.length > 0 && (wantsCatalog || shouldGuide)) {
    const categorySuffix = categories.length > 0 ? ` Categorias visiveis agora: ${categories.join(', ')}.` : ''
    return `No contexto do negocio, os destaques mais relevantes agora sao ${featuredItems.join(', ')}.${categorySuffix}`
  }

  if (serviceNames.length > 0 && (wantsService || shouldGuide)) {
    return `Os servicos mais claros nesse contexto sao ${serviceNames.join(', ')}.`
  }

  if (businessContext.businessType === 'legal' && (wantsLegalGuidance || shouldGuide)) {
    return 'A melhor leitura agora e iniciar uma orientacao inicial objetiva e organizar o proximo passo com clareza.'
  }

  return undefined
}

function buildResponseText(args: {
  decision: PublicFlowMindShadowBackendDecision
  businessContext: PublicEntityInteractionBusinessContext | undefined
  userMessage: string
}) {
  const complement = resolveBusinessResponseComplement(args)
  if (!complement) {
    return args.decision.responseText
  }

  const normalizedBase = args.decision.responseText.trim()
  if (normalizedBase.includes(complement)) {
    return normalizedBase
  }

  return `${normalizedBase} ${complement}`.trim()
}

function readFlowMindMode(entityProfile: EntityProfile) {
  return entityProfile.runtime?.flowMind?.mode
}

export function resolvePublicEntityInteractionAvailability(args: {
  entityProfile: EntityProfile
  flowMindService?: FlowMindPort
}): PublicEntityInteractionAvailability {
  if (args.entityProfile.runtime?.flowMind?.killSwitchEnabled) {
    return {
      enabled: false,
      reason: 'entity-kill-switch-enabled',
    }
  }

  if (readFlowMindMode(args.entityProfile) === 'disabled') {
    return {
      enabled: false,
      reason: 'entity-flowmind-disabled',
    }
  }

  if (!args.flowMindService || args.flowMindService.mode === 'disabled') {
    return {
      enabled: false,
      reason: 'backend-flowmind-unavailable',
    }
  }

  return {
    enabled: true,
  }
}

function resolveCognitiveTone(decision: PublicFlowMindShadowBackendDecision) {
  if (decision.authority.semanticFrozen) {
    return 'stable'
  }

  if (decision.fallbackUsed) {
    return 'guarded'
  }

  if (decision.action === 'sell') {
    return 'expansive'
  }

  if (decision.action === 'support') {
    return 'contained'
  }

  if (decision.action === 'refuse') {
    return 'protected'
  }

  return 'balanced'
}

function resolveCognitiveSummary(decision: PublicFlowMindShadowBackendDecision) {
  if (decision.action === 'sell') {
    return 'presenca em expansao orientada a proximo passo'
  }

  if (decision.action === 'support') {
    return 'presenca em amparo e clareza'
  }

  if (decision.action === 'guide') {
    return 'presenca em orientacao ativa'
  }

  if (decision.action === 'refuse') {
    return 'presenca em contencao segura'
  }

  return 'presenca em ajuste contextual'
}

function resolvePresenceIntensity(currentIntensity: number | undefined, decision: PublicFlowMindShadowBackendDecision) {
  const baseIntensity = typeof currentIntensity === 'number' ? currentIntensity : 0.56
  const actionDelta =
    decision.action === 'sell'
      ? 0.08
      : decision.action === 'guide'
        ? 0.04
        : decision.action === 'support'
          ? -0.03
          : decision.action === 'refuse'
            ? -0.06
            : 0.01

  return Math.round(clamp(baseIntensity + actionDelta + (decision.authority.decisionSource === 'adaptive-core' ? 0.03 : 0), 0.18, 0.96) * 1000) / 1000
}

function buildVisualPatch(decision: PublicFlowMindShadowBackendDecision, currentPresenceIntensity: number | undefined) {
  const confidence = clamp(decision.confidence)
  const actionBias =
    decision.action === 'sell'
      ? 0.08
      : decision.action === 'guide'
        ? 0.04
        : decision.action === 'support'
          ? -0.05
          : decision.action === 'refuse'
            ? -0.08
            : 0
  const intensity = resolvePresenceIntensity(currentPresenceIntensity, decision)
  const confidenceBias = (confidence - 0.5) * 0.18

  return {
    visualState: {
      tone: resolveCognitiveTone(decision),
      intensity,
      confidence,
      semanticFrozen: decision.authority.semanticFrozen,
    },
    runtimePatch: {
      core: {
        radiusMultiplier: clamp(0.96 + confidenceBias + actionBias, 0.78, 1.24),
        pulseMultiplier: clamp(0.94 + confidenceBias * 1.2 + actionBias, 0.72, 1.28),
        rhythmSpeedMultiplier: clamp(0.94 + confidenceBias + actionBias * 0.6, 0.8, 1.24),
      },
      field: {
        spreadMultiplier: clamp(0.92 + confidenceBias + actionBias * 0.8, 0.72, 1.24),
        pulseMultiplier: clamp(0.9 + confidenceBias + actionBias * 0.5, 0.72, 1.22),
      },
      particles: {
        alphaMultiplier: clamp(0.92 + confidenceBias * 0.8 + actionBias * 0.4, 0.7, 1.18),
        speedMultiplier: clamp(0.96 + confidenceBias + actionBias * 0.6, 0.76, 1.22),
      },
      metadata: {
        source: 'brandsoul-cognition',
        decisionIntent: decision.intent,
        actionType: decision.action,
        confidence,
      },
    },
  }
}

function buildDebugSummary(args: {
  decision: PublicFlowMindShadowBackendDecision
  includeDebug: boolean
}) {
  if (!args.includeDebug) {
    return undefined
  }

  return {
    terminalReason: args.decision.fallbackUsed
      ? `backend-fallback:${args.decision.fallbackReason ?? 'unspecified'}`
      : `backend-authoritative:${args.decision.authority.terminalAuthority}`,
    dominantReason: `${args.decision.intent}/${args.decision.action}`,
    fallbackUsed: args.decision.fallbackUsed,
    fallbackReason: args.decision.fallbackReason,
    authorityShift: args.decision.authority.terminalAuthority,
    safeMode: args.decision.action === 'refuse' || args.decision.fallbackUsed,
  }
}

export async function resolvePublicEntityInteraction(args: {
  entityId: string
  entityProfile: EntityProfile
  latestSnapshot?: OrchestratorSnapshotRecord | null
  flowMindService?: FlowMindPort
  requestId: string
  userMessage: string
  businessContext?: PublicEntityInteractionBusinessContext
  currentRelationshipLabel?: string
  currentPresenceIntensity?: number
  allowDebug?: boolean
  now?: string
}): Promise<PublicEntityDecisionResponse | undefined> {
  const startedAt = Date.now()
  const decision = await evaluatePublicFlowMindShadow({
    entityProfile: args.entityProfile,
    latestSnapshot: args.latestSnapshot,
    flowMindService: args.flowMindService,
    requestId: args.requestId,
    userMessage: buildContextualizedUserMessage(args.userMessage, args.businessContext),
    now: args.now,
  })

  if (!decision) {
    return undefined
  }

  const resolvedIntensity = resolvePresenceIntensity(args.currentPresenceIntensity, decision)
  const totalLatencyMs = Math.max(decision.latencyMs, Date.now() - startedAt)
  const fallbackOccurred = decision.fallbackUsed

  return {
    status: 'ready',
    entityId: args.entityId,
    requestId: args.requestId,
    decision: {
      responseText: buildResponseText({
        decision,
        businessContext: args.businessContext,
        userMessage: args.userMessage,
      }),
      decision: {
        intent: decision.intent,
        action: decision.action,
        confidence: Math.round(clamp(decision.confidence) * 1000) / 1000,
      },
      decisionSource: decision.authority.decisionSource,
      terminalAuthority: decision.authority.terminalAuthority,
      semanticFrozen: decision.authority.semanticFrozen,
      visualPatch: buildVisualPatch(decision, args.currentPresenceIntensity),
      updatedPresenceIndicators: {
        cognitiveIndicator: {
          tone: resolveCognitiveTone(decision),
          summary: resolveCognitiveSummary(decision),
          confidence: Math.round(clamp(decision.confidence) * 1000) / 1000,
        },
        relationshipLabel: args.currentRelationshipLabel,
        presenceIntensity: resolvedIntensity,
      },
      debugSummary: buildDebugSummary({
        decision,
        includeDebug: args.allowDebug === true,
      }),
    },
    fallback: {
      occurred: fallbackOccurred,
      source: fallbackOccurred ? 'backend-fallback' : 'backend-authoritative',
      reason: decision.fallbackReason,
    },
    telemetry: {
      evaluatedAt: decision.evaluatedAt,
      latencyMs: totalLatencyMs,
    },
  }
}
