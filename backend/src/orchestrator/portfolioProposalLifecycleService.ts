import type { PortfolioProposalOutcomeRecord, PortfolioProposalOutcomeRepository } from '../repositories/portfolioProposalOutcomeRepository.js'
import type {
  PortfolioProposalRecord,
  PortfolioProposalRepository,
  PortfolioProposalStatus,
} from '../repositories/portfolioProposalRepository.js'
import type { SovereignMutationCommandService } from './sovereignMutationCommandService.js'

function transitionAllowed(current: PortfolioProposalStatus, next: PortfolioProposalStatus) {
  const allowed: Record<PortfolioProposalStatus, PortfolioProposalStatus[]> = {
    proposed: ['acknowledged', 'approved', 'rejected', 'expired'],
    acknowledged: ['approved', 'rejected', 'expired'],
    approved: ['executed', 'evaluated', 'expired'],
    rejected: [],
    expired: [],
    executed: ['evaluated'],
    evaluated: [],
  }

  return allowed[current].includes(next)
}

export type EvaluatePortfolioProposalInput = {
  proposalId: string
  leadsGenerated: number
  conversions: number
  revenue: number
  roiObserved: number
  success: boolean
  evaluatedAt?: string
  actorId?: string
}

export type PortfolioProposalLifecycleResult = {
  proposal: PortfolioProposalRecord | null
  approval?: { approvalId: string, proposalId?: string, status: string } | null
  outcome?: PortfolioProposalOutcomeRecord
  blockedReason?: 'not_found' | 'invalid_transition'
  changed: boolean
}

export type PortfolioProposalLifecycleDependencies = {
  proposalRepository: PortfolioProposalRepository
  outcomeRepository: PortfolioProposalOutcomeRepository
  sovereignCommandService: SovereignMutationCommandService
}

export class PortfolioProposalLifecycleService {
  constructor(private readonly dependencies: PortfolioProposalLifecycleDependencies) {}

  acknowledge(proposalId: string, now: string, actorId?: string) {
    return this.dependencies.sovereignCommandService.submitCommand({
      type: 'portfolio.proposal.transition',
      commandId: `portfolio-proposal-transition:${proposalId}:acknowledged:${now}`,
      proposalId,
      status: 'acknowledged',
      actorId,
      now,
    }) as Promise<PortfolioProposalLifecycleResult>
  }

  approve(proposalId: string, now: string, actorId?: string) {
    return this.dependencies.sovereignCommandService.submitCommand({
      type: 'portfolio.proposal.transition',
      commandId: `portfolio-proposal-transition:${proposalId}:approved:${now}`,
      proposalId,
      status: 'approved',
      actorId,
      now,
    }) as Promise<PortfolioProposalLifecycleResult>
  }

  reject(proposalId: string, now: string, actorId?: string) {
    return this.dependencies.sovereignCommandService.submitCommand({
      type: 'portfolio.proposal.transition',
      commandId: `portfolio-proposal-transition:${proposalId}:rejected:${now}`,
      proposalId,
      status: 'rejected',
      actorId,
      now,
    }) as Promise<PortfolioProposalLifecycleResult>
  }

  async execute(proposalId: string, _now: string, _actorId?: string) {
    const proposal = await this.dependencies.proposalRepository.getById(proposalId)
    if (!proposal) {
      return { proposal: null, changed: false, blockedReason: 'not_found' as const }
    }
    if (!transitionAllowed(proposal.status, 'executed')) {
      return { proposal, changed: false, blockedReason: 'invalid_transition' as const }
    }
    return { proposal, changed: false }
  }

  async evaluate(input: EvaluatePortfolioProposalInput): Promise<PortfolioProposalLifecycleResult> {
    return this.dependencies.sovereignCommandService.submitCommand({
      type: 'portfolio.proposal.evaluate',
      commandId: `portfolio-proposal-evaluate:${input.proposalId}:${input.evaluatedAt ?? new Date().toISOString()}`,
      proposalId: input.proposalId,
      leadsGenerated: input.leadsGenerated,
      conversions: input.conversions,
      revenue: input.revenue,
      roiObserved: input.roiObserved,
      success: input.success,
      actorId: input.actorId,
      evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    }) as Promise<PortfolioProposalLifecycleResult>
  }
}

export function createPortfolioProposalLifecycleService(dependencies: PortfolioProposalLifecycleDependencies) {
  return new PortfolioProposalLifecycleService(dependencies)
}
