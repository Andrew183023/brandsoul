import type { JsonObject } from '../domain/entityProfile.js'
import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { UserMemory } from '../brain/domain/entity/contracts/UserMemory.js'
import { buildInitialBindingState, type EntityBindingState } from '../brain/domain/entity/services/bindingEngine.js'
import { buildInitialEntityTimelineLog, updateContinuityScore, type EntityTimelineLog } from '../brain/domain/entity/services/continuityEngine.js'
import type { ProgressionState } from '../brain/domain/entity/services/progressionEngine.js'
import { initializeUserMemory } from '../brain/domain/entity/services/memoryEngine.js'

export type RelationalMemoryState = UserMemory

export type BindingState = EntityBindingState

// Continuity tracks temporal history and revisit depth across official events.
export type ContinuityState = {
  schemaVersion: 1
  timelineLog: EntityTimelineLog
  continuityScore: number
  updatedAt?: string
}

// Progression tracks XP, maturity and unlocked orchestration capabilities.
export type RelationalProgressionState = ProgressionState

export type OrchestratorRelationalState = {
  // Memory stores explicit and inferred user-facing preferences and interactions.
  memory: RelationalMemoryState
  // Binding stores attachment strength and relationship intensity.
  binding: BindingState
  continuity: ContinuityState
  progression: RelationalProgressionState
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function normalizeBindingState(value: unknown, fallback: EntityBindingState, now: string): EntityBindingState {
  if (!isPlainObject(value)) {
    return fallback
  }

  return {
    ...fallback,
    ownerId: readString(value.ownerId) ?? fallback.ownerId,
    createdAt: readString(value.createdAt) ?? fallback.createdAt,
    bindingStrength: readNumber(value.bindingStrength, fallback.bindingStrength),
    attachmentLevel: (readString(value.attachmentLevel) as EntityBindingState['attachmentLevel'] | undefined) ?? fallback.attachmentLevel,
    identityImprintScore: readNumber(value.identityImprintScore, fallback.identityImprintScore),
    continuityScore: readNumber(value.continuityScore, fallback.continuityScore),
    exclusivityScore: readNumber(value.exclusivityScore, fallback.exclusivityScore),
    lastInteractionAt: readString(value.lastInteractionAt) ?? fallback.lastInteractionAt,
    updatedAt: readString(value.updatedAt) ?? now,
  }
}

function normalizeTimelineLog(value: unknown, fallback: EntityTimelineLog, now: string): EntityTimelineLog {
  if (!isPlainObject(value)) {
    return fallback
  }

  const entries = Array.isArray(value.entries)
    ? value.entries
      .filter(isPlainObject)
      .map((entry, index) => ({
        id: readString(entry.id) ?? `timeline-entry-${index}`,
        type: readString(entry.type) ?? 'created',
        occurredAt: readString(entry.occurredAt) ?? now,
        summary: readString(entry.summary) ?? 'Entity event recorded.',
        weight: readNumber(entry.weight, 0),
        sourceEventId: readString(entry.sourceEventId),
      }))
    : fallback.entries

  return {
    ...fallback,
    schemaVersion: 1,
    firstSeenAt: readString(value.firstSeenAt) ?? fallback.firstSeenAt,
    lastEventAt: readString(value.lastEventAt) ?? fallback.lastEventAt,
    totalActiveMs: readNumber(value.totalActiveMs, fallback.totalActiveMs),
    returnCount: readNumber(value.returnCount, fallback.returnCount),
    interactionDiversity: readNumber(value.interactionDiversity, fallback.interactionDiversity),
    updatedAt: readString(value.updatedAt) ?? now,
    entries,
  }
}

function normalizeProgressionState(value: unknown, fallback: ProgressionState, now: string): ProgressionState {
  if (!isPlainObject(value)) {
    return fallback
  }

  const growthHistory = Array.isArray(value.growthHistory)
    ? value.growthHistory
      .filter(isPlainObject)
      .map((entry) => ({
        at: readString(entry.at) ?? now,
        event: readString(entry.event) ?? 'interaction',
        deltaXp: readNumber(entry.deltaXp, 0),
        note: readString(entry.note),
      }))
    : fallback.growthHistory

  return {
    ...fallback,
    schemaVersion: readNumber(value.schemaVersion, fallback.schemaVersion ?? 1),
    level: readNumber(value.level, fallback.level),
    xp: readNumber(value.xp, fallback.xp),
    maturityStage: readString(value.maturityStage) ?? fallback.maturityStage,
    evolutionStage: readString(value.evolutionStage) ?? fallback.evolutionStage,
    refinementScore: readNumber(value.refinementScore, fallback.refinementScore),
    unlockFlags: readStringArray(value.unlockFlags),
    growthHistory,
    updatedAt: readString(value.updatedAt) ?? fallback.updatedAt ?? now,
  }
}

function buildInitialProgressionState(now: string): ProgressionState {
  return {
    schemaVersion: 1,
    level: 1,
    xp: 0,
    maturityStage: 'seed',
    evolutionStage: 'initial',
    refinementScore: 0.24,
    unlockFlags: [],
    growthHistory: [
      {
        at: now,
        event: 'created',
        deltaXp: 0,
        note: 'Orchestrator relational state initialized.',
      },
    ],
    updatedAt: now,
  }
}

export function buildInitialRelationalState(args?: {
  entityProfile?: EntityProfile
  ownerId?: string
  now?: string
}): OrchestratorRelationalState {
  const now = args?.now ?? new Date().toISOString()
  const memory = args?.entityProfile?.relational.userMemory ?? initializeUserMemory()
  const bindingFallback = buildInitialBindingState({
    ownerId: args?.ownerId ?? args?.entityProfile?.ownerId,
    manifestation: args?.entityProfile?.manifestation,
    createdAt: now,
  })
  const binding = normalizeBindingState(args?.entityProfile?.relational.binding, bindingFallback, now)
  const timelineLog = normalizeTimelineLog(args?.entityProfile?.relational.timelineLog, buildInitialEntityTimelineLog(now), now)
  const continuityScore = Math.max(binding.continuityScore, updateContinuityScore(timelineLog))
  const progression = normalizeProgressionState(args?.entityProfile?.relational.progression, buildInitialProgressionState(now), now)

  return {
    memory,
    binding: {
      ...binding,
      continuityScore,
      updatedAt: binding.updatedAt ?? now,
    },
    continuity: {
      schemaVersion: 1,
      timelineLog,
      continuityScore,
      updatedAt: timelineLog.updatedAt ?? now,
    },
    progression,
  }
}

export function restoreRelationalState(args: {
  snapshot?: JsonObject
  entityProfile?: EntityProfile
  ownerId?: string
  now?: string
}): OrchestratorRelationalState {
  const fallback = buildInitialRelationalState({
    entityProfile: args.entityProfile,
    ownerId: args.ownerId,
    now: args.now,
  })

  if (!isPlainObject(args.snapshot)) {
    return fallback
  }

  const memory = isPlainObject(args.snapshot.memory) ? (args.snapshot.memory as unknown as RelationalMemoryState) : fallback.memory
  const binding = normalizeBindingState(args.snapshot.binding, fallback.binding, args.now ?? fallback.binding.updatedAt)
  const continuity = isPlainObject(args.snapshot.continuity)
    ? {
      schemaVersion: 1,
      timelineLog: normalizeTimelineLog(
        args.snapshot.continuity.timelineLog,
        fallback.continuity.timelineLog,
        args.now ?? fallback.continuity.timelineLog.updatedAt,
      ),
      continuityScore: readNumber(args.snapshot.continuity.continuityScore, fallback.continuity.continuityScore),
      updatedAt: readString(args.snapshot.continuity.updatedAt) ?? fallback.continuity.updatedAt,
    }
    : fallback.continuity
  const progression = normalizeProgressionState(
    args.snapshot.progression,
    fallback.progression,
    args.now ?? fallback.progression.updatedAt ?? new Date().toISOString(),
  )
  const continuityScore = Math.max(
    typeof continuity.continuityScore === 'number' ? continuity.continuityScore : 0,
    typeof binding.continuityScore === 'number' ? binding.continuityScore : 0,
  )

  return {
    memory,
    binding: {
      ...binding,
      continuityScore,
    },
    continuity: {
      schemaVersion: 1,
      timelineLog: continuity.timelineLog,
      continuityScore,
      updatedAt: continuity.updatedAt,
    },
    progression,
  }
}

export function serializeRelationalState(state: OrchestratorRelationalState): JsonObject {
  return {
    memory: state.memory as unknown as JsonObject,
    binding: state.binding as unknown as JsonObject,
    continuity: state.continuity as unknown as JsonObject,
    progression: state.progression as unknown as JsonObject,
  }
}

export function applyRelationalStateToEntityProfile(entityProfile: EntityProfile, relationalState: OrchestratorRelationalState, updatedAt: string): EntityProfile {
  return {
    ...entityProfile,
    relational: {
      ...entityProfile.relational,
      userMemory: relationalState.memory,
      binding: relationalState.binding,
      timelineLog: relationalState.continuity.timelineLog,
      progression: relationalState.progression,
    },
    metadata: {
      ...entityProfile.metadata,
      updatedAt,
    },
  }
}