const MAX_GROWTH_HISTORY = 24

export type ProgressionGrowthEntry = {
  at: string
  event: string
  deltaXp: number
  note?: string
}

export type ProgressionState = {
  schemaVersion?: number
  level: number
  xp: number
  maturityStage: string
  evolutionStage: string
  refinementScore: number
  unlockFlags: string[]
  growthHistory: ProgressionGrowthEntry[]
  updatedAt?: string
}

export type GrantEntityXpInput = {
  amount: number
  event?: string
  note?: string
  at?: string
}

type EntityProfileLike = {
  relational: {
    progression: ProgressionState
  }
  metadata: {
    updatedAt?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function resolveLevel(xp: number) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 80)) + 1)
}

function resolveMaturityStage(level: number) {
  if (level >= 12) {
    return 'evolved'
  }
  if (level >= 8) {
    return 'stable'
  }
  if (level >= 5) {
    return 'expressive'
  }
  if (level >= 3) {
    return 'forming'
  }
  return 'seed'
}

function resolveEvolutionStage(args: { unlockFlags: string[]; level: number; refinementScore: number }) {
  if (args.unlockFlags.includes('adaptive-visuals') && args.level >= 10) {
    return 'signature'
  }
  if (args.refinementScore >= 0.72) {
    return 'trusted'
  }
  if (args.unlockFlags.includes('memory-aware-copy')) {
    return 'personalized'
  }
  if (args.level >= 3) {
    return 'learning'
  }
  return 'initial'
}

function resolveUnlocks(progression: ProgressionState, level: number, refinementScore: number) {
  const flags = new Set(progression.unlockFlags)

  if (level >= 2) {
    flags.add('memory-aware-copy')
  }
  if (level >= 4) {
    flags.add('custom-ritual')
  }
  if (level >= 6) {
    flags.add('social-export-pack')
  }
  if (level >= 8 || refinementScore >= 0.68) {
    flags.add('adaptive-visuals')
  }
  if (level >= 10) {
    flags.add('advanced-orchestration')
  }

  return Array.from(flags)
}

export function grantEntityXp(progression: ProgressionState, input: GrantEntityXpInput): ProgressionState {
  const at = input.at ?? new Date().toISOString()
  const xp = Math.max(0, progression.xp + Math.max(0, input.amount))
  const level = resolveLevel(xp)
  const leveledUp = level > progression.level
  const refinementScore = clamp(progression.refinementScore + input.amount / 2400 + (leveledUp ? 0.03 : 0))
  const unlockFlags = resolveUnlocks(progression, level, refinementScore)
  const growthEntry: ProgressionGrowthEntry = {
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

export function refineEntityProgression(
  progression: ProgressionState,
  amount: number,
  at = new Date().toISOString(),
): ProgressionState {
  const refinementScore = clamp(progression.refinementScore + amount)
  const unlockFlags = resolveUnlocks(progression, progression.level, refinementScore)

  return {
    ...progression,
    refinementScore,
    unlockFlags,
    evolutionStage: resolveEvolutionStage({ level: progression.level, refinementScore, unlockFlags }),
    growthHistory: [
      {
        at,
        event: 'refined',
        deltaXp: 0,
        note: `Refinement changed by ${amount.toFixed(2)}.`,
      },
      ...progression.growthHistory,
    ].slice(0, MAX_GROWTH_HISTORY),
    updatedAt: at,
  }
}

export function applyProgressionToEntity(entity: EntityProfileLike, input: GrantEntityXpInput): EntityProfileLike {
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
