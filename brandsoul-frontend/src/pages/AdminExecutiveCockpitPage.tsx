import React from 'react'

void React

import './AdminExecutiveCockpitPage.css'
import type {
  ExecutiveDashboardResponse,
  ExecutiveDecision,
  ExecutiveFeedItem,
} from '../backend-bridge/api/executiveDashboardTypes'
import AdminOfficeLayout from '../components/AdminOfficeLayout'
import FeedbackBanner from '../components/FeedbackBanner'
import StatusChip, { type StatusChipTone } from '../components/StatusChip'
import SurfaceCard from '../components/SurfaceCard'
import { useExecutiveDashboard } from '../hooks/useExecutiveDashboard'

type Props = {
  officeId?: string | null
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ')
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function resolveHealthTone(level: ExecutiveDashboardResponse['officeHealth']['level']): StatusChipTone {
  switch (level) {
    case 'excellent':
      return 'success'
    case 'good':
      return 'neutral'
    case 'attention':
      return 'warning'
    case 'critical':
      return 'danger'
    default:
      return 'neutral'
  }
}

function resolveDecisionTone(priority: ExecutiveDecision['priority']): StatusChipTone {
  switch (priority) {
    case 'critical':
      return 'danger'
    case 'high':
      return 'warning'
    case 'medium':
      return 'neutral'
    case 'low':
      return 'success'
    default:
      return 'neutral'
  }
}

function resolveFeedTone(severity: ExecutiveFeedItem['severity']): StatusChipTone {
  switch (severity) {
    case 'critical':
      return 'danger'
    case 'warning':
      return 'warning'
    case 'opportunity':
      return 'success'
    case 'positive':
      return 'success'
    case 'info':
      return 'neutral'
    default:
      return 'neutral'
  }
}

function renderDecision(decision: ExecutiveDecision) {
  return (
    <article key={decision.id} className="admin-diagnosis-section admin-form-section executive-cockpit-card executive-cockpit-card--decision">
      <div className="admin-card-header executive-cockpit-card__header">
        <h3>{decision.title}</h3>
        <StatusChip tone={resolveDecisionTone(decision.priority)}>{formatLabel(decision.priority)}</StatusChip>
      </div>
      <p className="executive-cockpit-card__summary">{decision.explanation}</p>
      <div className="executive-cockpit-badge-row">
        <StatusChip tone="neutral">Tipo: {formatLabel(decision.type)}</StatusChip>
        <StatusChip tone="neutral">Impacto: {formatLabel(decision.impact)}</StatusChip>
        <StatusChip tone="neutral">Confiança: {decision.confidence}</StatusChip>
      </div>
      {decision.recommendedActions[0] ? (
        <p className="executive-cockpit-card__action"><strong>Próxima ação:</strong> {decision.recommendedActions[0]}</p>
      ) : null}
    </article>
  )
}

function renderFeedItem(item: ExecutiveFeedItem) {
  return (
    <article key={item.id} className="admin-diagnosis-section admin-form-section executive-cockpit-card executive-cockpit-card--feed">
      <div className="admin-card-header executive-cockpit-card__header">
        <h3>{item.title}</h3>
        <StatusChip tone={resolveFeedTone(item.severity)}>{formatLabel(item.severity)}</StatusChip>
      </div>
      <p className="executive-cockpit-card__summary">{item.summary}</p>
      <div className="executive-cockpit-badge-row">
        <StatusChip tone="neutral">Categoria: {formatLabel(item.category)}</StatusChip>
        <StatusChip tone="neutral">Origem: {formatLabel(item.source)}</StatusChip>
      </div>
      {item.suggestedAction ? (
        <p className="executive-cockpit-card__action"><strong>Ação sugerida:</strong> {item.suggestedAction}</p>
      ) : null}
    </article>
  )
}

function renderSnapshot(payload: ExecutiveDashboardResponse) {
  return (
    <div className="admin-diagnosis-grid executive-cockpit-snapshot-grid">
      <SurfaceCard tone="admin" className="executive-cockpit-metric-card">
        <strong>{payload.operational.snapshot.openCases}</strong>
        <span>casos ativos</span>
      </SurfaceCard>
      <SurfaceCard tone="admin" className="executive-cockpit-metric-card">
        <strong>{payload.operational.snapshot.backlog}</strong>
        <span>backlog</span>
      </SurfaceCard>
      <SurfaceCard tone="admin" className="executive-cockpit-metric-card">
        <strong>{payload.operational.snapshot.slaBreachedCases}</strong>
        <span>SLA vencido</span>
      </SurfaceCard>
      <SurfaceCard tone="admin" className="executive-cockpit-metric-card">
        <strong>{payload.operational.snapshot.slaWarningCases}</strong>
        <span>SLA em risco</span>
      </SurfaceCard>
      <SurfaceCard tone="admin" className="executive-cockpit-metric-card">
        <strong>{payload.growth.summary.expansionOpportunities}</strong>
        <span>oportunidades</span>
      </SurfaceCard>
      <SurfaceCard tone="admin" className="executive-cockpit-metric-card">
        <strong>{payload.growth.summary.averageGrowthScore ?? 'n/a'}</strong>
        <span>score de growth</span>
      </SurfaceCard>
    </div>
  )
}

export default function AdminExecutiveCockpitPage({ officeId }: Props) {
  const { data, error, isLoading, isRefreshing, refresh } = useExecutiveDashboard(officeId)

  if (!officeId) {
    return (
      <AdminOfficeLayout
        officeId="desconhecido"
        section="visao-geral"
        title="Cockpit Executivo"
        subtitle="Leitura executiva consolidada do escritório."
      >
        <FeedbackBanner tone="error">
          Escritório não encontrado para carregar o cockpit executivo.
        </FeedbackBanner>
      </AdminOfficeLayout>
    )
  }

  const decisions = data?.decisionCenter.decisions.slice(0, 3) ?? []
  const feedItems = data?.executiveFeed.items.slice(0, 5) ?? []

  return (
    <AdminOfficeLayout
      officeId={officeId}
      section="visao-geral"
      title="Cockpit Executivo"
      subtitle="Como está o escritório hoje e o que merece sua atenção agora."
    >
      {isLoading ? (
        <FeedbackBanner>Carregando cockpit executivo...</FeedbackBanner>
      ) : null}

      {!isLoading && error ? (
        <SurfaceCard tone="admin" className="executive-cockpit-panel executive-cockpit-panel--error">
          <FeedbackBanner tone="error">
            Não foi possível carregar o cockpit executivo.
          </FeedbackBanner>
          <p>{error.message}</p>
          <button type="button" className="admin-button" onClick={() => void refresh()}>
            Tentar novamente
          </button>
        </SurfaceCard>
      ) : null}

      {!isLoading && data ? (
        <div className="executive-cockpit-layout">
          <SurfaceCard tone="admin" className="executive-cockpit-hero">
            <div className="executive-cockpit-hero__content">
              <div className="admin-card-header executive-cockpit-hero__header">
                <div>
                  <p className="executive-cockpit-eyebrow">Cockpit executivo</p>
                  <h2>Como está o escritório hoje?</h2>
                </div>
                <StatusChip tone={resolveHealthTone(data.officeHealth.level)}>
                  {formatLabel(data.officeHealth.level)}
                </StatusChip>
              </div>
              <p className="executive-cockpit-hero__title"><strong>{data.morningBrief.title}</strong></p>
              <p className="executive-cockpit-hero__summary">{data.morningBrief.summary}</p>
              <div className="executive-cockpit-badge-row executive-cockpit-badge-row--hero">
                <StatusChip tone="warning">Prioridade do dia: {data.morningBrief.topPriority}</StatusChip>
                <StatusChip tone="neutral">Última atualização: {formatUpdatedAt(data.generatedAt)}</StatusChip>
                <StatusChip tone="neutral">Tom: {formatLabel(data.morningBrief.tone)}</StatusChip>
              </div>
              {isRefreshing ? (
                <FeedbackBanner>Atualizando cockpit executivo...</FeedbackBanner>
              ) : null}
              <div className="executive-cockpit-hero__actions">
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => void refresh()}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? 'Atualizando...' : 'Atualizar'}
                </button>
              </div>
            </div>
            <div className="executive-cockpit-hero__stats" aria-label="Resumo executivo imediato">
              <div className="executive-cockpit-highlight">
                <span className="executive-cockpit-highlight__label">Health score</span>
                <strong className="executive-cockpit-highlight__value">{data.officeHealth.score}</strong>
                <span className="executive-cockpit-highlight__hint">saúde atual do escritório</span>
              </div>
              <div className="executive-cockpit-highlight">
                <span className="executive-cockpit-highlight__label">Decisões em foco</span>
                <strong className="executive-cockpit-highlight__value">{decisions.length}</strong>
                <span className="executive-cockpit-highlight__hint">ações executivas prioritárias</span>
              </div>
              <div className="executive-cockpit-highlight">
                <span className="executive-cockpit-highlight__label">Alertas e sinais</span>
                <strong className="executive-cockpit-highlight__value">{feedItems.length}</strong>
                <span className="executive-cockpit-highlight__hint">acontecimentos relevantes agora</span>
              </div>
            </div>
          </SurfaceCard>

          <div className="executive-cockpit-columns">
            <SurfaceCard tone="admin" className="executive-cockpit-panel executive-cockpit-panel--health">
              <div className="admin-card-header">
                <h2>Saúde do escritório</h2>
                <StatusChip tone={resolveHealthTone(data.officeHealth.level)}>
                  {formatLabel(data.officeHealth.level)}
                </StatusChip>
              </div>
              <div className="executive-cockpit-health-score">
                <strong>{data.officeHealth.score}</strong>
                <span>score executivo consolidado</span>
              </div>
              <p>{data.officeHealth.explanation}</p>
              <div className="executive-cockpit-badge-row">
                <StatusChip tone="neutral">warnings: {data.officeHealth.warnings.length}</StatusChip>
                <StatusChip tone="neutral">oportunidades: {data.officeHealth.opportunities.length}</StatusChip>
                <StatusChip tone="neutral">drivers: {data.officeHealth.drivers.length}</StatusChip>
              </div>
              {data.officeHealth.warnings.length === 0 ? (
                <p className="executive-cockpit-empty-copy">Nenhum sinal crítico foi identificado nesta leitura.</p>
              ) : (
                <ul className="executive-cockpit-inline-list">
                  {data.officeHealth.warnings.slice(0, 3).map((warning) => (
                    <li key={warning.key}>{warning.summary}</li>
                  ))}
                </ul>
              )}
            </SurfaceCard>

            <SurfaceCard tone="admin" className="executive-cockpit-panel executive-cockpit-panel--decisions">
              <div className="admin-card-header">
                <h2>O que merece atenção agora?</h2>
                <StatusChip tone="neutral">{decisions.length} decisões</StatusChip>
              </div>
              {decisions.length > 0 ? (
                <div className="admin-diagnosis-grid">
                  {decisions.map(renderDecision)}
                </div>
              ) : (
                <p className="executive-cockpit-empty-copy">Nenhuma decisão imediata foi priorizada. O escritório pode seguir em monitoramento controlado.</p>
              )}
            </SurfaceCard>

            <SurfaceCard tone="admin" className="executive-cockpit-panel executive-cockpit-panel--feed">
              <div className="admin-card-header">
                <h2>Feed executivo</h2>
                <StatusChip tone="neutral">{feedItems.length} eventos</StatusChip>
              </div>
              {feedItems.length > 0 ? (
                <div className="admin-diagnosis-grid">
                  {feedItems.map(renderFeedItem)}
                </div>
              ) : (
                <p className="executive-cockpit-empty-copy">Nenhum acontecimento executivo relevante foi publicado. A operação segue sem novos alertas prioritários.</p>
              )}
            </SurfaceCard>

            <SurfaceCard tone="admin" className="executive-cockpit-panel executive-cockpit-panel--snapshot">
              <div className="admin-card-header">
                <h2>Snapshot resumido</h2>
                <StatusChip tone="neutral">leitura consolidada</StatusChip>
              </div>
              <p>Leitura operacional e de growth consolidada para leitura rápida em menos de 30 segundos.</p>
              {renderSnapshot(data)}
            </SurfaceCard>
          </div>
        </div>
      ) : null}
    </AdminOfficeLayout>
  )
}
