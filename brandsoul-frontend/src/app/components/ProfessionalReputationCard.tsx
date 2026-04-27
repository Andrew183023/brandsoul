import type { AdminLawyerReputation } from '../../backend-bridge/api/adminApi'
import FeedbackBanner from '../../components/FeedbackBanner'
import StatusChip, { type StatusChipTone } from '../../components/StatusChip'
import SurfaceCard from '../../components/SurfaceCard'
import { formatCaseMonetizationAmount } from '../../pages/adminCaseUi'

type ProfessionalReputationCardProps = {
  reputation: AdminLawyerReputation | null
  lawyerId?: string
  isLoading?: boolean
  error?: string | null
  emptyMessage: string
  title?: string
  className?: string
}

function formatAverageRating(value: number | null, ratingCount: number) {
  if (value == null || ratingCount === 0) {
    return 'Sem avaliacoes'
  }

  return `${value.toFixed(1)}/5`
}

function formatAverageResponseMinutes(value: number | null) {
  if (value == null) {
    return 'Sem resposta registrada'
  }

  if (value < 60) {
    return `${Math.round(value)} min`
  }

  const hours = value / 60
  return `${hours.toFixed(1)} h`
}

function formatClosureRate(value: number) {
  return `${Math.round(value * 100)}%`
}

function resolveClosureRateTone(value: number, assignedCases: number): StatusChipTone {
  if (assignedCases === 0) {
    return 'neutral'
  }

  if (value >= 0.75) {
    return 'success'
  }

  if (value >= 0.4) {
    return 'warning'
  }

  return 'danger'
}

export default function ProfessionalReputationCard({
  reputation,
  lawyerId,
  isLoading = false,
  error,
  emptyMessage,
  title = 'Resumo do profissional',
  className,
}: ProfessionalReputationCardProps) {
  return (
    <SurfaceCard tone="admin" className={['admin-card', className].filter(Boolean).join(' ')}>
      <div className="admin-card-header">
        <h3>{title}</h3>
        {reputation ? (
          <StatusChip tone={resolveClosureRateTone(reputation.closureRate, reputation.assignedCases)}>
            {formatClosureRate(reputation.closureRate)} de fechamento
          </StatusChip>
        ) : lawyerId ? <span>{lawyerId}</span> : null}
      </div>

      {isLoading ? <FeedbackBanner>Carregando reputacao...</FeedbackBanner> : null}
      {!isLoading && error ? <FeedbackBanner tone="error">{error}</FeedbackBanner> : null}
      {!isLoading && !error && !reputation ? <div className="admin-feedback">{emptyMessage}</div> : null}

      {!isLoading && !error && reputation ? (
        <div className="admin-domain-grid">
          <article className="admin-domain-card">
            <strong>Casos assumidos</strong>
            <span>{reputation.assignedCases}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Casos concluidos</strong>
            <span>{reputation.closedCases}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Nota media</strong>
            <span>{formatAverageRating(reputation.averageRating, reputation.ratingCount)}</span>
            <span>{reputation.ratingCount} avaliacao{reputation.ratingCount === 1 ? '' : 'oes'}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Primeira resposta media</strong>
            <span>{formatAverageResponseMinutes(reputation.averageFirstResponseMinutes)}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Receita mock</strong>
            <span>{formatCaseMonetizationAmount(reputation.mockRevenueCents)}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Taxa de fechamento</strong>
            <span>{formatClosureRate(reputation.closureRate)}</span>
          </article>
        </div>
      ) : null}
    </SurfaceCard>
  )
}