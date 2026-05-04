type JsonRecord = Record<string, unknown>

type EventRecord = {
  type: string
}

type ExportRecord = {
  fileUrl?: string
}

type PublicProfile = {
  schemaVersion: 1
  entityId: string
  name: string
  species: string
  avatarExportRef?: string
  tagline?: string
  behaviorTone?: string
  evolutionLevel: number
  trustScore: number
  lastActiveAt?: string
  publicStats: {
    interactions: number
    exports: number
    shares: number
    returns: number
  }
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback
}

function countEvents(events: EventRecord[], type: string): number {
  return events.filter((event) => event.type === type).length
}

export function mapEntityProfileToPublicProfile(args: {
  entity: JsonRecord
  events?: EventRecord[]
  exports?: ExportRecord[]
}): PublicProfile {
  const entity = args.entity
  const social = asRecord(entity.social)
  const finalForm = asRecord(entity.finalForm)
  const identity = asRecord(finalForm.identity)
  const relational = asRecord(entity.relational)
  const behaviorState = asRecord(relational.behaviorState)
  const progression = asRecord(relational.progression)
  const binding = asRecord(relational.binding)
  const userMemory = asRecord(relational.userMemory)
  const timelineLog = asRecord(relational.timelineLog)
  const exports = args.exports ?? []
  const events = args.events ?? []

  const name =
    readString(identity.name) ??
    readString(social.publicName) ??
    readString(entity.id) ??
    'Unknown Entity'

  const avatarExportRef = exports[0]?.fileUrl ?? undefined
  const interactions =
    countEvents(events, 'interaction.message') +
    countEvents(events, 'interaction.reply') +
    countEvents(events, 'interaction.click')
  const exportCount = exports.length || countEvents(events, 'export.downloaded')
  const shares = countEvents(events, 'share.triggered')
  const returns = countEvents(events, 'return.visit')
  const trustScore = Math.min(
    1,
    readNumber(binding.bindingStrength) * 0.45 +
      readNumber(userMemory.memoryConfidence) * 0.25 +
      readNumber(behaviorState.affinityScore) * 0.2 +
      Math.min(returns, 5) * 0.02,
  )

  return {
    schemaVersion: 1,
    entityId: String(entity.id),
    name,
    species: readString(asRecord(entity.manifestation).mode) ?? 'unknown',
    avatarExportRef,
    tagline:
      readString(identity.socialLine) ??
      readString(identity.openingLine) ??
      readString(identity.manifesto),
    behaviorTone:
      readString(behaviorState.behavioralTemperature) ??
      readString(asRecord(entity.context).languageStyle),
    evolutionLevel: readNumber(progression.level),
    trustScore,
    lastActiveAt:
      readString(userMemory.lastActiveAt) ??
      readString(timelineLog.lastEventAt) ??
      readString(asRecord(entity.metadata).updatedAt),
    publicStats: {
      interactions,
      exports: exportCount,
      shares,
      returns,
    },
  }
}
