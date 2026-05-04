import type { BackendDatabase } from '../../db/dbClient.js'

type JsonObject = Record<string, unknown>

type CaseMatchRow = {
  id: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  practice_area: string | null
  centelha_context: unknown
  metadata: unknown
}

type ProfessionalMatchRow = {
  professional_id: string
  user_id: number | null
  display_name: string
  status: string
  specialties: unknown
  availability: unknown
  profile_metadata: unknown
  professional_metadata: unknown
}

type ProfessionalFallbackRow = {
  id: string
  display_name: string
}

type LearningSignalRow = {
  professional_id: string
  source: string
  impact_score: number | null
  payload: unknown
}

export type ProfessionalMatchResult = {
  professionalId: string
  score: number
  displayName?: string
}

export type ProfessionalRankingResult = {
  professionalId: string
  score: number
  acceptanceRate: number
  avgResponseTime: number | null
  rank: number
  displayName?: string
}

type NormalizedCaseData = {
  category?: string
  urgency: 'low' | 'normal' | 'high'
  city?: string
  state?: string
}

type NormalizedProfessionalData = {
  professionalId: string
  userId: number | null
  displayName?: string
  isActive: boolean
  isAvailable: boolean
  isLoginCapable: boolean
  specialties: string[]
  city?: string
  state?: string
  profileMetadata: JsonObject
}

type ProfessionalPerformanceMetrics = {
  acceptanceRate: number
  rejectionRate: number
  avgResponseTimeMs: number | null
  sampleSize: number
}

function parseJsonObject(value: unknown): JsonObject {
  if (!value) {
    return {}
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as JsonObject
    } catch {
      return {}
    }
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject
  }

  return {}
}

function parseJsonArray(value: unknown): unknown[] {
  if (!value) {
    return []
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown[]
    } catch {
      return []
    }
  }

  return Array.isArray(value) ? value : []
}

function normalizeText(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : undefined
}

function readString(source: JsonObject, key: string) {
  return normalizeText(source[key])
}

function readNestedObject(source: JsonObject, key: string) {
  const value = source[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : undefined
}

function readLocation(source: JsonObject) {
  const directCity = readString(source, 'city')
  const directState = readString(source, 'state')
  const location = readNestedObject(source, 'location')

  return {
    city: directCity ?? (location ? readString(location, 'city') : undefined),
    state: directState ?? (location ? readString(location, 'state') : undefined),
  }
}

function resolveCaseData(row: CaseMatchRow): NormalizedCaseData {
  const centelhaContext = parseJsonObject(row.centelha_context)
  const metadata = parseJsonObject(row.metadata)
  const metadataLocation = readLocation(metadata)
  const contextLocation = readLocation(centelhaContext)

  const metadataCategory = readString(metadata, 'category') ?? readString(metadata, 'practiceArea')
  const contextCategory = readString(centelhaContext, 'category') ?? readString(centelhaContext, 'practiceArea')

  return {
    category: normalizeText(row.practice_area) ?? metadataCategory ?? contextCategory,
    urgency: row.priority === 'high' || row.priority === 'urgent' ? 'high' : row.priority === 'low' ? 'low' : 'normal',
    city: metadataLocation.city ?? contextLocation.city,
    state: metadataLocation.state ?? contextLocation.state,
  }
}

function resolveAvailability(availability: JsonObject) {
  const activeValue = availability.active
  const availableValue = availability.available

  if (typeof availableValue === 'boolean') {
    return availableValue
  }

  if (typeof activeValue === 'boolean') {
    return activeValue
  }

  return true
}

function resolveProfessionalData(row: ProfessionalMatchRow): NormalizedProfessionalData {
  const availability = parseJsonObject(row.availability)
  const profileMetadata = parseJsonObject(row.profile_metadata)
  const professionalMetadata = parseJsonObject(row.professional_metadata)
  const loginCapable = typeof professionalMetadata.loginCapable === 'boolean'
    ? professionalMetadata.loginCapable === true
    : Number.isInteger(row.user_id)
  const specialties = parseJsonArray(row.specialties)
    .map((value) => normalizeText(value))
    .filter((value): value is string => Boolean(value))

  const profileLocation = readLocation(profileMetadata)
  const professionalLocation = readLocation(professionalMetadata)
  const availabilityLocation = readLocation(availability)

  return {
    professionalId: row.professional_id,
    userId: row.user_id,
    displayName: row.display_name,
    isActive: row.status === 'active',
    isAvailable: resolveAvailability(availability),
    isLoginCapable: loginCapable,
    specialties,
    city: profileLocation.city ?? professionalLocation.city ?? availabilityLocation.city,
    state: profileLocation.state ?? professionalLocation.state ?? availabilityLocation.state,
    profileMetadata,
  }
}

function filterDispatchEligibleProfessionals(
  tenantId: number,
  caseId: string,
  professionals: NormalizedProfessionalData[],
) {
  const eligible: NormalizedProfessionalData[] = []

  for (const professional of professionals) {
    if (professional.isLoginCapable) {
      eligible.push(professional)
      continue
    }

    console.warn('cases.match_candidate_not_login_capable', {
      tenantId,
      caseId,
      professionalId: professional.professionalId,
      userId: professional.userId,
    })
  }

  return eligible
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function computeScore(legalCase: NormalizedCaseData, professional: NormalizedProfessionalData) {
  let score = 0

  if (legalCase.category && professional.specialties.includes(legalCase.category)) {
    score += 0.5
  }

  if (legalCase.city && professional.city && legalCase.city === professional.city) {
    score += 0.3
  } else if (legalCase.state && professional.state && legalCase.state === professional.state) {
    score += 0.2
  } else {
    score += 0.05
  }

  if (professional.isAvailable) {
    score += legalCase.urgency === 'high' ? 0.2 : 0.15
  }

  if (professional.isActive) {
    score += 0.05
  }

  return roundScore(score)
}

function buildDefaultPerformanceMetrics(): ProfessionalPerformanceMetrics {
  return {
    acceptanceRate: 0.5,
    rejectionRate: 0.5,
    avgResponseTimeMs: null,
    sampleSize: 0,
  }
}

function resolvePerformanceMetrics(rows: LearningSignalRow[]): ProfessionalPerformanceMetrics {
  let accepted = 0
  let rejected = 0
  const dispatchTimes: number[] = []

  for (const row of rows) {
    if (row.source === 'acceptance_rate') {
      const payload = parseJsonObject(row.payload)
      const acceptedValue = payload.accepted
      if (typeof acceptedValue === 'boolean') {
        if (acceptedValue) {
          accepted += 1
        } else {
          rejected += 1
        }
        continue
      }

      if (typeof row.impact_score === 'number') {
        if (row.impact_score >= 1) {
          accepted += 1
        } else {
          rejected += 1
        }
      }
    }

    if (row.source === 'dispatch_time' && typeof row.impact_score === 'number' && Number.isFinite(row.impact_score)) {
      dispatchTimes.push(Math.max(0, row.impact_score))
    }
  }

  const sampleSize = accepted + rejected
  const acceptanceRate = sampleSize > 0 ? accepted / sampleSize : 0.5
  const rejectionRate = sampleSize > 0 ? rejected / sampleSize : 0.5
  const avgResponseTimeMs = dispatchTimes.length > 0
    ? dispatchTimes.reduce((sum, value) => sum + value, 0) / dispatchTimes.length
    : null

  return {
    acceptanceRate: roundScore(acceptanceRate),
    rejectionRate: roundScore(rejectionRate),
    avgResponseTimeMs: avgResponseTimeMs === null ? null : Math.round(avgResponseTimeMs),
    sampleSize,
  }
}

function computePerformanceScore(metrics: ProfessionalPerformanceMetrics) {
  const acceptanceSignal = (metrics.acceptanceRate - 0.5) * 0.28
  const rejectionPenalty = metrics.rejectionRate * 0.12
  const targetResponseMs = 15 * 60 * 1000
  const responseBoost = metrics.avgResponseTimeMs === null
    ? 0
    : clamp((targetResponseMs - metrics.avgResponseTimeMs) / targetResponseMs, -1, 1) * 0.1
  return roundScore(clamp(acceptanceSignal - rejectionPenalty + responseBoost, -0.3, 0.3))
}

function isDevelopmentEnvironment() {
  return process.env.NODE_ENV !== 'production'
}

export class MatchingService {
  constructor(private readonly db: BackendDatabase) {}

  private async loadProfessionalPerformanceMetrics(
    tenantId: number,
    professionalIds: string[],
  ): Promise<Map<string, ProfessionalPerformanceMetrics>> {
    const metricsByProfessional = new Map<string, ProfessionalPerformanceMetrics>()
    for (const professionalId of professionalIds) {
      metricsByProfessional.set(professionalId, buildDefaultPerformanceMetrics())
    }

    if (professionalIds.length === 0) {
      return metricsByProfessional
    }

    const placeholders = professionalIds.map(() => '?').join(', ')
    const rows = await this.db.all<LearningSignalRow[]>(
      `
        SELECT professional_id, source, impact_score, payload
        FROM learning_events
        WHERE tenant_id = ?
          AND professional_id IN (${placeholders})
          AND source IN ('acceptance_rate', 'dispatch_time')
      `,
      tenantId,
      ...professionalIds,
    )

    const grouped = new Map<string, LearningSignalRow[]>()
    for (const row of rows) {
      if (!grouped.has(row.professional_id)) {
        grouped.set(row.professional_id, [])
      }
      grouped.get(row.professional_id)?.push(row)
    }

    for (const [professionalId, signals] of grouped.entries()) {
      metricsByProfessional.set(professionalId, resolvePerformanceMetrics(signals))
    }

    return metricsByProfessional
  }

  private async persistAggregatedMetrics(
    tenantId: number,
    professionals: NormalizedProfessionalData[],
    performanceMetricsByProfessional: Map<string, ProfessionalPerformanceMetrics>,
  ) {
    const nowIso = new Date().toISOString()
    const updateSql = this.db.dialect === 'postgres'
      ? `
          UPDATE professional_profiles
          SET metadata = ?::jsonb,
              updated_at = ?
          WHERE tenant_id = ? AND professional_id = ?
        `
      : `
          UPDATE professional_profiles
          SET metadata = ?,
              updated_at = ?
          WHERE tenant_id = ? AND professional_id = ?
        `

    for (const professional of professionals) {
      const metrics = performanceMetricsByProfessional.get(professional.professionalId) ?? buildDefaultPerformanceMetrics()
      const nextMetadata: JsonObject = {
        ...professional.profileMetadata,
        performanceMetrics: {
          acceptanceRate: metrics.acceptanceRate,
          rejectionRate: metrics.rejectionRate,
          avgResponseTimeMs: metrics.avgResponseTimeMs,
          sampleSize: metrics.sampleSize,
          updatedAt: nowIso,
        },
      }

      await this.db.run(
        updateSql,
        JSON.stringify(nextMetadata),
        nowIso,
        tenantId,
        professional.professionalId,
      )
    }
  }

  async matchCaseToProfessionals(tenantId: number, caseId: string): Promise<ProfessionalMatchResult[]> {
    try {
      const legalCase = await this.db.get<CaseMatchRow>(
        `
          SELECT id, priority, practice_area, centelha_context, metadata
          FROM cases
          WHERE tenant_id = ? AND id = ?
        `,
        tenantId,
        caseId,
      )

      if (!legalCase) {
        console.warn('cases.match_case_not_found', {
          tenantId,
          caseId,
        })
        return []
      }

      if (process.env.ENABLE_SANDBOX_MATCHING === 'true') {
        const sandboxProfessionals = await this.db.all<ProfessionalFallbackRow[]>(
          `
            SELECT *
            FROM professionals
            WHERE tenant_id = ?
            LIMIT 3
          `,
          tenantId,
        )
        const sandboxCandidates = sandboxProfessionals.map((professional) => ({
          professionalId: professional.id,
          displayName: professional.display_name,
          score: 0.1,
        }))

        console.warn('cases.match_sandbox_mode', {
          caseId,
          tenantId,
          professionalIds: sandboxCandidates.map((candidate) => candidate.professionalId),
        })

        return sandboxCandidates
      }

      const professionals = await this.db.all<ProfessionalMatchRow[]>(
        `
          SELECT
            professionals.id AS professional_id,
            professionals.user_id,
            professionals.display_name,
            professionals.status,
            professional_profiles.specialties,
            professional_profiles.availability,
            professional_profiles.metadata AS profile_metadata,
            professionals.metadata AS professional_metadata
          FROM professionals
          LEFT JOIN professional_profiles
            ON professional_profiles.tenant_id = professionals.tenant_id
           AND professional_profiles.professional_id = professionals.id
          WHERE professionals.tenant_id = ?
            AND professionals.status = 'active'
        `,
        tenantId,
      )

      console.info('cases.match_active_professionals', {
        tenantId,
        caseId,
        activeProfessionals: professionals.length,
      })

      const normalizedCase = resolveCaseData(legalCase)
      const normalizedProfessionals = professionals
        .map((row) => resolveProfessionalData(row))
        .filter((professional) => professional.isActive)
      const dispatchEligibleProfessionals = filterDispatchEligibleProfessionals(tenantId, caseId, normalizedProfessionals)
      console.info('cases.match_profile_normalized', {
        tenantId,
        caseId,
        normalizedProfessionals: normalizedProfessionals.length,
        dispatchEligibleProfessionals: dispatchEligibleProfessionals.length,
      })
      const professionalIds = dispatchEligibleProfessionals.map((professional) => professional.professionalId)
      const performanceMetricsByProfessional = await this.loadProfessionalPerformanceMetrics(tenantId, professionalIds)
      await this.persistAggregatedMetrics(tenantId, dispatchEligibleProfessionals, performanceMetricsByProfessional)
      const rankedCandidates = dispatchEligibleProfessionals
        .map((professional) => ({
          professionalId: professional.professionalId,
          displayName: professional.displayName,
          score: roundScore(
            computeScore(normalizedCase, professional)
              + computePerformanceScore(
                performanceMetricsByProfessional.get(professional.professionalId) ?? buildDefaultPerformanceMetrics(),
              ),
          ),
        }))
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score
          }

          return left.professionalId.localeCompare(right.professionalId)
        })
        .slice(0, 5)
      if (rankedCandidates.length > 0) {
        console.info('cases.match_candidates_found', {
          tenantId,
          caseId,
          candidateCount: rankedCandidates.length,
          professionalIds: rankedCandidates.map((candidate) => candidate.professionalId),
        })
        return rankedCandidates
      }

      const professionalsWithAnyProfileSignal = professionals.filter((row) => {
        const specialties = parseJsonArray(row.specialties)
        const availability = parseJsonObject(row.availability)
        const profileMetadata = parseJsonObject(row.profile_metadata)
        return specialties.length > 0
          || Object.keys(availability).length > 0
          || Object.keys(profileMetadata).length > 0
      }).length
      const unavailableCount = normalizedProfessionals.filter((professional) => !professional.isAvailable).length
      const hasSameCategoryMatch = normalizedCase.category
        ? normalizedProfessionals.some((professional) => professional.specialties.includes(normalizedCase.category as string))
        : false
      const activeInOtherTenants = await this.db.get<{ total: number }>(
        `
          SELECT COUNT(*) AS total
          FROM professionals
          WHERE tenant_id <> ?
            AND status = 'active'
        `,
        tenantId,
      )

      const reason = professionals.length === 0
        ? 'NO_ACTIVE_PROFESSIONALS'
        : professionalsWithAnyProfileSignal === 0
          ? 'NO_PROFESSIONAL_PROFILE'
          : normalizedCase.category && !hasSameCategoryMatch
            ? 'SPECIALTY_MISMATCH'
            : unavailableCount === normalizedProfessionals.length && normalizedProfessionals.length > 0
              ? 'AVAILABILITY_FALSE'
              : Number(activeInOtherTenants?.total ?? 0) > 0
                ? 'WRONG_TENANT'
                : 'NO_ACTIVE_PROFESSIONALS'

      console.warn('cases.match_no_candidates', {
        tenantId,
        caseId,
        reason,
        candidateCount: 0,
        activeProfessionals: professionals.length,
        normalizedProfessionals: normalizedProfessionals.length,
        professionalsWithAnyProfileSignal,
        unavailableCount,
      })

      if (isDevelopmentEnvironment()) {
        const fallbackProfessionals = await this.db.all<ProfessionalFallbackRow[]>(
          `
            SELECT *
            FROM professionals
            WHERE tenant_id = ?
              AND status = 'active'
            LIMIT 3
          `,
          tenantId,
        )
        const fallbackCandidates = fallbackProfessionals.map((professional) => ({
          professionalId: professional.id,
          displayName: professional.display_name,
          score: 0.1,
        }))

        if (fallbackCandidates.length > 0) {
          console.warn('cases.match_fallback_dev_used', {
            caseId,
            tenantId,
            professionalIds: fallbackCandidates.map((candidate) => candidate.professionalId),
          })
          return fallbackCandidates
        }
      }

      return []
    } catch {
      console.error('cases.match_failed_unexpected', {
        tenantId,
        caseId,
      })
      return []
    }
  }

  async getProfessionalRanking(tenantId: number): Promise<ProfessionalRankingResult[]> {
    const professionals = await this.db.all<ProfessionalMatchRow[]>(
      `
        SELECT
          professionals.id AS professional_id,
          professionals.display_name,
          professionals.status,
          professional_profiles.specialties,
          professional_profiles.availability,
          professional_profiles.metadata AS profile_metadata,
          professionals.metadata AS professional_metadata
        FROM professionals
        LEFT JOIN professional_profiles
          ON professional_profiles.tenant_id = professionals.tenant_id
         AND professional_profiles.professional_id = professionals.id
        WHERE professionals.tenant_id = ?
          AND professionals.status = 'active'
      `,
      tenantId,
    )

    const normalizedCase: NormalizedCaseData = { urgency: 'normal' }
    const normalizedProfessionals = professionals
      .map((row) => resolveProfessionalData(row))
      .filter((professional) => professional.isActive)
    const rankedProfessionals = process.env.ENABLE_SANDBOX_MATCHING === 'true'
      ? normalizedProfessionals
      : normalizedProfessionals.filter((professional) => professional.isLoginCapable)
    const professionalIds = rankedProfessionals.map((professional) => professional.professionalId)
    const performanceMetricsByProfessional = await this.loadProfessionalPerformanceMetrics(tenantId, professionalIds)

    const ranked = rankedProfessionals
      .map((professional) => {
        const metrics = performanceMetricsByProfessional.get(professional.professionalId) ?? buildDefaultPerformanceMetrics()
        return {
          professionalId: professional.professionalId,
          displayName: professional.displayName,
          score: roundScore(computeScore(normalizedCase, professional) + computePerformanceScore(metrics)),
          acceptanceRate: metrics.acceptanceRate,
          avgResponseTime: metrics.avgResponseTimeMs,
        }
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score
        }
        return left.professionalId.localeCompare(right.professionalId)
      })

    return ranked.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }))
  }
}

export function createMatchingService(db: BackendDatabase) {
  return new MatchingService(db)
}
