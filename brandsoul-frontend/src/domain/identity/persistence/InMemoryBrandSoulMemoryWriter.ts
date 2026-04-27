import type { BrandSoulMemoryPersistenceRecord } from './BrandSoulMemoryPersistenceRecord'
import type { BrandSoulMemoryWriteRequest, BrandSoulMemoryWriteResult, BrandSoulMemoryWriter } from './BrandSoulMemoryWriter'

export type BrandSoulSemanticSimilarityMatch = {
  subjectMatched: boolean
  signalMatched: boolean
  contextKeyMatched: boolean
  sharedAttributes: string[]
}

export type BrandSoulSemanticMergeAuditEvent = {
  originalMemoryId: string
  mergedIntoMemoryId: string
  reason: string
  similarityMatch: BrandSoulSemanticSimilarityMatch
}

function cloneRecord(record: BrandSoulMemoryPersistenceRecord): BrandSoulMemoryPersistenceRecord {
  return {
    ...record,
    attributes: structuredClone(record.attributes),
    tags: [...record.tags],
  }
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeAttributeValue(value: unknown): string {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (typeof value === 'string') {
    return normalizeText(value)
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => normalizeAttributeValue(item)).sort())
  }

  if (typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => [key, normalizeAttributeValue(entryValue)])

    return JSON.stringify(sortedEntries)
  }

  return String(value)
}

function hasConflictingSharedAttributes(left: BrandSoulMemoryPersistenceRecord, right: BrandSoulMemoryPersistenceRecord) {
  const leftKeys = Object.keys(left.attributes)
  const rightKeys = new Set(Object.keys(right.attributes))

  for (const key of leftKeys) {
    if (!rightKeys.has(key)) {
      continue
    }

    if (normalizeAttributeValue(left.attributes[key]) !== normalizeAttributeValue(right.attributes[key])) {
      return true
    }
  }

  return false
}

function hasEquivalentSharedAttributes(left: BrandSoulMemoryPersistenceRecord, right: BrandSoulMemoryPersistenceRecord) {
  const leftKeys = Object.keys(left.attributes)
  const rightKeys = new Set(Object.keys(right.attributes))
  const equivalentSharedAttributes: string[] = []

  for (const key of leftKeys) {
    if (!rightKeys.has(key)) {
      continue
    }

    if (normalizeAttributeValue(left.attributes[key]) === normalizeAttributeValue(right.attributes[key])) {
      equivalentSharedAttributes.push(key)
    }
  }

  return equivalentSharedAttributes
}

function buildSimilarityMatch(left: BrandSoulMemoryPersistenceRecord, right: BrandSoulMemoryPersistenceRecord) {
  const subjectMatched = normalizeText(left.subject) === normalizeText(right.subject)
  const signalMatched = normalizeText(left.signal) === normalizeText(right.signal)
  const conflictingSharedAttributes = hasConflictingSharedAttributes(left, right)

  const leftContextKey = left.contextKey ? normalizeText(left.contextKey) : undefined
  const rightContextKey = right.contextKey ? normalizeText(right.contextKey) : undefined
  const contextKeyMatched = Boolean(leftContextKey && rightContextKey && leftContextKey === rightContextKey)
  const sharedAttributes = conflictingSharedAttributes ? [] : hasEquivalentSharedAttributes(left, right)

  return {
    subjectMatched,
    signalMatched,
    contextKeyMatched,
    sharedAttributes,
  } satisfies BrandSoulSemanticSimilarityMatch
}

function resolveMergeReason(similarityMatch: BrandSoulSemanticSimilarityMatch) {
  if (similarityMatch.contextKeyMatched && similarityMatch.sharedAttributes.length > 0) {
    return `same subject and signal, same context key, shared attributes: ${similarityMatch.sharedAttributes.join(', ')}`
  }

  if (similarityMatch.contextKeyMatched) {
    return 'same subject and signal within the same context key'
  }

  return `same subject and signal with shared attributes: ${similarityMatch.sharedAttributes.join(', ')}`
}

function resolveSemanticMergeAuditEvent(
  existingRecord: BrandSoulMemoryPersistenceRecord,
  incomingRecord: BrandSoulMemoryPersistenceRecord,
) {
  const similarityMatch = buildSimilarityMatch(existingRecord, incomingRecord)

  if (!similarityMatch.subjectMatched || !similarityMatch.signalMatched) {
    return undefined
  }

  if (hasConflictingSharedAttributes(existingRecord, incomingRecord)) {
    return undefined
  }

  if (!similarityMatch.contextKeyMatched && similarityMatch.sharedAttributes.length === 0) {
    return undefined
  }

  return {
    originalMemoryId: incomingRecord.memoryId,
    mergedIntoMemoryId: existingRecord.memoryId,
    reason: resolveMergeReason(similarityMatch),
    similarityMatch,
  } satisfies BrandSoulSemanticMergeAuditEvent
}

function strengthenRelevance(existingScore: number, incomingScore: number) {
  return Math.min(1, Math.max(existingScore, incomingScore) + 0.05)
}

function resolveMostDurableRetentionKind(
  left: BrandSoulMemoryPersistenceRecord['retentionKind'],
  right: BrandSoulMemoryPersistenceRecord['retentionKind'],
) {
  if (left === 'permanent' || right === 'permanent') {
    return 'permanent'
  }

  if (left === 'context-dependent' || right === 'context-dependent') {
    return 'context-dependent'
  }

  return 'expiring'
}

function resolveLaterTimestamp(left: string, right: string) {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right
}

function resolveLaterOptionalTimestamp(left?: string, right?: string) {
  if (!left) {
    return right
  }

  if (!right) {
    return left
  }

  return resolveLaterTimestamp(left, right)
}

function mergeTags(existingTags: string[], incomingTags: string[]) {
  return Array.from(new Set([...existingTags, ...incomingTags]))
}

function mergeRecord(
  existingRecord: BrandSoulMemoryPersistenceRecord,
  incomingRecord: BrandSoulMemoryPersistenceRecord,
): BrandSoulMemoryPersistenceRecord {
  const retentionKind = resolveMostDurableRetentionKind(existingRecord.retentionKind, incomingRecord.retentionKind)

  return {
    ...existingRecord,
    source: existingRecord.source === 'user' || incomingRecord.source !== 'user' ? existingRecord.source : incomingRecord.source,
    attributes: structuredClone({
      ...existingRecord.attributes,
      ...incomingRecord.attributes,
    }),
    tags: mergeTags(existingRecord.tags, incomingRecord.tags),
    contextKey: incomingRecord.contextKey ?? existingRecord.contextKey,
    relevanceScore: strengthenRelevance(existingRecord.relevanceScore, incomingRecord.relevanceScore),
    retentionKind,
    createdAt: resolveLaterTimestamp(existingRecord.createdAt, incomingRecord.createdAt),
    expiresAt: retentionKind === 'permanent' ? undefined : resolveLaterOptionalTimestamp(existingRecord.expiresAt, incomingRecord.expiresAt),
  }
}

export class InMemoryBrandSoulMemoryWriter implements BrandSoulMemoryWriter {
  private readonly records: BrandSoulMemoryPersistenceRecord[] = []
  private readonly semanticMergeAuditLog: BrandSoulSemanticMergeAuditEvent[] = []
  private lastWriteSemanticMergeAuditEvents: BrandSoulSemanticMergeAuditEvent[] = []

  async write(request: BrandSoulMemoryWriteRequest): Promise<BrandSoulMemoryWriteResult> {
    const persistedMemoryIds: string[] = []
    this.lastWriteSemanticMergeAuditEvents = []

    for (const record of request.records) {
      const clonedRecord = cloneRecord(record)
      const existingRecordIndex = this.records.findIndex(
        (storedRecord) => Boolean(resolveSemanticMergeAuditEvent(storedRecord, clonedRecord)),
      )

      if (existingRecordIndex >= 0) {
        const existingRecord = this.records[existingRecordIndex]!
        const semanticMergeAuditEvent = resolveSemanticMergeAuditEvent(existingRecord, clonedRecord)
        const mergedRecord = mergeRecord(existingRecord, clonedRecord)
        this.records[existingRecordIndex] = mergedRecord
        if (semanticMergeAuditEvent) {
          this.semanticMergeAuditLog.push(semanticMergeAuditEvent)
          this.lastWriteSemanticMergeAuditEvents.push(semanticMergeAuditEvent)
        }
        persistedMemoryIds.push(mergedRecord.memoryId)
        continue
      }

      this.records.push(clonedRecord)
      persistedMemoryIds.push(clonedRecord.memoryId)
    }

    return {
      attemptedCount: request.records.length,
      writtenCount: request.records.length,
      skippedCount: 0,
      writtenMemoryIds: persistedMemoryIds,
    }
  }

  getAll() {
    return this.records.map(cloneRecord)
  }

  getByMemoryId(memoryId: string) {
    const matches = this.records.filter((record) => record.memoryId === memoryId)
    return matches.map(cloneRecord)
  }

  getSemanticMergeAuditLog() {
    return this.semanticMergeAuditLog.map((event) => structuredClone(event))
  }

  getLastWriteSemanticMergeAuditEvents() {
    return this.lastWriteSemanticMergeAuditEvents.map((event) => structuredClone(event))
  }

  clear() {
    this.records.length = 0
    this.semanticMergeAuditLog.length = 0
    this.lastWriteSemanticMergeAuditEvents = []
  }
}