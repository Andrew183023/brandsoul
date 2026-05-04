import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { JsonObject } from '../domain/entityProfile.js'
import type { EntityRelationalTraceRecord } from '../domain/entityRelationalTrace.js'
import type {
  DashboardDeprecatedFallback,
  RelationalTraceDetailedGuardrail,
  RelationalTraceDetailedResponse,
  RelationalTraceItemDetailed,
} from './contracts.js'

function roundValue(value: number, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function mapGuardrailTone(tag: string): RelationalTraceDetailedGuardrail['tone'] {
  if (tag === 'inactivity-decay') {
    return 'cooling'
  }
  if (tag === 'share-spam-guard' || tag === 'short-repeat' || tag === 'repeat-window' || tag === 'window-cap') {
    return 'warning'
  }
  return 'neutral'
}

function mapGuardrailLabel(tag: string) {
  if (tag === 'short-repeat') return 'spam mitigado'
  if (tag === 'repeat-window') return 'repetição mitigada'
  if (tag === 'window-cap') return 'cap aplicado'
  if (tag === 'share-spam-guard') return 'share sob proteção'
  if (tag === 'dense-activity-window') return 'janela densa'
  if (tag === 'inactivity-decay') return 'decay aplicado'
  if (tag === 'continuity-coalesced') return 'coalescing de continuidade'
  return tag
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject
}

function readMetadata(trace: EntityRelationalTraceRecord): JsonObject {
  return toJsonObject(trace.metadataJson)
}

function readGuardrails(trace: EntityRelationalTraceRecord) {
  const metadata = readMetadata(trace)
  const guardrails = toJsonObject(metadata.guardrails)
  const tags = Array.isArray(guardrails.tags)
    ? guardrails.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const items = tags.map((tag) => ({
    key: tag,
    label: mapGuardrailLabel(tag),
    tone: mapGuardrailTone(tag),
  }))
  const decay = isObject(guardrails.decay) ? guardrails.decay : {}

  return {
    capApplied: tags.includes('window-cap'),
    decayApplied:
      (typeof decay.binding === 'number' && decay.binding > 0)
      || (typeof decay.continuity === 'number' && decay.continuity > 0)
      || tags.includes('inactivity-decay'),
    spamMitigated: tags.includes('short-repeat') || tags.includes('repeat-window') || tags.includes('share-spam-guard'),
    coalescingApplied: tags.includes('continuity-coalesced'),
    items,
  }
}

function anonymizeActorId(actorId?: string) {
  if (!actorId) {
    return undefined
  }

  if (actorId.length <= 4) {
    return `anon-${actorId}`
  }

  return `anon-${actorId.slice(-4)}`
}

function buildDecisionTraceId(trace: EntityRelationalTraceRecord) {
  const metadata = readMetadata(trace)
  if (typeof metadata.decisionTraceId === 'string' && metadata.decisionTraceId.trim().length > 0) {
    return metadata.decisionTraceId.trim()
  }

  if (typeof metadata.lineageRootCommandId === 'string' && metadata.lineageRootCommandId.trim().length > 0 && typeof metadata.decisionCreatedAt === 'string') {
    return `decision:${metadata.lineageRootCommandId}:${metadata.decisionCreatedAt}`
  }

  return undefined
}

function buildInterpretiveExplanation(trace: EntityRelationalTraceRecord) {
  const guardrails = readGuardrails(trace)
  if (guardrails.decayApplied && (trace.eventType === 'return.visit.registered' || trace.eventType === 'return_visit.registered')) {
    return 'Retorno detectado após período de inatividade, reforçando continuidade enquanto compensou decay acumulado.'
  }

  if (guardrails.spamMitigated) {
    return 'Interações repetidas tiveram impacto reduzido por proteção contra inflação relacional.'
  }

  if (guardrails.coalescingApplied) {
    return 'O evento reforçou presença sem abrir nova continuidade, pois caiu em janela já consolidada.'
  }

  if (trace.eventType === 'return.visit.registered' || trace.eventType === 'return_visit.registered') {
    return 'Retorno legítimo reforçou o vínculo e elevou a confiança de continuidade.'
  }

  if (trace.eventType === 'share.registered') {
    return 'Compartilhamento expandiu o alcance da entidade e aumentou a progressão relacional.'
  }

  return 'Interação oficial reforçou o vínculo e alimentou a progressão da entidade.'
}

function buildSummary(trace: EntityRelationalTraceRecord) {
  const metadata = readMetadata(trace)
  if (typeof metadata.summary === 'string' && metadata.summary.trim().length > 0) {
    return metadata.summary.trim()
  }

  return buildInterpretiveExplanation(trace)
}

function buildDeprecatedFallbacks(args: {
  traces: EntityRelationalTraceRecord[]
  entityProfile?: EntityProfile
}): DashboardDeprecatedFallback[] {
  const fallbacks: DashboardDeprecatedFallback[] = []

  if (!args.entityProfile) {
    fallbacks.push({
      key: 'relationalTrace.baseline.entityProfileMissing',
      reason: 'A projeção detalhada usou baseline zero em parte dos before/after porque o entityProfile oficial não estava disponível nesta leitura.',
      replacement: 'Garantir entityProfile oficial na leitura protegida do orchestrator.',
    })
  }

  if (args.traces.some((trace) => !buildDecisionTraceId(trace))) {
    fallbacks.push({
      key: 'relationalTrace.lineage.decisionTraceRefPartial',
      reason: 'Parte da trilha ainda não possui referência explícita de decisão persistida; itens legados podem aparecer sem decisionTraceId.',
      replacement: 'Persistir decisionTraceId oficial em todos os traces novos e retroalimentar itens legados quando houver migração.',
    })
  }

  if (args.traces.some((trace) => typeof readMetadata(trace).actionType !== 'string')) {
    fallbacks.push({
      key: 'relationalTrace.lineage.actionTypePartial',
      reason: 'Nem todos os traces possuem actionType persistido na metadata; itens legados podem aparecer sem essa referência.',
      replacement: 'Persistir actionType do FlowMind em todos os traces relacionais oficiais.',
    })
  }

  return fallbacks
}

export function buildDetailedRelationalTraceResponse(args: {
  entityId: string
  traces: EntityRelationalTraceRecord[]
  entityProfile?: EntityProfile
}): RelationalTraceDetailedResponse {
  const bindingState = asRecord(args.entityProfile?.relational.binding)
  const progressionState = asRecord(args.entityProfile?.relational.progression)
  let bindingCursor = readNumber(bindingState?.bindingStrength)
  let xpCursor = readNumber(progressionState?.xp)
  let continuityCursor = readNumber(bindingState?.continuityScore)

  const items: RelationalTraceItemDetailed[] = args.traces.map((trace) => {
    const bindingAfter = bindingCursor
    const bindingBefore = bindingAfter - trace.deltaBindingStrength
    bindingCursor = bindingBefore

    const xpAfter = xpCursor
    const xpBefore = xpAfter - trace.deltaXp
    xpCursor = xpBefore

    const continuityAfter = continuityCursor
    const continuityBefore = continuityAfter - trace.deltaContinuityConfidence
    continuityCursor = continuityBefore

    const metadata = readMetadata(trace)

    return {
      traceId: trace.id,
      eventId: trace.eventId,
      eventType: trace.eventType,
      occurredAt: trace.occurredAt,
      context: {
        interactionType: trace.interactionType,
        topic: trace.topic,
        intent: trace.intent,
        actorId: anonymizeActorId(trace.actorId),
      },
      deltas: {
        binding: trace.deltaBindingStrength,
        xp: trace.deltaXp,
        continuity: trace.deltaContinuityConfidence,
        returnCount: trace.deltaReturnCount,
        shareCount: trace.deltaShareCount,
      },
      beforeAfter: {
        binding: [roundValue(bindingBefore), roundValue(bindingAfter)],
        xp: [roundValue(xpBefore, 2), roundValue(xpAfter, 2)],
        continuity: [roundValue(continuityBefore), roundValue(continuityAfter)],
      },
      guardrails: readGuardrails(trace),
      lineage: {
        commandId: trace.commandId ?? (typeof metadata.commandId === 'string' ? metadata.commandId : undefined),
        decisionTraceId: buildDecisionTraceId(trace),
        actionType: typeof metadata.actionType === 'string' ? metadata.actionType : undefined,
      },
      summary: buildSummary(trace),
      interpretiveExplanation: buildInterpretiveExplanation(trace),
    }
  })

  return {
    entityId: args.entityId,
    items,
    deprecatedFallbacks: buildDeprecatedFallbacks({
      traces: args.traces,
      entityProfile: args.entityProfile,
    }),
  }
}
