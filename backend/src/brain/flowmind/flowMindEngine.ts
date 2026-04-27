type JsonRecord = Record<string, unknown>

type EntityAction = {
  type: string
  entityId: string
  priority: 'low' | 'medium' | 'high'
  confidence: number
  createdAt: string
  source: {
    intent: string
    strategy?: string
  }
  payload: JsonRecord
}

type FlowMindDecisionState = {
  schemaVersion: 1
  entityId: string
  awarenessLevel: number
  contextConfidence: number
  decisionConfidence: number
  lastDecisionAt?: string
  activeIntent?: string
  state: 'idle' | 'thinking' | 'acting'
}

type FlowMindDecisionOutput = {
  state: FlowMindDecisionState
  context: JsonRecord
  entityIntent: {
    type: string
    confidence: number
    reason: string
  }
  entityAction: EntityAction
  intent: string
  confidence: number
  reason: string
  upgradeSignal?: JsonRecord
  trace: JsonRecord
}

type DecideInput = {
  entity: JsonRecord
  behaviorState?: JsonRecord
  progression?: JsonRecord
  userMemory?: JsonRecord
  hookLoop?: JsonRecord
  contextSnapshot?: JsonRecord
  lastInteraction?: JsonRecord
  journeyMoment?: string
  socialSignals?: Array<JsonRecord>
  socialTarget?: JsonRecord
  growthMetrics?: {
    triggers?: Array<JsonRecord>
  }
  viralTriggers?: Array<JsonRecord>
  previousState?: FlowMindDecisionState
  pricingSnapshot?: JsonRecord
  planType?: string
  usageMetrics?: JsonRecord
  now?: string
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {}
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' ? value : fallback
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function buildInitialFlowMindState(entity: JsonRecord): FlowMindDecisionState {
  return {
    schemaVersion: 1,
    entityId: readString(entity.id, 'unknown-entity'),
    awarenessLevel: 0.24,
    contextConfidence: 0.24,
    decisionConfidence: 0,
    state: 'idle',
  }
}

function buildFallbackAction(args: {
  entity: JsonRecord
  intent: string
  confidence: number
  now: string
  journeyMoment?: string
}): EntityAction {
  const entityId = readString(args.entity.id, 'unknown-entity')

  if (args.intent === 'encourage_export') {
    return {
      type: 'triggerExport',
      entityId,
      priority: 'medium',
      confidence: clamp(args.confidence, 0.12, 0.76),
      createdAt: args.now,
      source: { intent: args.intent, strategy: 'fallback' },
      payload: {
        format: 'post',
        suggestion: 'Prepare uma saída compartilhável.',
      },
    }
  }

  if (args.intent === 'deepen_memory') {
    return {
      type: 'askQuestion',
      entityId,
      priority: 'medium',
      confidence: clamp(args.confidence, 0.12, 0.72),
      createdAt: args.now,
      source: { intent: args.intent, strategy: 'fallback' },
      payload: {
        question: 'Qual preferência ou direção deve ser lembrada a seguir?',
      },
    }
  }

  if (args.intent === 'amplify_social') {
    return {
      type: 'suggestDiscovery',
      entityId,
      priority: 'medium',
      confidence: clamp(args.confidence, 0.12, 0.74),
      createdAt: args.now,
      source: { intent: args.intent, strategy: 'fallback' },
      payload: {
        suggestion: 'Há sinais suficientes para ampliar a visibilidade.',
      },
    }
  }

  if (args.intent === 'suggest_return') {
    return {
      type: 'sendMessage',
      entityId,
      priority: 'low',
      confidence: clamp(args.confidence, 0.12, 0.64),
      createdAt: args.now,
      source: { intent: args.intent, strategy: 'fallback' },
      payload: {
        message: 'Vale manter continuidade e preparar um próximo retorno.',
        eventName: args.journeyMoment === 'final' ? 'schedule_return_prompt' : 'observe_context',
      },
    }
  }

  return {
    type: 'triggerEvent',
    entityId,
    priority: 'low',
    confidence: clamp(args.confidence, 0.12, 0.48),
    createdAt: args.now,
    source: { intent: args.intent, strategy: 'fallback' },
    payload: {
      eventName: 'observe_context',
    },
  }
}

function decideLocally(input: DecideInput): FlowMindDecisionOutput {
  const entity = input.entity
  const now = input.now ?? new Date().toISOString()
  const relational = asRecord(entity.relational)
  const behaviorState = asRecord(input.behaviorState ?? relational.behaviorState)
  const progression = asRecord(input.progression ?? relational.progression)
  const userMemory = asRecord(input.userMemory ?? relational.userMemory)
  const hookLoop = asRecord(input.hookLoop ?? relational.hookLoop)
  const contextSnapshot = asRecord(input.contextSnapshot)
  const socialSignals = Array.isArray(input.socialSignals) ? input.socialSignals : []

  const socialEngagement = clamp(
    (socialSignals.length > 0 ? Math.min(1, socialSignals.length / 8) * 0.4 : 0) +
      readNumber(asRecord(contextSnapshot.socialContext).engagementScore) * 0.6,
  )

  const awarenessLevel = clamp(
    readNumber(behaviorState.affinityScore) * 0.24 +
      readNumber(behaviorState.loopStrength) * 0.18 +
      readNumber(progression.refinementScore) * 0.18 +
      readNumber(userMemory.memoryConfidence) * 0.2 +
      readNumber(hookLoop.reinforcementScore) * 0.12 +
      socialEngagement * 0.08,
  )

  const contextConfidence = clamp(
    (readString(asRecord(asRecord(entity.context).styleAnswers).brandStyle) ||
    readString(asRecord(asRecord(entity.context).styleAnswers).languageStyle) ||
    readString(asRecord(asRecord(entity.context).styleAnswers).actionStyle)
      ? 0.2
      : 0.08) +
      (readString(asRecord(entity.social).handle) && readString(asRecord(entity.social).publicName) ? 0.18 : 0.08) +
      readNumber(userMemory.memoryConfidence) * 0.22 +
      readNumber(contextSnapshot.memoryRelevance) * 0.2 +
      socialEngagement * 0.12 +
      (readString(contextSnapshot.urgencyLevel) === 'high' ? 0.12 : readString(contextSnapshot.urgencyLevel) === 'medium' ? 0.08 : 0.04),
  )

  let intent = 'wait'
  let reason = 'Ainda não há sinal suficiente para uma ação forte.'
  const userIntent = readString(contextSnapshot.userIntent)
  const exportFormats = readStringArray(asRecord(entity.export).formatsEnabled)

  if (userIntent === 'export' && exportFormats.length) {
    intent = 'encourage_export'
    reason = 'O contexto indica intenção de exportação.'
  } else if (userIntent === 'share' || socialEngagement >= 0.44) {
    intent = 'amplify_social'
    reason = 'Os sinais sociais justificam ampliar alcance.'
  } else if (userIntent === 'return' || readString(contextSnapshot.journeyMoment) === 'returning') {
    intent = 'suggest_return'
    reason = 'O contexto indica retorno e continuidade.'
  } else if (userIntent === 'interact' && readNumber(contextSnapshot.memoryRelevance) < 0.42) {
    intent = 'deepen_memory'
    reason = 'Há interação contextual, mas a memória ainda não está consolidada.'
  } else if (readNumber(userMemory.memoryConfidence) < 0.3 && readNumber(behaviorState.interactionCount) > 0) {
    intent = 'deepen_memory'
    reason = 'Há interação, mas a memória ainda precisa consolidar preferências.'
  } else if (readNumber(hookLoop.returnProbability) >= 0.48 || readString(behaviorState.relationshipMode) === 'returning') {
    intent = 'suggest_return'
    reason = 'O vínculo atual indica oportunidade de retorno.'
  } else if (Boolean(asRecord(entity.finalForm).locked) || readString(asRecord(entity.finalForm).silhouetteClarity) === 'high') {
    intent = 'stabilize_presence'
    reason = 'A forma final já está estável e deve preservar presença.'
  }

  const entityIntent = {
    type:
      intent === 'encourage_export'
        ? 'convert'
        : intent === 'amplify_social'
          ? 'recommend'
          : intent === 'suggest_return'
            ? 'retain'
            : intent === 'deepen_memory'
              ? 'assist'
              : 'engage',
    confidence: clamp(awarenessLevel * 0.42 + contextConfidence * 0.38 + (intent === 'wait' ? 0.06 : 0.18)),
    reason,
  }

  const decisionConfidence = clamp(
    awarenessLevel * 0.38 +
      contextConfidence * 0.32 +
      entityIntent.confidence * 0.18 +
      (intent === 'wait' ? 0.08 : 0.2),
  )

  const state: FlowMindDecisionState = {
    ...(input.previousState ?? buildInitialFlowMindState(entity)),
    entityId: readString(entity.id, 'unknown-entity'),
    awarenessLevel,
    contextConfidence,
    decisionConfidence,
    lastDecisionAt: now,
    activeIntent: intent,
    state: intent === 'wait' ? 'idle' : decisionConfidence >= 0.52 ? 'acting' : 'thinking',
  }

  const entityAction = buildFallbackAction({
    entity,
    intent,
    confidence: decisionConfidence,
    now,
    journeyMoment: input.journeyMoment,
  })

  return {
    state,
    context: contextSnapshot,
    entityIntent,
    entityAction,
    intent,
    confidence: decisionConfidence,
    reason,
    trace: {
      contextSnapshot,
      resolvedIntent: entityIntent,
      chosenAction: entityAction,
      confidence: decisionConfidence,
      reason,
      createdAt: now,
    },
  }
}

export async function decideAsync(input: DecideInput): Promise<FlowMindDecisionOutput> {
  try {
    const loadCompiledEngine = new Function('modulePath', 'return import(modulePath)') as (modulePath: string) => Promise<unknown>
    const module = await loadCompiledEngine('../../../dist/brain/flowmind/flowMindEngine.js')
    const decide = (module as { decide?: (input: DecideInput) => FlowMindDecisionOutput }).decide
    if (typeof decide === 'function') {
      return decide(input)
    }
  } catch {
    // Fall back to the local minimal implementation during incremental recovery.
  }

  return decideLocally(input)
}

export function decide(input: DecideInput): FlowMindDecisionOutput {
  // Synchronous wrapper required by current orchestrator call sites.
  // Prefer the compiled engine when available via a cached dynamic import path would require async plumbing,
  // so the sync entrypoint uses the local real fallback logic.
  return decideLocally(input)
}
