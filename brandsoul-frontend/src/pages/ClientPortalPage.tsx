import { useEffect, useMemo, useState } from 'react'

import PublicShell from '../app/shells/PublicShell'
import {
  getClientPortalCase,
  type ClientPortalCaseSummary,
} from '../backend-bridge/api/publicEntityApi'
import { Alert, Card, Section, Skeleton } from '../lib/designSystem'
import '../styles/clientPortalPage.css'

type ClientPortalPageProps = {
  caseId: string
  token: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; caseSummary: ClientPortalCaseSummary }
  | { status: 'error'; message: string }

type ClientProgressStage = {
  key: 'received' | 'owner_defined' | 'in_service' | 'closed'
  label: string
}

const CLIENT_PROGRESS_STAGES: ClientProgressStage[] = [
  { key: 'received', label: 'Triagem recebida' },
  { key: 'owner_defined', label: 'Responsável definido' },
  { key: 'in_service', label: 'Em atendimento' },
  { key: 'closed', label: 'Encerrado' },
]

function formatPortalDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Em atualização'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function getPortalCaseStatusLabel(status: ClientPortalCaseSummary['status']) {
  if (status === 'open') return 'Novo'
  if (status === 'pending') return 'Aguardando informações'
  if (status === 'on_hold') return 'Em pausa'
  if (status === 'in_progress' || status === 'accepted' || status === 'dispatched') return 'Em atendimento'
  if (status === 'closed') return 'Encerrado'
  return 'Em pausa'
}

function getPortalNextStepMessage(status: ClientPortalCaseSummary['status']) {
  if (status === 'open') {
    return 'Seu caso foi recebido e está aguardando análise inicial.'
  }

  if (status === 'dispatched' || status === 'accepted') {
    return 'Um profissional foi definido para avaliar sua solicitação.'
  }

  if (status === 'in_progress') {
    return 'Seu caso está sendo analisado pelo escritório.'
  }

  if (status === 'pending') {
    return 'Estamos aguardando informações ou documentos adicionais.'
  }

  if (status === 'on_hold') {
    return 'O atendimento encontra-se temporariamente pausado.'
  }

  if (status === 'closed') {
    return 'O caso foi encerrado.'
  }

  return 'O atendimento encontra-se temporariamente pausado.'
}

function formatPortalFreshness(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Atualizado recentemente'
  }

  const diffMs = Math.max(0, Date.now() - date.getTime())
  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs

  if (diffMs < minuteMs) {
    return 'Atualizado agora'
  }

  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.round(diffMs / minuteMs))
    return `Atualizado há ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
  }

  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.round(diffMs / hourMs))
    return `Atualizado há ${hours} ${hours === 1 ? 'hora' : 'horas'}`
  }

  const days = Math.max(1, Math.round(diffMs / dayMs))
  return `Última movimentação há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

function buildPortalCaseReference(caseId: string) {
  const compact = caseId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return `CASO-${compact.slice(0, 8) || 'LEGAL'}`
}

function buildResponsibleInitials(name?: string) {
  if (!name) {
    return 'BS'
  }

  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'BS'
}

function resolvePortalFreshnessTimestamp(caseSummary: ClientPortalCaseSummary) {
  const timelineDates = caseSummary.timeline
    .map((event) => new Date(event.occurredAt).getTime())
    .filter((value) => Number.isFinite(value))

  if (timelineDates.length > 0) {
    return new Date(Math.max(...timelineDates)).toISOString()
  }

  return caseSummary.updatedAt
}

function resolveClientProgressState(status: string) {
  if (status === 'closed' || status === 'archived') {
    return {
      currentStageKey: 'closed' as const,
      currentStageLabel: 'Encerrado',
    }
  }

  if (status === 'pending') {
    return {
      currentStageKey: 'in_service' as const,
      currentStageLabel: 'Em atendimento',
      auxiliaryLabel: 'Aguardando informações',
    }
  }

  if (status === 'on_hold') {
    return {
      currentStageKey: 'in_service' as const,
      currentStageLabel: 'Em atendimento',
      auxiliaryLabel: 'Em pausa',
    }
  }

  if (status === 'in_progress' || status === 'resolved') {
    return {
      currentStageKey: 'in_service' as const,
      currentStageLabel: 'Em atendimento',
    }
  }

  if (status === 'dispatched' || status === 'accepted') {
    return {
      currentStageKey: 'owner_defined' as const,
      currentStageLabel: 'Responsável definido',
    }
  }

  return {
    currentStageKey: 'received' as const,
    currentStageLabel: 'Triagem recebida',
  }
}

function ClientCaseProgress({ status }: { status: string }) {
  const progressState = resolveClientProgressState(status)
  const currentStageIndex = CLIENT_PROGRESS_STAGES.findIndex((stage) => stage.key === progressState.currentStageKey)

  return (
    <Card
      as="section"
      className="client-portal-page__progress-card"
      aria-label="Progresso do caso"
    >
      <div className="client-portal-page__progress-header">
        <p className="client-portal-page__eyebrow">Progresso do caso</p>
        <p className="client-portal-page__progress-current">
          Etapa atual: {progressState.currentStageLabel}
        </p>
      </div>

      <ol className="client-portal-page__progress-list">
        {CLIENT_PROGRESS_STAGES.map((stage, index) => {
          const isCompleted = index < currentStageIndex
          const isCurrent = index === currentStageIndex
          const marker = isCompleted ? '✓' : isCurrent ? '●' : '○'

          return (
            <li
              key={stage.key}
              className="client-portal-page__progress-item"
              data-state={isCompleted ? 'completed' : isCurrent ? 'current' : 'upcoming'}
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span className="client-portal-page__progress-marker" aria-hidden="true">{marker}</span>
              <span className="client-portal-page__progress-label">{stage.label}</span>
            </li>
          )
        })}
      </ol>

      {progressState.auxiliaryLabel ? (
        <div className="client-portal-page__progress-chip" aria-label={`Situação complementar: ${progressState.auxiliaryLabel}`}>
          {progressState.auxiliaryLabel}
        </div>
      ) : null}
    </Card>
  )
}

export default function ClientPortalPage({ caseId, token }: ClientPortalPageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    document.body.classList.add('client-portal-page-active')
    return () => {
      document.body.classList.remove('client-portal-page-active')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadPortalCase(showLoading: boolean) {
      if (showLoading) {
        setLoadState({ status: 'loading' })
      }

      try {
        const caseSummary = await getClientPortalCase(caseId, token)
        if (!cancelled) {
          setLoadState({ status: 'ready', caseSummary })
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Não foi possível carregar este portal agora.'
          setLoadState({ status: 'error', message })
        }
      }
    }

    void loadPortalCase(true)

    const intervalId = window.setInterval(() => {
      void loadPortalCase(false)
    }, 30_000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadPortalCase(false)
      }
    }

    window.addEventListener('focus', handleVisibilityChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleVisibilityChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [caseId, token])

  const caseReference = useMemo(() => buildPortalCaseReference(caseId), [caseId])
  const freshnessLabel = useMemo(() => {
    if (loadState.status !== 'ready') {
      return null
    }

    return formatPortalFreshness(resolvePortalFreshnessTimestamp(loadState.caseSummary))
  }, [loadState])

  return (
    <PublicShell>
      <section className="client-portal-page motion-page" aria-label="Portal do cliente">
        <Section
          kicker="Portal do cliente"
          title="Acompanhe o andamento inicial do seu caso"
          subtitle="Este espaço mostra o status atual, o escritório responsável e os marcos principais do atendimento."
          className="motion-reveal"
        >
          {loadState.status === 'loading' ? (
            <div className="client-portal-page__loading-grid">
              <Skeleton height="7rem" />
              <Skeleton height="12rem" />
              <Skeleton height="18rem" />
            </div>
          ) : null}

          {loadState.status === 'error' ? (
            <Alert
              tone="warning"
              title="Não conseguimos carregar este portal agora."
              description={loadState.message}
            />
          ) : null}

          {loadState.status === 'ready' ? (
            <>
              <Card as="article" className="client-portal-page__hero-shell">
                <div className="client-portal-page__hero-grid">
                  <div className="client-portal-page__hero-main">
                    <div className="client-portal-page__hero-meta">
                      <div>
                        <p className="client-portal-page__eyebrow">Número do caso</p>
                        <h2>{caseReference}</h2>
                      </div>
                      <div className="client-portal-page__status-chip" data-status={loadState.caseSummary.status}>
                        {getPortalCaseStatusLabel(loadState.caseSummary.status)}
                      </div>
                    </div>

                    <p className="client-portal-page__office">{loadState.caseSummary.officeName}</p>

                    <div className="client-portal-page__hero-message">
                      <p className="client-portal-page__eyebrow">Próximo passo</p>
                      <p className="client-portal-page__next-step">
                        {getPortalNextStepMessage(loadState.caseSummary.status)}
                      </p>
                    </div>

                    {freshnessLabel ? (
                      <div className="client-portal-page__freshness-band" aria-label="Última atividade do caso">
                        <span className="client-portal-page__freshness-dot" aria-hidden="true" />
                        <p className="client-portal-page__freshness">{freshnessLabel}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="client-portal-page__hero-aside">
                    <div className="client-portal-page__responsible-panel">
                      <p className="client-portal-page__eyebrow">Responsável pelo atendimento</p>
                      <div className="client-portal-page__responsible">
                        <div className="client-portal-page__responsible-avatar" aria-hidden="true">
                          {loadState.caseSummary.responsibleProfessional?.photoUrl ? (
                            <img
                              src={loadState.caseSummary.responsibleProfessional.photoUrl}
                              alt=""
                            />
                          ) : (
                            <span>{buildResponsibleInitials(loadState.caseSummary.responsibleProfessional?.displayName)}</span>
                          )}
                        </div>
                        <div className="client-portal-page__responsible-copy">
                          <strong>{loadState.caseSummary.responsibleProfessional?.displayName ?? 'Em definição pelo escritório'}</strong>
                          <span>
                            {loadState.caseSummary.responsibleProfessional ? 'Profissional responsável' : 'Responsável em confirmação interna'}
                          </span>
                          {loadState.caseSummary.responsibleProfessional?.oabCredential ? (
                            <span>{loadState.caseSummary.responsibleProfessional.oabCredential}</span>
                          ) : null}
                          {loadState.caseSummary.responsibleProfessional?.specialty ? (
                            <span className="client-portal-page__responsible-specialty">
                              {loadState.caseSummary.responsibleProfessional.specialty}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <ClientCaseProgress status={loadState.caseSummary.status} />

              <div className="client-portal-page__detail-grid">
                <Card as="article" className="client-portal-page__detail-card">
                  <p className="client-portal-page__eyebrow">Visão geral</p>
                  <dl className="client-portal-page__facts">
                    <div>
                      <dt>Status</dt>
                      <dd>{getPortalCaseStatusLabel(loadState.caseSummary.status)}</dd>
                    </div>
                    <div>
                      <dt>Área jurídica</dt>
                      <dd>{loadState.caseSummary.practiceArea ?? 'Em atualização'}</dd>
                    </div>
                    <div>
                      <dt>Data de abertura</dt>
                      <dd>{formatPortalDate(loadState.caseSummary.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Última atualização</dt>
                      <dd>
                        <span>{freshnessLabel ?? 'Atualizado recentemente'}</span>
                        <small>{formatPortalDate(loadState.caseSummary.updatedAt)}</small>
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card as="article" className="client-portal-page__detail-card">
                  <p className="client-portal-page__eyebrow">Linha do tempo</p>
                  <ol className="client-portal-page__timeline">
                    {loadState.caseSummary.timeline.map((event) => (
                      <li key={`${event.type}:${event.occurredAt}`} className="client-portal-page__timeline-item">
                        <div className="client-portal-page__timeline-marker" aria-hidden="true" />
                        <div className="client-portal-page__timeline-copy">
                          <strong>{event.label}</strong>
                          <span>{formatPortalDate(event.occurredAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>
            </>
          ) : null}
        </Section>
      </section>
    </PublicShell>
  )
}
