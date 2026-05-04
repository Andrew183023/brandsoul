import type { BackendDatabase } from '../db/index.js'
import { traceMutation } from '../sovereignty/authorityBoundary.js'

export type PortfolioLeadRevenueValidationMethod = 'external_system' | 'event_confirmation'

export type PortfolioLeadRevenueEventRecord = {
  revenueEventId: string
  leadId: string
  entityId: string
  invoiceId?: string
  paymentId?: string
  contractId?: string
  amount: number
  currency: string
  validationMethod: PortfolioLeadRevenueValidationMethod
  externalSystem?: string
  validationReference?: string
  confirmedEventId?: string
  reconciliationStatus: 'reconciled'
  reconciledAt: string
  createdAt: string
  updatedAt: string
}

export type SavePortfolioLeadRevenueEventInput = Omit<PortfolioLeadRevenueEventRecord, 'createdAt' | 'updatedAt'> & {
  createdAt?: string
  updatedAt?: string
}

function mapRow(row?: {
  revenue_event_id: string
  lead_id: string
  entity_id: string
  invoice_id: string | null
  payment_id: string | null
  contract_id: string | null
  amount: number
  currency: string
  validation_method: string
  external_system: string | null
  validation_reference: string | null
  confirmed_event_id: string | null
  reconciliation_status: string
  reconciled_at: string
  created_at: string
  updated_at: string
}): PortfolioLeadRevenueEventRecord | null {
  if (!row) {
    return null
  }

  return {
    revenueEventId: row.revenue_event_id,
    leadId: row.lead_id,
    entityId: row.entity_id,
    invoiceId: row.invoice_id ?? undefined,
    paymentId: row.payment_id ?? undefined,
    contractId: row.contract_id ?? undefined,
    amount: row.amount,
    currency: row.currency,
    validationMethod: row.validation_method as PortfolioLeadRevenueValidationMethod,
    externalSystem: row.external_system ?? undefined,
    validationReference: row.validation_reference ?? undefined,
    confirmedEventId: row.confirmed_event_id ?? undefined,
    reconciliationStatus: 'reconciled',
    reconciledAt: row.reconciled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PortfolioLeadRevenueEventRepository {
  constructor(private readonly db: BackendDatabase) {}

  async getById(revenueEventId: string): Promise<PortfolioLeadRevenueEventRecord | null> {
    const row = await this.db.get<Parameters<typeof mapRow>[0]>(
      `
        SELECT *
        FROM entity_portfolio_lead_revenue_event
        WHERE revenue_event_id = ?
        LIMIT 1
      `,
      revenueEventId,
    )

    return mapRow(row)
  }

  async getByLeadId(leadId: string): Promise<PortfolioLeadRevenueEventRecord | null> {
    const row = await this.db.get<Parameters<typeof mapRow>[0]>(
      `
        SELECT *
        FROM entity_portfolio_lead_revenue_event
        WHERE lead_id = ?
        LIMIT 1
      `,
      leadId,
    )

    return mapRow(row)
  }

  async list(limit = 500): Promise<PortfolioLeadRevenueEventRecord[]> {
    const rows = await this.db.all<Array<Parameters<typeof mapRow>[0]>>(
      `
        SELECT *
        FROM entity_portfolio_lead_revenue_event
        ORDER BY reconciled_at DESC, revenue_event_id DESC
        LIMIT ?
      `,
      limit,
    )

    return rows.map((row) => mapRow(row)).filter((row): row is PortfolioLeadRevenueEventRecord => row !== null)
  }

  async save(input: SavePortfolioLeadRevenueEventInput): Promise<{ record: PortfolioLeadRevenueEventRecord; created: boolean }> {
    traceMutation({
      source: 'backend/src/repositories/portfolioLeadRevenueEventRepository.ts#save',
      type: 'portfolio',
      targetId: input.revenueEventId,
      whatChanged: 'persist reconciled lead revenue event',
    })
    const existing = await this.getById(input.revenueEventId)
    const createdAt = existing?.createdAt ?? input.createdAt ?? input.reconciledAt
    const updatedAt = input.updatedAt ?? input.reconciledAt

    await this.db.run(
      `
        INSERT INTO entity_portfolio_lead_revenue_event (
          revenue_event_id,
          lead_id,
          entity_id,
          invoice_id,
          payment_id,
          contract_id,
          amount,
          currency,
          validation_method,
          external_system,
          validation_reference,
          confirmed_event_id,
          reconciliation_status,
          reconciled_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(revenue_event_id) DO UPDATE SET
          lead_id = excluded.lead_id,
          entity_id = excluded.entity_id,
          invoice_id = excluded.invoice_id,
          payment_id = excluded.payment_id,
          contract_id = excluded.contract_id,
          amount = excluded.amount,
          currency = excluded.currency,
          validation_method = excluded.validation_method,
          external_system = excluded.external_system,
          validation_reference = excluded.validation_reference,
          confirmed_event_id = excluded.confirmed_event_id,
          reconciliation_status = excluded.reconciliation_status,
          reconciled_at = excluded.reconciled_at,
          updated_at = excluded.updated_at
      `,
      input.revenueEventId,
      input.leadId,
      input.entityId,
      input.invoiceId ?? null,
      input.paymentId ?? null,
      input.contractId ?? null,
      input.amount,
      input.currency,
      input.validationMethod,
      input.externalSystem ?? null,
      input.validationReference ?? null,
      input.confirmedEventId ?? null,
      input.reconciliationStatus,
      input.reconciledAt,
      createdAt,
      updatedAt,
    )

    const record = await this.getById(input.revenueEventId)
    if (!record) {
      throw new Error(`Failed to save reconciled lead revenue event ${input.revenueEventId}.`)
    }

    return {
      record,
      created: !existing,
    }
  }
}

export function createPortfolioLeadRevenueEventRepository(db: BackendDatabase) {
  return new PortfolioLeadRevenueEventRepository(db)
}