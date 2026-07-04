import type {
  OperationalSnapshotCaseInput,
  OperationalSnapshotDistribution,
} from './OperationalSnapshot.js'
import type {
  SpecialtyIntelligenceBuildInput,
  SpecialtyProjection,
} from './SpecialtyIntelligence.js'

type SpecialtyAccumulator = {
  tenantId: number
  entityId: string
  practiceArea: string
  totalCases: number
  openCases: number
  closedCases: number
  backlog: number
  activeProfessionals: Set<string>
  resolutionHours: number[]
  firstResponseMinutes: number[]
  slaWarningCases: number
  slaBreachedCases: number
  cities: OperationalSnapshotDistribution
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

function compareSpecialtyProjection(left: SpecialtyProjection, right: SpecialtyProjection) {
  if (left.practiceArea !== right.practiceArea) {
    return left.practiceArea.localeCompare(right.practiceArea)
  }

  if (left.totalCases !== right.totalCases) {
    return right.totalCases - left.totalCases
  }

  return left.generatedAt.localeCompare(right.generatedAt)
}

function createAccumulator(input: SpecialtyIntelligenceBuildInput, practiceArea: string): SpecialtyAccumulator {
  return {
    tenantId: input.snapshot.tenantId,
    entityId: input.snapshot.entityId,
    practiceArea,
    totalCases: 0,
    openCases: 0,
    closedCases: 0,
    backlog: 0,
    activeProfessionals: new Set<string>(),
    resolutionHours: [],
    firstResponseMinutes: [],
    slaWarningCases: 0,
    slaBreachedCases: 0,
    cities: {},
    generatedAt: input.snapshot.builtAt,
  }
}

export function buildSpecialtyProjections(input: SpecialtyIntelligenceBuildInput): SpecialtyProjection[] {
  const grouped = new Map<string, SpecialtyAccumulator>()

  for (const legalCase of input.cases) {
    const practiceArea = normalizeKey(legalCase.practiceArea)
    if (!practiceArea) {
      continue
    }

    const current = grouped.get(practiceArea) ?? createAccumulator(input, practiceArea)
    const closed = isClosedCase(legalCase)
    const city = normalizeKey(legalCase.city)
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
      if (city) {
        current.cities[city] = (current.cities[city] ?? 0) + 1
      }
    }

    if (closed && isFiniteMetric(legalCase.resolutionHours)) {
      current.resolutionHours.push(legalCase.resolutionHours)
    }

    if (isFiniteMetric(legalCase.firstResponseMinutes)) {
      current.firstResponseMinutes.push(legalCase.firstResponseMinutes)
    }

    grouped.set(practiceArea, current)
  }

  return Array.from(grouped.values())
    .map<SpecialtyProjection>((current) => ({
      tenantId: current.tenantId,
      entityId: current.entityId,
      practiceArea: current.practiceArea,
      totalCases: current.totalCases,
      openCases: current.openCases,
      closedCases: current.closedCases,
      backlog: current.backlog,
      activeProfessionals: current.activeProfessionals.size,
      averageResolutionHours: average(current.resolutionHours),
      averageFirstResponseMinutes: average(current.firstResponseMinutes),
      slaWarningCases: current.slaWarningCases,
      slaBreachedCases: current.slaBreachedCases,
      cities: Object.fromEntries(
        Object.entries(current.cities).sort(([left], [right]) => left.localeCompare(right)),
      ),
      generatedAt: current.generatedAt,
      revenuePotentialPrepared: null,
    }))
    .sort(compareSpecialtyProjection)
}

export class SpecialtyIntelligenceBuilder {
  build(input: SpecialtyIntelligenceBuildInput) {
    return buildSpecialtyProjections(input)
  }
}

export function createSpecialtyIntelligenceBuilder() {
  return new SpecialtyIntelligenceBuilder()
}
