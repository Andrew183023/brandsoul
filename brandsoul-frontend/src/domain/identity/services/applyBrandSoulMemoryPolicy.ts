import type { BrandSoulContext } from '../contracts/BrandSoulContext'
import type { BrandSoulMemory } from '../contracts/BrandSoulMemory'
import type { BrandSoulMemorySnapshot } from '../contracts/BrandSoulMemorySnapshot'
import type { BrandSoulMemoryPersistenceRecord } from '../persistence/BrandSoulMemoryPersistenceRecord'
import { adaptBrandSoulMemoryToPersistenceRecord } from '../persistence/adaptBrandSoulMemoryToPersistenceRecord'
import { resolveBrandSoulMemoryExpirationPolicy } from './resolveBrandSoulMemoryExpirationPolicy'
import { normalizeBrandSoulMemoryCandidate } from './normalizeBrandSoulMemoryCandidate'
import { evaluateBrandSoulMemoryCandidate, type BrandSoulMemoryCreationRejectionReason } from './shouldCreateMemory'

export type BrandSoulRejectedMemoryPolicyRecord = {
  candidate: BrandSoulMemorySnapshot
  normalizedMemory: BrandSoulMemory
  reasons: BrandSoulMemoryCreationRejectionReason[]
}

export type ApplyBrandSoulMemoryPolicyResult = {
  acceptedMemories: BrandSoulMemory[]
  rejectedMemories: BrandSoulRejectedMemoryPolicyRecord[]
  persistenceRecords: BrandSoulMemoryPersistenceRecord[]
  legacySnapshots: BrandSoulMemorySnapshot[]
}

function snapshotFromMemory(memory: BrandSoulMemory, fallbackValue: BrandSoulMemorySnapshot['value']) {
  return {
    key: memory.id,
    value: fallbackValue,
    type: memory.type,
    relevanceScore: memory.relevanceScore,
    createdAt: memory.createdAt,
  } satisfies BrandSoulMemorySnapshot
}

export function applyBrandSoulMemoryPolicy(
  context: Pick<BrandSoulContext, 'memory'>,
  candidates: BrandSoulMemorySnapshot[],
): ApplyBrandSoulMemoryPolicyResult {
  const existingKeys = new Set(context.memory.map((memory) => memory.key))
  const acceptedMemories: BrandSoulMemory[] = []
  const rejectedMemories: BrandSoulRejectedMemoryPolicyRecord[] = []
  const persistenceRecords: BrandSoulMemoryPersistenceRecord[] = []
  const legacySnapshots: BrandSoulMemorySnapshot[] = []
  const seenKeys = new Set<string>()

  for (const candidate of candidates) {
    const normalizedMemory = normalizeBrandSoulMemoryCandidate(candidate, 'system')
    const duplicateSource = existingKeys.has(candidate.key) ? 'context' : seenKeys.has(candidate.key) ? 'batch' : undefined
    const isDuplicate = Boolean(duplicateSource)
    const contextActive = normalizedMemory.type !== 'contextual' || Boolean(normalizedMemory.content.contextKey)
    const creationDecision = evaluateBrandSoulMemoryCandidate({
      type: normalizedMemory.type,
      source: normalizedMemory.source,
      relevanceScore: normalizedMemory.relevanceScore,
      content: normalizedMemory.content,
      isDuplicate,
      duplicateSource,
      isRawLog: false,
      contextActive,
    })

    if (!creationDecision.accepted) {
      rejectedMemories.push({
        candidate,
        normalizedMemory,
        reasons: creationDecision.reasons,
      })
      continue
    }

    const expirationPolicy = resolveBrandSoulMemoryExpirationPolicy(normalizedMemory)
    const enrichedMemory: BrandSoulMemory = {
      ...normalizedMemory,
      expiresAt: expirationPolicy.expiresAt,
    }

    acceptedMemories.push(enrichedMemory)
    persistenceRecords.push(
      adaptBrandSoulMemoryToPersistenceRecord(enrichedMemory, {
        retentionKind: expirationPolicy.retentionKind,
      }),
    )
    legacySnapshots.push(snapshotFromMemory(enrichedMemory, candidate.value))
    seenKeys.add(candidate.key)
  }

  return {
    acceptedMemories,
    rejectedMemories,
    persistenceRecords,
    legacySnapshots,
  }
}