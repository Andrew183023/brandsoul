import type { EntityProfile } from '../../brain/domain/entity/contracts/EntityProfile.js'
import type { StoredEntityProfile } from '../../domain/entityProfile.js'
import type { EntityRepository } from '../../repositories/entityRepository.js'
import { getInstitutionalSovereignMutationGate } from '../../sovereignty/institutionalSovereignMutationGate.js'
import { ensureCanonicalEntityIdentity } from './entityIdentityBuilder.js'

export type CanonicalEntityIdentityBackfillMode = 'dry_run' | 'apply'

export type CanonicalEntityIdentityBackfillConflict = {
  entityId: string
  ownerUserId?: number
  ownerTenantId?: number
  reason: 'existing_canonical_identity_diverged'
  mismatchFields: string[]
}

export type CanonicalEntityIdentityBackfillReport = {
  mode: CanonicalEntityIdentityBackfillMode
  startedAt: string
  finishedAt: string
  scanned: number
  backfilled: number
  skipped: number
  conflicts: number
  conflictDetails: CanonicalEntityIdentityBackfillConflict[]
}

type CreateCanonicalEntityIdentityBackfillServiceOptions = {
  repository: EntityRepository
  now?: () => string
  pageSize?: number
}

function compareCanonicalIdentity(
  existing: NonNullable<EntityProfile['canonicalIdentity']>,
  reconstructed: NonNullable<EntityProfile['canonicalIdentity']>,
) {
  const mismatches: string[] = []

  if (existing.identity.entityId !== reconstructed.identity.entityId) {
    mismatches.push('entityId')
  }
  if (existing.identity.entityType !== reconstructed.identity.entityType) {
    mismatches.push('entityType')
  }
  if (existing.identity.canonicalName !== reconstructed.identity.canonicalName) {
    mismatches.push('canonicalName')
  }
  if (existing.identity.canonicalSlug !== reconstructed.identity.canonicalSlug) {
    mismatches.push('canonicalSlug')
  }
  if (existing.identity.genesisFingerprint !== reconstructed.identity.genesisFingerprint) {
    mismatches.push('genesisFingerprint')
  }

  return mismatches
}

export class CanonicalEntityIdentityBackfillService {
  private readonly pageSize: number

  constructor(private readonly options: CreateCanonicalEntityIdentityBackfillServiceOptions) {
    this.pageSize = Math.max(1, Math.trunc(options.pageSize ?? 100))
  }

  private buildCanonicalProfile(record: StoredEntityProfile<EntityProfile>) {
    return ensureCanonicalEntityIdentity(record.entityProfile, {
      tenantId: record.ownerTenantId,
      createdAt: record.createdAt,
      preserveEntityId: record.id,
    })
  }

  async run(mode: CanonicalEntityIdentityBackfillMode): Promise<CanonicalEntityIdentityBackfillReport> {
    const startedAt = this.options.now?.() ?? new Date().toISOString()
    const total = await this.options.repository.countEntities()
    const report: CanonicalEntityIdentityBackfillReport = {
      mode,
      startedAt,
      finishedAt: startedAt,
      scanned: 0,
      backfilled: 0,
      skipped: 0,
      conflicts: 0,
      conflictDetails: [],
    }

    let offset = 0
    while (offset < total) {
      const records = await this.options.repository.listEntitiesPage<EntityProfile>({
        limit: this.pageSize,
        offset,
      })
      if (records.length === 0) {
        break
      }

      for (const record of records) {
        report.scanned += 1
        const reconstructed = this.buildCanonicalProfile(record)
        const existingCanonical = record.entityProfile.canonicalIdentity

        if (existingCanonical) {
          const mismatchFields = compareCanonicalIdentity(existingCanonical, reconstructed.canonicalIdentity!)
          if (mismatchFields.length > 0) {
            report.conflicts += 1
            report.conflictDetails.push({
              entityId: record.id,
              ownerUserId: record.ownerUserId,
              ownerTenantId: record.ownerTenantId,
              reason: 'existing_canonical_identity_diverged',
              mismatchFields,
            })
            continue
          }

          report.skipped += 1
          continue
        }

        if (mode === 'apply') {
          await getInstitutionalSovereignMutationGate().evaluateAndExecute({
            authoritySource: 'backend/src/entities/identity/canonicalEntityIdentityBackfillService.ts#run',
            context: {
              mutationType: 'canonical.entity.identity.backfill',
              mutationScope: 'entity',
              requestedCapability: 'orchestrator.command.execute',
              runtimeMode: 'normal',
              continuityMode: 'institutional_safe',
              replayVerificationState: 'verified',
              attestationIntegrity: 'verified',
              recoveryRequired: false,
              actor: 'recovery',
              traceId: `canonical-backfill:${record.id}`,
            },
            work: () => this.options.repository.updateEntity({
              id: record.id,
              entityProfile: reconstructed,
              updatedAt: this.options.now?.() ?? new Date().toISOString(),
            }),
          })
        }

        report.backfilled += 1
      }

      offset += records.length
    }

    report.finishedAt = this.options.now?.() ?? new Date().toISOString()
    return report
  }
}

export function createCanonicalEntityIdentityBackfillService(options: CreateCanonicalEntityIdentityBackfillServiceOptions) {
  return new CanonicalEntityIdentityBackfillService(options)
}
