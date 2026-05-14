import { createHash } from 'node:crypto'

export type RevenueAttributionLineage = {
  marketSignalId: string
  opportunityId: string
  proposalId: string
  executionId: string
  generatedLeadId: string
}

export type RevenueAttributionInput = RevenueAttributionLineage & {
  revenue: number
  currency?: string
  recognizedAt?: string
  revenueEventId?: string
  invoiceId?: string
  paymentId?: string
  contractId?: string
  sourceSystem?: string
}

export type RevenueAttributionStage =
  | 'market-signal'
  | 'opportunity'
  | 'proposal'
  | 'execution'
  | 'generated-lead'
  | 'revenue'

export type RevenueAttributionLineageNode = {
  stage: RevenueAttributionStage
  id: string
}

export type RevenueAttributionRecord = RevenueAttributionInput & {
  attributionId: string
  lineageKey: string
  revenueFingerprint: string
  attributedAt: string
  lineage: RevenueAttributionLineageNode[]
  resultSummary: string
}

export type RevenueAttributionEngineRunResult = {
  record: RevenueAttributionRecord
  idempotent: boolean
}

type RevenueAttributionEngineOptions = {
  now?: string
  existingAttributions?: RevenueAttributionRecord[]
}

function hashValue(value: string) {
  return createHash('sha256').update(value, 'utf-8').digest('hex')
}

function normalizeIdPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeRequiredId(value: string, label: string) {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new Error(`Revenue attribution requires ${label}.`)
  }

  return normalized
}

function normalizeCurrency(currency?: string) {
  return currency?.trim().toUpperCase() || 'USD'
}

function normalizeRevenue(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Revenue attribution requires a finite non-negative revenue amount.')
  }

  return Number(value.toString())
}

function buildLineageKey(lineage: RevenueAttributionLineage) {
  return [
    lineage.marketSignalId,
    lineage.opportunityId,
    lineage.proposalId,
    lineage.executionId,
    lineage.generatedLeadId,
  ].join('>')
}

function buildRevenueFingerprint(input: RevenueAttributionInput, normalizedRevenue: number, currency: string) {
  const stableReference = [
    input.revenueEventId,
    input.invoiceId,
    input.paymentId,
    input.contractId,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join('|')

  const fallbackReference = [
    normalizedRevenue,
    currency,
    input.recognizedAt?.trim() || 'unrecognized-at',
    input.sourceSystem?.trim() || 'unknown-source',
  ].join('|')

  return stableReference.length > 0 ? stableReference : fallbackReference
}

function buildRevenueNodeId(lineageKey: string, revenueFingerprint: string) {
  return ['revenue', hashValue(`${lineageKey}:${revenueFingerprint}`).slice(0, 18)].join(':')
}

export function buildRevenueAttributionId(input: RevenueAttributionInput) {
  const lineage: RevenueAttributionLineage = {
    marketSignalId: normalizeRequiredId(input.marketSignalId, 'marketSignalId'),
    opportunityId: normalizeRequiredId(input.opportunityId, 'opportunityId'),
    proposalId: normalizeRequiredId(input.proposalId, 'proposalId'),
    executionId: normalizeRequiredId(input.executionId, 'executionId'),
    generatedLeadId: normalizeRequiredId(input.generatedLeadId, 'generatedLeadId'),
  }
  const normalizedRevenue = normalizeRevenue(input.revenue)
  const currency = normalizeCurrency(input.currency)
  const lineageKey = buildLineageKey(lineage)
  const revenueFingerprint = buildRevenueFingerprint(input, normalizedRevenue, currency)

  return [
    'revenue-attribution',
    normalizeIdPart(lineage.generatedLeadId).slice(0, 24),
    hashValue(`${lineageKey}:${revenueFingerprint}:${normalizedRevenue}:${currency}`).slice(0, 18),
  ].join(':').slice(0, 128)
}

function buildLineage(lineage: RevenueAttributionLineage, revenueNodeId: string): RevenueAttributionLineageNode[] {
  return [
    { stage: 'market-signal', id: lineage.marketSignalId },
    { stage: 'opportunity', id: lineage.opportunityId },
    { stage: 'proposal', id: lineage.proposalId },
    { stage: 'execution', id: lineage.executionId },
    { stage: 'generated-lead', id: lineage.generatedLeadId },
    { stage: 'revenue', id: revenueNodeId },
  ]
}

function buildSummary(record: Pick<RevenueAttributionRecord, 'generatedLeadId' | 'revenue' | 'currency'>) {
  return `Attributed ${record.currency} ${record.revenue} to generated lead ${record.generatedLeadId}.`
}

export class RevenueAttributionEngine {
  attribute(
    input: RevenueAttributionInput,
    options: RevenueAttributionEngineOptions = {},
  ): RevenueAttributionEngineRunResult {
    const now = options.now ?? new Date().toISOString()
    const lineage: RevenueAttributionLineage = {
      marketSignalId: normalizeRequiredId(input.marketSignalId, 'marketSignalId'),
      opportunityId: normalizeRequiredId(input.opportunityId, 'opportunityId'),
      proposalId: normalizeRequiredId(input.proposalId, 'proposalId'),
      executionId: normalizeRequiredId(input.executionId, 'executionId'),
      generatedLeadId: normalizeRequiredId(input.generatedLeadId, 'generatedLeadId'),
    }
    const normalizedRevenue = normalizeRevenue(input.revenue)
    const currency = normalizeCurrency(input.currency)
    const lineageKey = buildLineageKey(lineage)
    const revenueFingerprint = buildRevenueFingerprint(input, normalizedRevenue, currency)
    const attributionId = buildRevenueAttributionId({
      ...input,
      ...lineage,
      revenue: normalizedRevenue,
      currency,
    })
    const existingAttribution = options.existingAttributions?.find((record) => record.attributionId === attributionId)

    if (existingAttribution) {
      return {
        idempotent: true,
        record: existingAttribution,
      }
    }

    const revenueNodeId = buildRevenueNodeId(lineageKey, revenueFingerprint)
    const record: RevenueAttributionRecord = {
      ...lineage,
      revenue: normalizedRevenue,
      currency,
      recognizedAt: input.recognizedAt?.trim() || now,
      revenueEventId: input.revenueEventId?.trim() || undefined,
      invoiceId: input.invoiceId?.trim() || undefined,
      paymentId: input.paymentId?.trim() || undefined,
      contractId: input.contractId?.trim() || undefined,
      sourceSystem: input.sourceSystem?.trim() || undefined,
      attributionId,
      lineageKey,
      revenueFingerprint,
      attributedAt: now,
      lineage: buildLineage(lineage, revenueNodeId),
      resultSummary: '',
    }

    record.resultSummary = buildSummary(record)

    return {
      idempotent: false,
      record,
    }
  }
}

export function createRevenueAttributionEngine() {
  return new RevenueAttributionEngine()
}