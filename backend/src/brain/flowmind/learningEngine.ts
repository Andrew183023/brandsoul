import { normalizeCognitiveInput } from './cognitiveInput.js'

type JsonRecord = Record<string, unknown>

type EntityAction = {
  type: string
  confidence: number
  payload: JsonRecord
}

type DecisionLike = {
  confidence: number
  entityAction?: EntityAction
}

type LearningInput = {
  entity: EntityProfileLike
  decision?: DecisionLike
  action?: EntityAction
  success?: boolean
  userResponse?: 'accepted' | 'completed' | 'returned' | 'dismissed' | 'ignored' | string
  engagementScore?: number
  timeSpentMs?: number
  returnDelayMs?: number
  occurredAt?: string
}

type BindingState = {
  bindingStrength: number
  continuityScore: number
  identityImprintScore: number
  exclusivityScore: number
  attachmentLevel?: string
  lastInteractionAt?: string
  updatedAt?: string
}

type HookLoopState = {
  triggerType?: string
  expectedUserAction?: string
  rewardType?: string
  reinforcementScore: number
  returnProbability: number
  lastTriggeredAt?: string
  updatedAt?: string
}

type BehaviorState = {
  interactionCount: number
  affinityScore: number
  loopStrength: number
  relationshipMode?: string
  engagementLevel?: string
  lastSignal?: {
    type: string
    weight: number
    occurredAt: string
  }
  updatedAt?: string
}

type ProgressionState = {
  level: number
  xp: number
  maturityStage?: string
  evolutionStage?: string
  refinementScore: number
  unlockFlags: string[]
  growthHistory: Array<{
    at: string
    event: string
    deltaXp: number
    note?: string
  }>
  updatedAt?: string
}

type EntityProfileLike = {
  relational: {
    binding: BindingState
    hookLoop: HookLoopState
    behaviorState: BehaviorState
    progression: ProgressionState
  }
  metadata: {
    updatedAt?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type LearningOutcome = {
  entity: EntityProfileLike
  decisionConfidence: number
  impact: {
    xpGranted: number
    bindingEvent: string
    engagementScore: number
    success: boolean
  }
}

type HookSignal =
  | {
      kind: 'trigger'
      triggerType: string
      strength: number
      at: string
    }
  | {
      kind: 'reward'
      rewardType: string
      strength: number
      at: string
    }
  | {
      kind: 'action'
      action: string
      strength: number
      at: string
    }

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function resolveSuccess(input: LearningInput) {
  if (typeof input.success === 'boolean') {
    return input.success
  }

  return input.userResponse === 'accepted' || input.userResponse === 'completed' || input.userResponse === 'returned'
}

function resolveEngagementScore(input: LearningInput) {
  const safeInput = normalizeCognitiveInput({ ...input })
  const responseScore =
    input.userResponse === 'completed'
      ? 0.86
      : input.userResponse === 'accepted'
        ? 0.72
        : input.userResponse === 'returned'
          ? 0.8
          : input.userResponse === 'dismissed'
            ? 0.12
            : input.userResponse === 'ignored'
              ? 0.08
              : 0.34

  const timeScore = input.timeSpentMs ? clamp(input.timeSpentMs / 180_000) : 0
  return clamp(Math.max(safeInput.engagementScore, responseScore, timeScore))
}

function resolveHookSignal(action: EntityAction | undefined, success: boolean, engagementScore: number, at: string): HookSignal {
  if (!success) {
    return {
      kind: 'trigger',
      triggerType: 'prompt',
      strength: Math.max(0.08, engagementScore * 0.22),
      at,
    }
  }

  if (action?.type === 'askQuestion' || action?.type === 'updateMemory') {
    return {
      kind: 'reward',
      rewardType: 'personalization',
      strength: Math.max(0.32, engagementScore),
      at,
    }
  }

  if (action?.type === 'triggerExport' || (action?.type === 'triggerEvent' && action.payload.eventName === 'prepare_share')) {
    return {
      kind: 'reward',
      rewardType: 'social-asset',
      strength: Math.max(0.42, engagementScore),
      at,
    }
  }

  if (action?.type === 'sendMessage') {
    return {
      kind: 'action',
      action: 'reply',
      strength: Math.max(0.28, engagementScore),
      at,
    }
  }

  return {
    kind: 'action',
    action: 'click',
    strength: Math.max(0.24, engagementScore),
    at,
  }
}

function resolveBindingEvent(input: LearningInput, action: EntityAction | undefined, success: boolean) {
  if (!success || input.userResponse === 'ignored' || input.userResponse === 'dismissed') {
    return 'no_interaction'
  }

  if (input.userResponse === 'returned' || typeof input.returnDelayMs === 'number') {
    return 'return.visit'
  }

  if (action?.type === 'triggerExport' || (action?.type === 'triggerEvent' && action.payload.eventName === 'prepare_share')) {
    return 'export.downloaded'
  }

  if (
    action?.type === 'suggestDiscovery' ||
    action?.type === 'suggestProduct' ||
    (action?.type === 'triggerEvent' && action.payload.eventName === 'surface_in_feed')
  ) {
    return 'share.triggered'
  }

  if (input.timeSpentMs && input.timeSpentMs > 20_000) {
    return 'time_spent'
  }

  return 'interaction.message'
}

function resolveXp(action: EntityAction | undefined, success: boolean, engagementScore: number) {
  const base =
    action?.type === 'triggerEvent' || action?.type === 'triggerExport'
      ? 22
      : action?.type === 'suggestProduct' || action?.type === 'suggestDiscovery'
        ? 18
        : action?.type === 'sendMessage'
          ? 16
          : action?.type === 'updateMemory'
            ? 14
            : action?.type === 'askQuestion'
              ? 12
              : 8

  return Math.round(base * (success ? 0.72 + engagementScore * 0.72 : 0.18 + engagementScore * 0.22))
}

function resolveAttachmentLevel(bindingStrength: number) {
  if (bindingStrength >= 0.82) return 'bonded'
  if (bindingStrength >= 0.62) return 'high'
  if (bindingStrength >= 0.34) return 'medium'
  return 'low'
}

function computeBindingStrength(currentStrength: number, delta: number) {
  const current = clamp(currentStrength)

  if (delta < 0) {
    return clamp(current + delta * (0.35 + current * 0.65))
  }

  const remainingCapacity = Math.max(0, 1 - current)
  const slowdown = Math.max(0.16, remainingCapacity ** 1.35)
  return clamp(current + delta * slowdown)
}

function getBindingDelta(event: { name: string; weight?: number; durationMs?: number }) {
  const weight = clamp(event.weight ?? 1)
  const timeFactor = event.durationMs ? clamp(event.durationMs / 180_000, 0, 1.4) : 1

  switch (event.name) {
    case 'interaction.message':
      return 0.055 * weight
    case 'return.visit':
      return 0.11 * weight
    case 'export.downloaded':
      return 0.07 * weight
    case 'share.triggered':
      return 0.09 * weight
    case 'time_spent':
      return 0.026 * weight * timeFactor
    case 'no_interaction':
      return -0.018 * weight
    default:
      return 0
  }
}

function updateBindingFromEvent(binding: BindingState, event: {
  name: string
  timestamp?: string
  weight?: number
  durationMs?: number
  continuityScore?: number
}): BindingState {
  const at = event.timestamp ?? new Date().toISOString()
  const delta = getBindingDelta(event)
  const continuityScore = typeof event.continuityScore === 'number' ? clamp(event.continuityScore) : binding.continuityScore
  const continuityLift = Math.max(0, continuityScore - binding.continuityScore) * 0.12
  const bindingStrength = computeBindingStrength(binding.bindingStrength, delta + continuityLift)
  const positiveDelta = Math.max(0, delta)
  const negativeDelta = Math.min(0, delta)

  return {
    ...binding,
    lastInteractionAt: event.name === 'no_interaction' ? binding.lastInteractionAt : at,
    bindingStrength,
    attachmentLevel: resolveAttachmentLevel(bindingStrength),
    identityImprintScore: clamp(binding.identityImprintScore + positiveDelta * 0.32 + negativeDelta * 0.12),
    continuityScore: clamp(
      Math.max(
        continuityScore,
        binding.continuityScore + (event.name === 'return.visit' ? 0.055 : positiveDelta * 0.22) + negativeDelta * 0.32,
      ),
    ),
    exclusivityScore: clamp(binding.exclusivityScore + (event.name === 'share.triggered' ? 0.022 : positiveDelta * 0.08) + negativeDelta * 0.06),
    updatedAt: at,
  }
}

function resolveRelationshipMode(behaviorState: BehaviorState) {
  if (behaviorState.interactionCount >= 12 && behaviorState.affinityScore >= 0.72) return 'returning'
  if (behaviorState.interactionCount >= 5) return 'active'
  if (behaviorState.interactionCount >= 1) return 'exploring'
  return 'new'
}

function resolveEngagementLevel(behaviorState: BehaviorState) {
  if (behaviorState.affinityScore >= 0.78 || behaviorState.loopStrength >= 0.78) return 'loyal'
  if (behaviorState.affinityScore >= 0.54 || behaviorState.loopStrength >= 0.54) return 'engaged'
  if (behaviorState.affinityScore >= 0.24) return 'warming'
  return 'cold'
}

function updateHookLoop(loop: HookLoopState, signal: HookSignal): HookLoopState {
  const at = signal.at ?? new Date().toISOString()
  const strength = clamp(signal.strength ?? 0.35)
  const reinforcementDelta =
    signal.kind === 'reward' ? strength * 0.12 : signal.kind === 'action' ? strength * 0.08 : strength * 0.035
  const returnDelta =
    signal.kind === 'reward' ? strength * 0.08 : signal.kind === 'action' ? strength * 0.06 : strength * 0.025

  return {
    ...loop,
    triggerType: signal.kind === 'trigger' ? signal.triggerType : loop.triggerType,
    expectedUserAction: signal.kind === 'action' ? signal.action : loop.expectedUserAction,
    rewardType: signal.kind === 'reward' ? signal.rewardType : loop.rewardType,
    reinforcementScore: clamp(loop.reinforcementScore + reinforcementDelta),
    returnProbability: clamp(loop.returnProbability + returnDelta),
    lastTriggeredAt: signal.kind === 'trigger' ? at : loop.lastTriggeredAt,
    updatedAt: at,
  }
}

function updateBehaviorFromHookLoop(behaviorState: BehaviorState, loop: HookLoopState, signal: HookSignal): BehaviorState {
  const at = signal.at ?? new Date().toISOString()
  const weight = clamp(signal.strength ?? 0.35)

  const nextState: BehaviorState = {
    ...behaviorState,
    interactionCount: behaviorState.interactionCount + (signal.kind === 'action' ? 1 : 0),
    affinityScore: clamp(
      behaviorState.affinityScore +
        (signal.kind === 'reward' ? weight * 0.08 : signal.kind === 'action' ? weight * 0.05 : weight * 0.02),
    ),
    loopStrength: clamp(loop.reinforcementScore),
    lastSignal: {
      type: signal.kind === 'action' ? 'click' : signal.kind === 'reward' ? 'conversion' : 'visit',
      weight,
      occurredAt: at,
    },
    updatedAt: at,
  }

  return {
    ...nextState,
    relationshipMode: resolveRelationshipMode(nextState),
    engagementLevel: resolveEngagementLevel(nextState),
  }
}

function applyHookLoopSignalToEntity(entity: EntityProfileLike, signal: HookSignal): EntityProfileLike {
  const hookLoop = updateHookLoop(entity.relational.hookLoop, signal)
  const behaviorState = updateBehaviorFromHookLoop(entity.relational.behaviorState, hookLoop, signal)
  const updatedAt = signal.at ?? new Date().toISOString()

  return {
    ...entity,
    relational: {
      ...entity.relational,
      hookLoop,
      behaviorState,
    },
    metadata: {
      ...entity.metadata,
      updatedAt,
    },
  }
}

const MAX_GROWTH_HISTORY = 24

function resolveLevel(xp: number) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 80)) + 1)
}

function resolveMaturityStage(level: number) {
  if (level >= 12) return 'evolved'
  if (level >= 8) return 'stable'
  if (level >= 5) return 'expressive'
  if (level >= 3) return 'forming'
  return 'seed'
}

function resolveEvolutionStage(args: { unlockFlags: string[]; level: number; refinementScore: number }) {
  if (args.unlockFlags.includes('adaptive-visuals') && args.level >= 10) return 'signature'
  if (args.refinementScore >= 0.72) return 'trusted'
  if (args.unlockFlags.includes('memory-aware-copy')) return 'personalized'
  if (args.level >= 3) return 'learning'
  return 'initial'
}

function resolveUnlocks(progression: ProgressionState, level: number, refinementScore: number) {
  const flags = new Set(progression.unlockFlags)
  if (level >= 2) flags.add('memory-aware-copy')
  if (level >= 4) flags.add('custom-ritual')
  if (level >= 6) flags.add('social-export-pack')
  if (level >= 8 || refinementScore >= 0.68) flags.add('adaptive-visuals')
  if (level >= 10) flags.add('advanced-orchestration')
  return Array.from(flags)
}

function grantEntityXp(progression: ProgressionState, input: {
  amount: number
  event?: string
  note?: string
  at?: string
}): ProgressionState {
  const at = input.at ?? new Date().toISOString()
  const xp = Math.max(0, progression.xp + Math.max(0, input.amount))
  const level = resolveLevel(xp)
  const leveledUp = level > progression.level
  const refinementScore = clamp(progression.refinementScore + input.amount / 2400 + (leveledUp ? 0.03 : 0))
  const unlockFlags = resolveUnlocks(progression, level, refinementScore)
  const growthEntry = {
    at,
    event: leveledUp ? 'level-up' : (input.event ?? 'interaction'),
    deltaXp: Math.max(0, input.amount),
    note: input.note,
  }
  const growthHistory = [growthEntry, ...progression.growthHistory].slice(0, MAX_GROWTH_HISTORY)

  return {
    ...progression,
    level,
    xp,
    maturityStage: resolveMaturityStage(level),
    evolutionStage: resolveEvolutionStage({ level, refinementScore, unlockFlags }),
    refinementScore,
    unlockFlags,
    growthHistory,
    updatedAt: at,
  }
}

function applyProgressionToEntity(entity: EntityProfileLike, input: {
  amount: number
  event?: string
  note?: string
  at?: string
}): EntityProfileLike {
  return {
    ...entity,
    relational: {
      ...entity.relational,
      progression: grantEntityXp(entity.relational.progression, input),
    },
    metadata: {
      ...entity.metadata,
      updatedAt: input.at ?? new Date().toISOString(),
    },
  }
}

function applyNegativeBehaviorFeedback(behaviorState: BehaviorState, at: string): BehaviorState {
  return {
    ...behaviorState,
    affinityScore: clamp(behaviorState.affinityScore - 0.018),
    loopStrength: clamp(behaviorState.loopStrength - 0.014),
    engagementLevel: behaviorState.affinityScore > 0.54 ? behaviorState.engagementLevel : 'warming',
    lastSignal: {
      type: 'click',
      weight: 0.08,
      occurredAt: at,
    },
    updatedAt: at,
  }
}

export function adjustConfidence(
  currentConfidence: number,
  safeInput: {
    success: boolean
    engagementScore: number
    returnDelayMs?: number
  },
) {
  const returnLift =
    typeof safeInput.returnDelayMs === 'number'
      ? clamp(1 - safeInput.returnDelayMs / (1000 * 60 * 60 * 24 * 7)) * 0.08
      : 0

  const delta = safeInput.success
    ? 0.04 + safeInput.engagementScore * 0.08 + returnLift
    : -0.035 - (1 - safeInput.engagementScore) * 0.05

  return clamp(currentConfidence + delta)
}

export function updateDecisionModel(entity: EntityProfileLike, input: LearningInput): LearningOutcome {
  const at = input.occurredAt ?? new Date().toISOString()
  const action = input.action ?? input.decision?.entityAction
  const success = resolveSuccess(input)
  const engagementScore = resolveEngagementScore(input)
  const hookSignal = resolveHookSignal(action, success, engagementScore, at)
  const bindingEvent = resolveBindingEvent(input, action, success)
  const xpGranted = resolveXp(action, success, engagementScore)

  const withLoop = applyHookLoopSignalToEntity(entity, hookSignal)
  const withProgression = applyProgressionToEntity(withLoop, {
    amount: xpGranted,
    event: success ? 'interaction' : 'refined',
    note: success ? 'FlowMind outcome reinforced.' : 'FlowMind outcome weakened confidence.',
    at,
  })

  const durationWeight = input.timeSpentMs ? clamp(input.timeSpentMs / 180_000, 0, 1.2) : undefined
  const returnWeight =
    typeof input.returnDelayMs === 'number'
      ? clamp(1.15 - input.returnDelayMs / (1000 * 60 * 60 * 24 * 7), 0.35, 1.15)
      : undefined

  const binding = updateBindingFromEvent(withProgression.relational.binding, {
    name: bindingEvent,
    timestamp: at,
    weight: returnWeight ?? durationWeight ?? Math.max(0.2, engagementScore),
    durationMs: input.timeSpentMs,
    continuityScore: withProgression.relational.binding.continuityScore,
  })

  const behaviorState = success
    ? withProgression.relational.behaviorState
    : applyNegativeBehaviorFeedback(withProgression.relational.behaviorState, at)

  const updatedEntity: EntityProfileLike = {
    ...withProgression,
    relational: {
      ...withProgression.relational,
      behaviorState,
      binding,
    },
    metadata: {
      ...withProgression.metadata,
      updatedAt: at,
    },
  }

  return {
    entity: updatedEntity,
    decisionConfidence: adjustConfidence(input.decision?.confidence ?? action?.confidence ?? 0.36, {
      success,
      engagementScore,
      returnDelayMs: input.returnDelayMs,
    }),
    impact: {
      xpGranted,
      bindingEvent,
      engagementScore,
      success,
    },
  }
}

export function registerOutcome(input: LearningInput): LearningOutcome {
  return updateDecisionModel(input.entity, input)
}
