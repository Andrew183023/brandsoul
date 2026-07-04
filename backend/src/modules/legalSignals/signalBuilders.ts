import type {
  LegalOperationalSignal,
  LegalSignalPayload,
  LegalSignalSeverity,
  LegalSignalSource,
  LegalSignalType,
} from './signalTypes.js'

const PROHIBITED_PAYLOAD_KEYS = new Set([
  'cpf',
  'email',
  'phone',
  'telefone',
  'address',
  'endereco',
  'clientname',
  'document',
])

type SignalContext = {
  tenantId: number
  entityId: string
  caseId?: string | null
  occurredAt: string
}

export type CaseCreatedSignalInput = SignalContext & {
  practiceArea?: string | null
  origin?: string | null
  regionCode?: string | null
  specialtyCode?: string | null
  backlogSize?: number | null
  payload?: LegalSignalPayload
}

export type CaseAssignedSignalInput = SignalContext & {
  assignedProfessionalId: string
  previousProfessionalId?: string | null
  workloadSize?: number | null
  assignmentMode?: string | null
  payload?: LegalSignalPayload
}

export type CaseReassignedSignalInput = SignalContext & {
  previousProfessionalId: string
  assignedProfessionalId: string
  workloadSize?: number | null
  reassignmentReason?: string | null
  payload?: LegalSignalPayload
}

export type CaseClosedSignalInput = SignalContext & {
  closedBy?: 'professional' | 'admin' | 'system' | null
  closureReason?: string | null
  backlogSize?: number | null
  payload?: LegalSignalPayload
}

export type FirstProfessionalResponseSignalInput = SignalContext & {
  professionalId: string
  channel?: 'portal' | 'admin' | 'internal' | null
  responseTimeMinutes?: number | null
  payload?: LegalSignalPayload
}

type SanitizedPayloadValue = unknown

function sanitizePayloadValue(value: SanitizedPayloadValue): SanitizedPayloadValue | undefined {
  if (Array.isArray(value)) {
    const sanitized = value
      .map((entry) => sanitizePayloadValue(entry))
      .filter((entry): entry is SanitizedPayloadValue => entry !== undefined)
    return sanitized
  }

  if (value && typeof value === 'object') {
    return sanitizeSignalPayload(value as LegalSignalPayload)
  }

  if (value === undefined) {
    return undefined
  }

  return value
}

export function sanitizeSignalPayload(payload?: LegalSignalPayload | null): LegalSignalPayload {
  if (!payload) {
    return {}
  }

  const sanitized: LegalSignalPayload = {}
  for (const [key, value] of Object.entries(payload)) {
    if (PROHIBITED_PAYLOAD_KEYS.has(key.trim().toLowerCase())) {
      continue
    }

    const nextValue = sanitizePayloadValue(value)
    if (nextValue !== undefined) {
      sanitized[key] = nextValue
    }
  }

  return sanitized
}

function buildSignal(args: {
  tenantId: number
  entityId: string
  caseId?: string | null
  signalType: LegalSignalType
  severity: LegalSignalSeverity
  source: LegalSignalSource
  occurredAt: string
  payload?: LegalSignalPayload
}): LegalOperationalSignal {
  return {
    tenantId: args.tenantId,
    entityId: args.entityId,
    caseId: args.caseId ?? null,
    signalType: args.signalType,
    severity: args.severity,
    source: args.source,
    occurredAt: args.occurredAt,
    payload: sanitizeSignalPayload(args.payload),
  }
}

export function buildCaseCreatedSignals(input: CaseCreatedSignalInput): LegalOperationalSignal[] {
  return [
    buildSignal({
      tenantId: input.tenantId,
      entityId: input.entityId,
      caseId: input.caseId,
      signalType: 'NEW_DEMAND',
      severity: 'info',
      source: 'CASE_CREATED',
      occurredAt: input.occurredAt,
      payload: {
        practiceArea: input.practiceArea ?? null,
        origin: input.origin ?? 'operational',
        regionCode: input.regionCode ?? null,
        specialtyCode: input.specialtyCode ?? null,
        backlogSize: input.backlogSize ?? null,
        ...(input.payload ?? {}),
      },
    }),
  ]
}

export function buildCaseAssignedSignals(input: CaseAssignedSignalInput): LegalOperationalSignal[] {
  return [
    buildSignal({
      tenantId: input.tenantId,
      entityId: input.entityId,
      caseId: input.caseId,
      signalType: 'CASE_ASSIGNED',
      severity: 'info',
      source: 'CASE_ASSIGNED',
      occurredAt: input.occurredAt,
      payload: {
        assignedProfessionalId: input.assignedProfessionalId,
        previousProfessionalId: input.previousProfessionalId ?? null,
        assignmentMode: input.assignmentMode ?? 'manual',
        ...(input.payload ?? {}),
      },
    }),
    buildSignal({
      tenantId: input.tenantId,
      entityId: input.entityId,
      caseId: input.caseId,
      signalType: 'WORKLOAD_CHANGED',
      severity: 'info',
      source: 'CASE_ASSIGNED',
      occurredAt: input.occurredAt,
      payload: {
        professionalId: input.assignedProfessionalId,
        change: 'increment',
        workloadSize: input.workloadSize ?? null,
      },
    }),
  ]
}

export function buildCaseReassignedSignals(input: CaseReassignedSignalInput): LegalOperationalSignal[] {
  return [
    buildSignal({
      tenantId: input.tenantId,
      entityId: input.entityId,
      caseId: input.caseId,
      signalType: 'CASE_REASSIGNED',
      severity: 'warning',
      source: 'CASE_REASSIGNED',
      occurredAt: input.occurredAt,
      payload: {
        previousProfessionalId: input.previousProfessionalId,
        assignedProfessionalId: input.assignedProfessionalId,
        reassignmentReason: input.reassignmentReason ?? null,
        ...(input.payload ?? {}),
      },
    }),
    buildSignal({
      tenantId: input.tenantId,
      entityId: input.entityId,
      caseId: input.caseId,
      signalType: 'WORKLOAD_CHANGED',
      severity: 'info',
      source: 'CASE_REASSIGNED',
      occurredAt: input.occurredAt,
      payload: {
        previousProfessionalId: input.previousProfessionalId,
        assignedProfessionalId: input.assignedProfessionalId,
        change: 'rebalance',
        workloadSize: input.workloadSize ?? null,
      },
    }),
  ]
}

export function buildCaseClosedSignals(input: CaseClosedSignalInput): LegalOperationalSignal[] {
  return [
    buildSignal({
      tenantId: input.tenantId,
      entityId: input.entityId,
      caseId: input.caseId,
      signalType: 'CASE_CLOSED',
      severity: 'info',
      source: 'CASE_CLOSED',
      occurredAt: input.occurredAt,
      payload: {
        closedBy: input.closedBy ?? 'system',
        closureReason: input.closureReason ?? null,
        ...(input.payload ?? {}),
      },
    }),
    buildSignal({
      tenantId: input.tenantId,
      entityId: input.entityId,
      caseId: input.caseId,
      signalType: 'BACKLOG_CHANGED',
      severity: 'info',
      source: 'CASE_CLOSED',
      occurredAt: input.occurredAt,
      payload: {
        change: 'decrement',
        backlogSize: input.backlogSize ?? null,
      },
    }),
  ]
}

export function buildFirstProfessionalResponseSignals(
  input: FirstProfessionalResponseSignalInput,
): LegalOperationalSignal[] {
  return [
    buildSignal({
      tenantId: input.tenantId,
      entityId: input.entityId,
      caseId: input.caseId,
      signalType: 'FIRST_RESPONSE',
      severity: 'info',
      source: 'FIRST_PROFESSIONAL_RESPONSE',
      occurredAt: input.occurredAt,
      payload: {
        professionalId: input.professionalId,
        channel: input.channel ?? 'admin',
        responseTimeMinutes: input.responseTimeMinutes ?? null,
        ...(input.payload ?? {}),
      },
    }),
  ]
}
