import { createHash } from 'node:crypto'

import type { OpportunityExecutionProposal } from '../market-signals/opportunities/governance/contracts/OpportunityExecutionProposal.js'
import type { SovereignExecutionRecord } from './contracts/SovereignExecutionRecord.js'
import type { SovereignExecutionResult } from './contracts/SovereignExecutionResult.js'

export type SovereignExecutionEngineRunResult = {
  record: SovereignExecutionRecord
  result: SovereignExecutionResult
  idempotent: boolean
}

type SovereignExecutionEngineOptions = {
  now?: string
  existingExecutions?: SovereignExecutionRecord[]
}

type ExecutionPlan = {
  summary: string
  generatedLeadKind: 'portfolio' | 'property' | 'freight' | 'investment'
  revenueAttributed?: number
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

export function buildSovereignExecutionId(proposal: OpportunityExecutionProposal) {
  return [
    'sovereign-execution',
    normalizeIdPart(proposal.proposalId),
    hashValue(`${proposal.proposalId}:${proposal.entityId}:${proposal.actionType}`).slice(0, 16),
  ].join(':').slice(0, 128)
}

function buildGeneratedLeadId(executionId: string, leadKind: ExecutionPlan['generatedLeadKind']) {
  return [
    leadKind,
    'lead',
    hashValue(`${executionId}:${leadKind}`).slice(0, 18),
  ].join(':').slice(0, 128)
}

function buildExecutionPlan(proposal: OpportunityExecutionProposal): ExecutionPlan | null {
  switch (proposal.actionType) {
    case 'portfolio.lead.route':
      return {
        summary: `Created internal lead workflow for ${proposal.entityName}.`,
        generatedLeadKind: 'portfolio',
      }
    case 'property.lead.capture':
      return {
        summary: `Created property inquiry intake for ${proposal.entityName}.`,
        generatedLeadKind: 'property',
      }
    case 'freight.inquiry.start':
      return {
        summary: `Created logistics inquiry workflow for ${proposal.entityName}.`,
        generatedLeadKind: 'freight',
      }
    case 'investment.outreach.start':
      return {
        summary: `Created investment lead outreach workflow for ${proposal.entityName}.`,
        generatedLeadKind: 'investment',
      }
    default:
      return null
  }
}

function buildUnsupportedResult(proposal: OpportunityExecutionProposal, now: string): SovereignExecutionEngineRunResult {
  const executionId = buildSovereignExecutionId(proposal)
  const summary = `Unsupported sovereign execution action: ${proposal.actionType}.`

  return {
    idempotent: false,
    record: {
      executionId,
      proposalId: proposal.proposalId,
      entityId: proposal.entityId,
      actionType: proposal.actionType,
      executionStatus: 'failed',
      startedAt: now,
      completedAt: now,
      resultSummary: summary,
    },
    result: {
      success: false,
      summary,
    },
  }
}

function buildRejectedResult(proposal: OpportunityExecutionProposal, now: string): SovereignExecutionEngineRunResult {
  const executionId = buildSovereignExecutionId(proposal)
  const summary = `Proposal ${proposal.proposalId} is not approved for execution.`

  return {
    idempotent: false,
    record: {
      executionId,
      proposalId: proposal.proposalId,
      entityId: proposal.entityId,
      actionType: proposal.actionType,
      executionStatus: 'pending',
      startedAt: now,
      resultSummary: summary,
    },
    result: {
      success: false,
      summary,
    },
  }
}

export class SovereignExecutionEngine {
  execute(
    proposal: OpportunityExecutionProposal,
    options: SovereignExecutionEngineOptions = {},
  ): SovereignExecutionEngineRunResult {
    const now = options.now ?? new Date().toISOString()
    const executionId = buildSovereignExecutionId(proposal)
    const existingExecution = options.existingExecutions?.find((execution) => execution.executionId === executionId)

    if (existingExecution) {
      return {
        idempotent: true,
        record: existingExecution,
        result: {
          success: existingExecution.executionStatus === 'completed',
          summary: existingExecution.resultSummary ?? 'Execution replayed from existing record.',
          generatedLeadId: existingExecution.generatedLeadId,
          revenueAttributed: existingExecution.revenueAttributed,
        },
      }
    }

    if (proposal.governanceStatus !== 'approved') {
      return buildRejectedResult(proposal, now)
    }

    const executionPlan = buildExecutionPlan(proposal)
    if (!executionPlan) {
      return buildUnsupportedResult(proposal, now)
    }

    const generatedLeadId = buildGeneratedLeadId(executionId, executionPlan.generatedLeadKind)
    const summary = executionPlan.summary

    return {
      idempotent: false,
      record: {
        executionId,
        proposalId: proposal.proposalId,
        entityId: proposal.entityId,
        actionType: proposal.actionType,
        executionStatus: 'completed',
        startedAt: now,
        completedAt: now,
        resultSummary: summary,
        generatedLeadId,
        revenueAttributed: executionPlan.revenueAttributed,
      },
      result: {
        success: true,
        summary,
        generatedLeadId,
        revenueAttributed: executionPlan.revenueAttributed,
      },
    }
  }
}

export function createSovereignExecutionEngine() {
  return new SovereignExecutionEngine()
}
