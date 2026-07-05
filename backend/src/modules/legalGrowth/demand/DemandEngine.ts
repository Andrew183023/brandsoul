import type { ObservabilityService } from '../../../services/observabilityService.js'
import type { CaseRecord } from '../../legalCases/caseTypes.js'
import type { GrowthContext } from '../GrowthContext.js'
import type { GrowthEvidence } from '../GrowthEvidence.js'
import { createGrowthMetrics } from '../GrowthMetrics.js'
import type { GrowthMetricTrend } from '../GrowthTypes.js'
import type { DemandAggregateBucket, DemandEngineInput } from './DemandTypes.js'
import type { DemandEngineResult, DemandProjectionItem } from './DemandProjection.js'

function normalizeText(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : undefined
}

function normalizeCity(legalCase: CaseRecord) {
  return normalizeText(legalCase.clientCanonicalCity)
    ?? normalizeText(legalCase.clientDisplayCity)
    ?? normalizeText(legalCase.clientSearchKey)
    ?? 'unknown'
}

function normalizeSpecialty(legalCase: CaseRecord) {
  return normalizeText(legalCase.practiceArea) ?? 'unknown'
}

function normalizeOrigin(legalCase: CaseRecord) {
  return normalizeText(legalCase.source) ?? 'unknown'
}

function isClosedStatus(status: CaseRecord['status']) {
  return status === 'resolved' || status === 'closed' || status === 'archived'
}

function isBacklogStatus(status: CaseRecord['status']) {
  return !isClosedStatus(status)
}

function parseTimestamp(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isWithinPeriod(timestamp: string, startsAtMs: number, endsAtMs: number) {
  const timestampMs = parseTimestamp(timestamp)
  return timestampMs !== null && timestampMs >= startsAtMs && timestampMs <= endsAtMs
}

function buildPreviousPeriod(period: GrowthContext['period']) {
  const startsAtMs = Date.parse(period.startsAt)
  const endsAtMs = Date.parse(period.endsAt)
  const durationMs = endsAtMs - startsAtMs

  return {
    startsAtMs: startsAtMs - durationMs - 1,
    endsAtMs: startsAtMs - 1,
  }
}

function buildBucketId(bucket: Pick<DemandAggregateBucket, 'tenantId' | 'officeId' | 'city' | 'specialty' | 'origin'>) {
  return [
    bucket.tenantId,
    bucket.officeId,
    bucket.city,
    bucket.specialty,
    bucket.origin,
  ].join(':')
}

function buildBucketKey(bucket: Pick<DemandAggregateBucket, 'officeId' | 'city' | 'specialty' | 'origin'>) {
  return [
    bucket.officeId,
    bucket.city,
    bucket.specialty,
    bucket.origin,
  ].join('|')
}

function createEmptyBucket(input: {
  tenantId: number
  officeId: string
  period: GrowthContext['period']
  city: string
  specialty: string
  origin: string
}): DemandAggregateBucket {
  return {
    tenantId: input.tenantId,
    officeId: input.officeId,
    period: input.period,
    city: input.city,
    specialty: input.specialty,
    origin: input.origin,
    caseIds: [],
    casesCount: 0,
    leadsCount: 0,
    backlogCount: 0,
    closedCasesCount: 0,
    resolutionHoursTotal: 0,
  }
}

function resolveResolutionHours(legalCase: CaseRecord) {
  if (!legalCase.closedAt) {
    return null
  }

  const openedAtMs = parseTimestamp(legalCase.openedAt)
  const closedAtMs = parseTimestamp(legalCase.closedAt)
  if (openedAtMs === null || closedAtMs === null || closedAtMs < openedAtMs) {
    return null
  }

  return (closedAtMs - openedAtMs) / (1000 * 60 * 60)
}

function buildTrend(currentCasesCount: number, previousCasesCount: number): GrowthMetricTrend {
  if (previousCasesCount < 0) {
    return 'unknown'
  }

  if (currentCasesCount > previousCasesCount) {
    return 'up'
  }

  if (currentCasesCount < previousCasesCount) {
    return 'down'
  }

  return 'stable'
}

function buildEvidenceForItem(item: DemandProjectionItem, generatedAt: string): GrowthEvidence[] {
  const aggregateDescription = `Demanda agregada em ${item.city} / ${item.specialty} com ${item.casesCount} caso(s) no periodo.`

  return [
    {
      id: `${item.id}:cases`,
      type: 'case_signal',
      source: 'legal_cases',
      description: aggregateDescription,
      weight: 1,
      period: item.period,
      city: item.city,
      specialty: item.specialty,
      metric: 'cases_count',
      value: item.casesCount,
      createdAt: generatedAt,
    },
    {
      id: `${item.id}:backlog`,
      type: 'derived_metric',
      source: 'legal_cases',
      description: `Backlog atual de ${item.backlogCount} caso(s) para ${item.city} / ${item.specialty}.`,
      weight: 0.75,
      period: item.period,
      city: item.city,
      specialty: item.specialty,
      metric: 'backlog_count',
      value: item.backlogCount,
      createdAt: generatedAt,
    },
  ]
}

function buildProjectionItems(args: {
  input: DemandEngineInput
  generatedAt: string
  currentBuckets: Map<string, DemandAggregateBucket>
  previousCounts: Map<string, number>
}): DemandEngineResult {
  const items: DemandProjectionItem[] = []
  const evidence: GrowthEvidence[] = []

  for (const bucket of args.currentBuckets.values()) {
    const previousCasesCount = args.previousCounts.get(buildBucketKey(bucket)) ?? -1
    const averageResolutionHours = bucket.closedCasesCount > 0
      ? Number((bucket.resolutionHoursTotal / bucket.closedCasesCount).toFixed(2))
      : null
    const leadsCount = bucket.leadsCount
    const conversionRate = leadsCount > 0
      ? Number((bucket.casesCount / leadsCount).toFixed(4))
      : 0
    const slaRiskScore = bucket.casesCount > 0
      ? Number(((bucket.backlogCount / bucket.casesCount) * 100).toFixed(2))
      : 0
    const item: DemandProjectionItem = {
      id: buildBucketId(bucket),
      officeId: bucket.officeId,
      tenantId: bucket.tenantId,
      period: bucket.period,
      city: bucket.city,
      specialty: bucket.specialty,
      origin: bucket.origin,
      casesCount: bucket.casesCount,
      leadsCount,
      conversionRate,
      backlogCount: bucket.backlogCount,
      averageResolutionHours,
      slaRiskScore,
      score: bucket.casesCount,
      trend: buildTrend(bucket.casesCount, previousCasesCount),
      evidenceIds: [],
    }

    const itemEvidence = buildEvidenceForItem(item, args.generatedAt)
    item.evidenceIds = itemEvidence.map((entry) => entry.id)
    items.push(item)
    evidence.push(...itemEvidence)
  }

  items.sort((left, right) => {
    if (left.city !== right.city) {
      return left.city.localeCompare(right.city, 'pt-BR')
    }
    if (left.specialty !== right.specialty) {
      return left.specialty.localeCompare(right.specialty, 'pt-BR')
    }
    return left.origin.localeCompare(right.origin, 'pt-BR')
  })

  return {
    projection: { items },
    evidence,
  }
}

function accumulateCases(args: {
  input: DemandEngineInput
  currentBuckets: Map<string, DemandAggregateBucket>
  previousCounts: Map<string, number>
}) {
  const startsAtMs = Date.parse(args.input.period.startsAt)
  const endsAtMs = Date.parse(args.input.period.endsAt)
  const previousPeriod = buildPreviousPeriod(args.input.period)

  for (const legalCase of args.input.cases) {
    if (legalCase.status === 'archived') {
      continue
    }
    if (legalCase.entityId && legalCase.entityId !== args.input.officeId) {
      continue
    }

    const city = normalizeCity(legalCase)
    const specialty = normalizeSpecialty(legalCase)
    const origin = normalizeOrigin(legalCase)
    const bucketKey = buildBucketKey({
      officeId: args.input.officeId,
      city,
      specialty,
      origin,
    })

    if (isWithinPeriod(legalCase.openedAt, startsAtMs, endsAtMs)) {
      const currentBucket = args.currentBuckets.get(bucketKey) ?? createEmptyBucket({
        tenantId: args.input.tenantId,
        officeId: args.input.officeId,
        period: args.input.period,
        city,
        specialty,
        origin,
      })

      currentBucket.caseIds.push(legalCase.id)
      currentBucket.casesCount += 1
      currentBucket.leadsCount += 1
      if (isBacklogStatus(legalCase.status)) {
        currentBucket.backlogCount += 1
      }
      if (isClosedStatus(legalCase.status)) {
        const resolutionHours = resolveResolutionHours(legalCase)
        if (resolutionHours !== null) {
          currentBucket.closedCasesCount += 1
          currentBucket.resolutionHoursTotal += resolutionHours
        }
      }

      args.currentBuckets.set(bucketKey, currentBucket)
      continue
    }

    if (isWithinPeriod(legalCase.openedAt, previousPeriod.startsAtMs, previousPeriod.endsAtMs)) {
      args.previousCounts.set(bucketKey, (args.previousCounts.get(bucketKey) ?? 0) + 1)
    }
  }
}

export function buildDemandProjection(input: DemandEngineInput): DemandEngineResult {
  const currentBuckets = new Map<string, DemandAggregateBucket>()
  const previousCounts = new Map<string, number>()

  accumulateCases({
    input,
    currentBuckets,
    previousCounts,
  })

  return buildProjectionItems({
    input,
    generatedAt: input.period.endsAt,
    currentBuckets,
    previousCounts,
  })
}

export class DemandEngine {
  private readonly metrics

  constructor(observability?: ObservabilityService) {
    this.metrics = createGrowthMetrics(observability)
  }

  build(context: Pick<GrowthContext, 'officeId' | 'tenantId' | 'period' | 'cases'>): DemandEngineResult {
    const startedAt = Date.now()

    try {
      const result = buildDemandProjection({
        officeId: context.officeId,
        tenantId: context.tenantId,
        period: context.period,
        cases: context.cases ?? [],
      })

      this.metrics.recordDemandProjectionTiming({
        tenantId: context.tenantId,
        officeId: context.officeId,
        durationMs: Date.now() - startedAt,
      })

      return result
    } catch (error) {
      this.metrics.recordDemandProjectionTiming({
        tenantId: context.tenantId,
        officeId: context.officeId,
        durationMs: Date.now() - startedAt,
        result: 'failed',
      })
      throw error
    }
  }
}

export function createDemandEngine(observability?: ObservabilityService) {
  return new DemandEngine(observability)
}
