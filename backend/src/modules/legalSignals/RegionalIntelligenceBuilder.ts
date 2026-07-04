import type {
  OperationalSnapshotCaseInput,
  OperationalSnapshotDistribution,
} from './OperationalSnapshot.js'
import type {
  RegionalIntelligenceBuildInput,
  RegionalProjection,
} from './RegionalIntelligence.js'

type RegionalAccumulator = {
  tenantId: number
  entityId: string
  city: string
  totalCases: number
  openCases: number
  closedCases: number
  backlog: number
  activeProfessionals: Set<string>
  resolutionHours: number[]
  firstResponseMinutes: number[]
  slaWarningCases: number
  slaBreachedCases: number
  practiceAreas: OperationalSnapshotDistribution
  generatedAt: string
}

function normalizeKey(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function isClosedCase(legalCase: OperationalSnapshotCaseInput) {
  return legalCase.status === 'closed' || legalCase.status === 'resolved'
}

function isFiniteMetric(value?: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100
}

function average(values: number[]) {
  if (values.length === 0) {
    return null
  }

  return roundMetric(values.reduce((total, current) => total + current, 0) / values.length)
}

function compareRegionalProjection(left: RegionalProjection, right: RegionalProjection) {
  if (left.city !== right.city) {
    return left.city.localeCompare(right.city)
  }

  if (left.totalCases !== right.totalCases) {
    return right.totalCases - left.totalCases
  }

  return left.generatedAt.localeCompare(right.generatedAt)
}

function createAccumulator(input: RegionalIntelligenceBuildInput, city: string): RegionalAccumulator {
  return {
    tenantId: input.snapshot.tenantId,
    entityId: input.snapshot.entityId,
    city,
    totalCases: 0,
    openCases: 0,
    closedCases: 0,
    backlog: 0,
    activeProfessionals: new Set<string>(),
    resolutionHours: [],
    firstResponseMinutes: [],
    slaWarningCases: 0,
    slaBreachedCases: 0,
    practiceAreas: {},
    generatedAt: input.snapshot.builtAt,
  }
}

export function buildRegionalProjections(input: RegionalIntelligenceBuildInput): RegionalProjection[] {
  const grouped = new Map<string, RegionalAccumulator>()

  for (const legalCase of input.cases) {
    const city = normalizeKey(legalCase.city)
    if (!city) {
      continue
    }

    const current = grouped.get(city) ?? createAccumulator(input, city)
    const closed = isClosedCase(legalCase)
    const practiceArea = normalizeKey(legalCase.practiceArea)
    const assignedProfessionalId = normalizeKey(legalCase.assignedProfessionalId)

    current.totalCases += 1
    if (closed) {
      current.closedCases += 1
    } else {
      current.openCases += 1
      current.backlog += 1
      if (assignedProfessionalId) {
        current.activeProfessionals.add(assignedProfessionalId)
      }
      if (legalCase.slaStatus === 'warning') {
        current.slaWarningCases += 1
      }
      if (legalCase.slaStatus === 'breach') {
        current.slaBreachedCases += 1
      }
      if (practiceArea) {
        current.practiceAreas[practiceArea] = (current.practiceAreas[practiceArea] ?? 0) + 1
      }
    }

    if (closed && isFiniteMetric(legalCase.resolutionHours)) {
      current.resolutionHours.push(legalCase.resolutionHours)
    }

    if (isFiniteMetric(legalCase.firstResponseMinutes)) {
      current.firstResponseMinutes.push(legalCase.firstResponseMinutes)
    }

    grouped.set(city, current)
  }

  return Array.from(grouped.values())
    .map<RegionalProjection>((current) => ({
      tenantId: current.tenantId,
      entityId: current.entityId,
      city: current.city,
      totalCases: current.totalCases,
      openCases: current.openCases,
      closedCases: current.closedCases,
      backlog: current.backlog,
      activeProfessionals: current.activeProfessionals.size,
      averageResolutionHours: average(current.resolutionHours),
      averageFirstResponseMinutes: average(current.firstResponseMinutes),
      slaWarningCases: current.slaWarningCases,
      slaBreachedCases: current.slaBreachedCases,
      practiceAreas: Object.fromEntries(
        Object.entries(current.practiceAreas).sort(([left], [right]) => left.localeCompare(right)),
      ),
      generatedAt: current.generatedAt,
    }))
    .sort(compareRegionalProjection)
}

export class RegionalIntelligenceBuilder {
  build(input: RegionalIntelligenceBuildInput) {
    return buildRegionalProjections(input)
  }
}

export function createRegionalIntelligenceBuilder() {
  return new RegionalIntelligenceBuilder()
}
