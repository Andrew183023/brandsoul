import type { AdminLegalCase } from '../backend-bridge/api/adminApi'
import type { QueueEvaluationResult, QueuePriorityEntry } from './priorityQueueEngine'

export type CaseBacklogKpis = {
  backlogTotal: number
  backlogCritical: number
  averageFirstResponseMinutes: number | null
  averageSlaRemainingMinutes: number | null
  casesByOperator: Array<{
    operatorId: string
    cases: number
  }>
}

export type CaseBacklogBuckets = {
  criticalCases: number
  delayedCases: number
  noResponseCases: number
  expiringSlaCases: number
  waitingOperatorCases: number
  waitingClientCases: number
}

export type CaseBacklogReport = {
  generatedAt: string
  kpis: CaseBacklogKpis
  buckets: CaseBacklogBuckets
}

function parseDateToMillis(value: string) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function average(values: number[]) {
  if (values.length === 0) {
    return null
  }

  const total = values.reduce((acc, value) => acc + value, 0)
  return Math.round(total / values.length)
}

function resolveFirstResponseMinutes(caseItem: AdminLegalCase) {
  const openedAt = parseDateToMillis(caseItem.createdAt)
  if (openedAt <= 0) {
    return null
  }

  const firstLawyerResponse = caseItem.messages
    .filter((item) => item.role === 'lawyer')
    .map((item) => parseDateToMillis(item.createdAt))
    .filter((value) => value > 0)
    .sort((left, right) => left - right)[0]

  if (!firstLawyerResponse) {
    return null
  }

  return Math.max(0, Math.round((firstLawyerResponse - openedAt) / 60_000))
}

function hasLawyerResponse(caseItem: AdminLegalCase) {
  return caseItem.messages.some((item) => item.role === 'lawyer')
}

function countCasesByOperator(entries: QueuePriorityEntry[]) {
  const byOperator = new Map<string, number>()

  for (const entry of entries) {
    const operatorId = entry.caseItem.assignedProfessionalId?.trim() ?? entry.caseItem.assignedLawyerId?.trim()
    if (!operatorId) {
      continue
    }

    byOperator.set(operatorId, (byOperator.get(operatorId) ?? 0) + 1)
  }

  return Array.from(byOperator.entries())
    .map(([operatorId, cases]) => ({ operatorId, cases }))
    .sort((left, right) => right.cases - left.cases || left.operatorId.localeCompare(right.operatorId))
}

function resolveDelayedCase(entry: QueuePriorityEntry) {
  if (entry.metrics.slaRemainingMinutes != null && entry.metrics.slaRemainingMinutes < 0) {
    return true
  }

  return entry.metrics.timeWithoutResponseMinutes >= 240
}

function resolveExpiringSlaCase(entry: QueuePriorityEntry) {
  if (entry.metrics.slaRemainingMinutes == null) {
    return false
  }

  return entry.metrics.slaRemainingMinutes >= 0 && entry.metrics.slaRemainingMinutes <= 30
}

function resolveWaitingOperatorCase(entry: QueuePriorityEntry) {
  return entry.caseItem.responseState === 'waiting_office'
}

function resolveWaitingClientCase(entry: QueuePriorityEntry) {
  return entry.caseItem.responseState === 'waiting_client'
}

export function buildCaseBacklogReport(queue: QueueEvaluationResult): CaseBacklogReport {
  const firstResponseDurations = queue.entries
    .map((entry) => resolveFirstResponseMinutes(entry.caseItem))
    .filter((value): value is number => value != null)

  const slaRemainingValues = queue.entries
    .map((entry) => entry.metrics.slaRemainingMinutes)
    .filter((value): value is number => value != null)

  const buckets: CaseBacklogBuckets = {
    criticalCases: queue.entries.filter((entry) => entry.level === 'critical').length,
    delayedCases: queue.entries.filter((entry) => resolveDelayedCase(entry)).length,
    noResponseCases: queue.entries.filter((entry) => !hasLawyerResponse(entry.caseItem)).length,
    expiringSlaCases: queue.entries.filter((entry) => resolveExpiringSlaCase(entry)).length,
    waitingOperatorCases: queue.entries.filter((entry) => resolveWaitingOperatorCase(entry)).length,
    waitingClientCases: queue.entries.filter((entry) => resolveWaitingClientCase(entry)).length,
  }

  return {
    generatedAt: queue.computedAt,
    kpis: {
      backlogTotal: queue.entries.length,
      backlogCritical: buckets.criticalCases,
      averageFirstResponseMinutes: average(firstResponseDurations),
      averageSlaRemainingMinutes: average(slaRemainingValues),
      casesByOperator: countCasesByOperator(queue.entries),
    },
    buckets,
  }
}
