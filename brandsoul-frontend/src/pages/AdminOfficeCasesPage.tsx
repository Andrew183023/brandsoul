import { useEffect, useMemo, useState } from 'react'
import React, { type FormEvent } from 'react'

void React

import {
  assignCase,
  closeCase,
  getOfficeBusinessConfig,
  getCase,
  getCaseMessages,
  getLawyerReputation,
  listOfficeCases,
  respondToCase,
  updateCaseStatus,
  type AdminLegalCase,
  type AdminLegalCaseMessage,
  type AdminLawyerReputation,
} from '../backend-bridge/api/adminApi'
import { ConversationThread } from '../app/components/ConversationThread'
import ProfessionalReputationCard from '../app/components/ProfessionalReputationCard'
import { LEGAL_ROUTES } from '../app/routes/legalRoutes'
import AdminOfficeLayout from '../components/AdminOfficeLayout'
import FeedbackBanner from '../components/FeedbackBanner'
import StatusChip from '../components/StatusChip'
import SurfaceCard from '../components/SurfaceCard'
import { buildCaseBacklogReport } from '../lib/caseBacklogDashboard'
import { useAuthSession } from '../lib/session'
import {
  evaluatePriorityQueue,
  formatDurationMinutes,
  formatPriorityLevel,
  type PriorityLevel,
} from '../lib/priorityQueueEngine'
import { evaluateOfficeCapacityRuntime } from '../lib/officeCapacityRuntime'
import {
  buildEscalationMessage,
  buildForwardMessage,
} from '../lib/operationalWorkbench'
import {
  formatCaseStatus,
  formatCaseMonetizationAmount,
  formatDateTime,
  resolveCaseStatusTone,
} from './adminCaseUi'

type AdminOfficeCasesPageProps = {
  officeId: string
}

type StatusAction = 'em-atendimento' | 'pendente-cliente' | 'finalizado'

export function resolveStatusActionTransitionPayload(statusAction: StatusAction) {
  if (statusAction === 'em-atendimento') {
    return {
      status: 'in_progress' as const,
      reason: 'admin_cabin_status_update:em-atendimento',
    }
  }

  if (statusAction === 'pendente-cliente') {
    return {
      status: 'pending' as const,
      reason: 'admin_cabin_status_update:pendente-cliente',
    }
  }

  return null
}

export function shouldDisableStatusUpdateAction(
  selectedCase: AdminLegalCase | null,
  isStatusUpdating: boolean,
  isAssigning: boolean,
) {
  return !selectedCase || isStatusUpdating || isAssigning || selectedCase.status === 'closed'
}

export function applyLocalStatusUpdate(
  selectedCase: AdminLegalCase,
  nextStatus: 'in_progress' | 'pending',
): AdminLegalCase {
  const responseState: AdminLegalCase['responseState'] = nextStatus === 'pending' ? 'waiting_client' : 'active'

  return {
    ...selectedCase,
    status: nextStatus,
    responseState,
  }
}

export function resolveCaseActionErrorMessage(message: string, action: 'assign' | 'respond' | 'status' | 'forward' | 'escalate') {
  if (message.includes('Assuma ou atribua o caso antes de enviar resposta.')) {
    return 'Assuma ou atribua o caso antes de enviar resposta.'
  }

  if (message.includes('Você precisa ter permissão neste escritório para responder.')) {
    return 'Você precisa ter permissão neste escritório para responder.'
  }

  if (message.includes('Vincule um profissional ao seu acesso antes de assumir casos.')) {
    return 'Vincule um profissional ao seu acesso antes de assumir casos.'
  }

  if (message.includes('Cadastre ou vincule um profissional antes de assumir este caso.')) {
    return 'Antes de assumir casos, vincule um profissional ao seu acesso.'
  }

  if (message.includes('Não foi possível encontrar o profissional responsável por este escritório.')) {
    return 'Não foi possível assumir este caso agora.'
  }

  if (message.includes('not found') || message.includes('CASE_NOT_FOUND')) {
    return action === 'assign'
      ? 'Não foi possível assumir este caso agora.'
      : 'Este caso não está mais disponível nesta visualização.'
  }

  if (message.includes('Failed to assign case')) {
    return 'Não foi possível assumir este caso agora.'
  }

  if (message.includes('Closed or archived cases cannot be transitioned')) {
    return 'Casos encerrados ou arquivados não podem ter o status atualizado por esta ação.'
  }

  if (message.includes('This endpoint only supports transitions')) {
    return 'Este fluxo de atualização aceita apenas os status operacionais permitidos.'
  }

  if (message.includes('Forbidden') || message.includes('forbidden')) {
    return action === 'respond'
      ? 'Você precisa ter permissão neste escritório para responder.'
      : 'Você não tem permissão para concluir esta ação agora.'
  }

  return message
}

export default function AdminOfficeCasesPage({ officeId }: AdminOfficeCasesPageProps) {
  const authSession = useAuthSession()
  const [cases, setCases] = useState<AdminLegalCase[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [selectedCase, setSelectedCase] = useState<AdminLegalCase | null>(null)
  const [messages, setMessages] = useState<AdminLegalCaseMessage[]>([])
  const [responseText, setResponseText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCaseLoading, setIsCaseLoading] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [isStatusUpdating, setIsStatusUpdating] = useState(false)
  const [isForwarding, setIsForwarding] = useState(false)
  const [isEscalating, setIsEscalating] = useState(false)
  const [isReputationLoading, setIsReputationLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [reputation, setReputation] = useState<AdminLawyerReputation | null>(null)
  const [reputationError, setReputationError] = useState<string | null>(null)
  const [officeConfig, setOfficeConfig] = useState<Awaited<ReturnType<typeof getOfficeBusinessConfig>>['businessConfig'] | null>(null)
  const [prioritySnapshotAt, setPrioritySnapshotAt] = useState<string>(new Date().toISOString())
  const [statusAction, setStatusAction] = useState<StatusAction>('em-atendimento')
  const [forwardDestination, setForwardDestination] = useState('')
  const [forwardNote, setForwardNote] = useState('')
  const [escalationSeverity, setEscalationSeverity] = useState<'alta' | 'moderada' | 'baixa'>('alta')
  const [escalationReason, setEscalationReason] = useState('')

  function resolvePriorityTone(level: PriorityLevel) {
    if (level === 'critical') {
      return 'danger' as const
    }

    if (level === 'high') {
      return 'warning' as const
    }

    if (level === 'medium') {
      return 'neutral' as const
    }

    return 'success' as const
  }

  function formatSlaRemainingLabel(value: number | null) {
    if (value == null) {
      return 'SLA não configurado'
    }

    if (value < 0) {
      return `SLA estourado há ${formatDurationMinutes(Math.abs(value))}`
    }

    return `SLA restante ${formatDurationMinutes(value)}`
  }

  async function loadCases(preferredCaseId?: string | null) {
    setIsLoading(true)
    setError(null)

    try {
      const [payload, officeConfigPayload] = await Promise.all([
        listOfficeCases(officeId),
        getOfficeBusinessConfig(officeId).catch(() => null),
      ])
      const snapshotAt = new Date().toISOString()
      setCases(payload.cases)
      const nextOfficeConfig = officeConfigPayload?.businessConfig ?? null
      setOfficeConfig(nextOfficeConfig)
      setPrioritySnapshotAt(snapshotAt)

      const queuePreview = evaluatePriorityQueue(payload.cases, {
        nowIso: snapshotAt,
        officeConfig: nextOfficeConfig,
      })

      const nextSelectedId = preferredCaseId
        ?? selectedCaseId
        ?? queuePreview.entries[0]?.caseItem.id
        ?? null

      setSelectedCaseId(nextSelectedId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao carregar casos.')
    } finally {
      setIsLoading(false)
    }
  }

  const priorityQueue = useMemo(
    () => evaluatePriorityQueue(cases, {
      nowIso: prioritySnapshotAt,
      officeConfig,
    }),
    [cases, officeConfig, prioritySnapshotAt],
  )

  const prioritizedCases = useMemo(
    () => priorityQueue.entries.map((entry) => entry.caseItem),
    [priorityQueue.entries],
  )

  const priorityByCaseId = useMemo(
    () => new Map(priorityQueue.entries.map((entry) => [entry.caseItem.id, entry])),
    [priorityQueue.entries],
  )

  const backlogReport = useMemo(
    () => buildCaseBacklogReport(priorityQueue),
    [priorityQueue],
  )

  const operationalReport = useMemo(() => {
    if (backlogReport.kpis.backlogTotal === 0) {
      return 'Sem backlog ativo no momento.'
    }

    if (backlogReport.buckets.criticalCases > 0 || backlogReport.buckets.delayedCases > 0) {
      return 'Pressão alta: priorize casos críticos e atrasados antes de novas atribuições.'
    }

    if (backlogReport.buckets.expiringSlaCases > 0) {
      return 'Atenção preventiva: existem casos vencendo SLA nas próximas janelas.'
    }

    return 'Operação estável: backlog sob controle com fila priorizada ativa.'
  }, [backlogReport])

  const selectedPriority = useMemo(
    () => (selectedCase ? priorityByCaseId.get(selectedCase.id) : undefined),
    [priorityByCaseId, selectedCase],
  )

  const capacityRuntime = useMemo(
    () => evaluateOfficeCapacityRuntime({
      cases,
      officeConfig,
    }),
    [cases, officeConfig],
  )
  const responseRequiresAssignment = !selectedCase?.isAssigned
  const showTeamBindingCta = error === 'Antes de assumir casos, vincule um profissional ao seu acesso.'

  function canAssumeCase(caseItem: AdminLegalCase) {
    return !caseItem.isAssigned && caseItem.status === 'open'
  }

  function resolveCapacityTone() {
    if (capacityRuntime.state === 'OVERLOAD') {
      return 'danger' as const
    }

    if (capacityRuntime.state === 'PRESSAO') {
      return 'warning' as const
    }

    if (capacityRuntime.state === 'ATENCAO') {
      return 'warning' as const
    }

    return 'success' as const
  }

  useEffect(() => {
    void loadCases(null)
  }, [officeId])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadCases(selectedCaseId)
    }, 30_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [officeId, selectedCaseId])

  useEffect(() => {
    async function loadSelectedCase() {
      if (!selectedCaseId) {
        setSelectedCase(null)
        setMessages([])
        return
      }

      try {
        setIsCaseLoading(true)
        setError(null)

        const [casePayload, messagesPayload] = await Promise.all([
          getCase(selectedCaseId),
          getCaseMessages(selectedCaseId),
        ])

        setSelectedCase(casePayload.case)
        setMessages(messagesPayload.messages)
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Erro ao carregar o caso.')
      } finally {
        setIsCaseLoading(false)
      }
    }

    void loadSelectedCase()
  }, [selectedCaseId])

  useEffect(() => {
    const stableAssignedLawyerId = selectedCase?.assignedProfessionalId ?? selectedCase?.assignedLawyerId ?? ''

    if (!stableAssignedLawyerId) {
      setReputation(null)
      setReputationError(null)
      setIsReputationLoading(false)
      return
    }

    let cancelled = false

    async function loadReputation() {
      try {
        setIsReputationLoading(true)
        setReputation(null)
        setReputationError(null)

        const payload = await getLawyerReputation(String(officeId), String(stableAssignedLawyerId))
        if (!cancelled) {
          setReputation(payload.reputation)
        }
      } catch (nextError) {
        if (!cancelled) {
          setReputationError(nextError instanceof Error ? nextError.message : 'Erro ao carregar a reputação do advogado.')
        }
      } finally {
        if (!cancelled) {
          setIsReputationLoading(false)
        }
      }
    }

    void loadReputation()

    return () => {
      cancelled = true
    }
  }, [officeId, selectedCase?.assignedProfessionalId, selectedCase?.assignedLawyerId, selectedCase?.updatedAt])

  async function refreshSelectedCase(caseId: string, feedback?: string) {
    const [casePayload, messagesPayload] = await Promise.all([
      getCase(caseId),
      getCaseMessages(caseId),
    ])

    setSelectedCase(casePayload.case)
    setMessages(messagesPayload.messages)
    setSelectedCaseId(casePayload.case.id)
    if (feedback) {
      setActionFeedback(feedback)
    }
    await loadCases(casePayload.case.id)
  }

  async function handleAssignCase(caseId: string, requireConfirmation = true) {
    if (requireConfirmation) {
      const confirmed = window.confirm(`Assumir este caso registra uma cobrança simulada fixa de ${formatCaseMonetizationAmount()}. Deseja continuar?`)
      if (!confirmed) {
        return
      }
    }

    try {
      setIsAssigning(true)
      setActionFeedback(null)
      setError(null)
      const payload = await assignCase(caseId)
      await refreshSelectedCase(
        payload.case.id,
        `Caso assumido com sucesso. Cobrança simulada registrada em ${formatCaseMonetizationAmount(payload.case.monetization?.amountCents, payload.case.monetization?.currency)}.`,
      )
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Erro ao assumir caso.'
      setError(resolveCaseActionErrorMessage(message, 'assign'))
    } finally {
      setIsAssigning(false)
    }
  }

  async function handleRespond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedCaseId || !responseText.trim()) {
      return
    }

    try {
      setIsResponding(true)
      setActionFeedback(null)
      setError(null)
      const payload = await respondToCase(selectedCaseId, responseText.trim())
      setMessages(payload.messages)
      setResponseText('')
      await refreshSelectedCase(selectedCaseId, 'Resposta enviada dentro do case.')
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Erro ao responder caso.'
      setError(resolveCaseActionErrorMessage(message, 'respond'))
    } finally {
      setIsResponding(false)
    }
  }

  async function handleStatusUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedCase) {
      return
    }

    try {
      setIsStatusUpdating(true)
      setActionFeedback(null)
      setError(null)

      const statusTransition = resolveStatusActionTransitionPayload(statusAction)
      if (statusTransition) {
        await updateCaseStatus(selectedCase.id, statusTransition)
        setSelectedCase((current) => {
          if (!current || current.id !== selectedCase.id) {
            return current
          }

          return applyLocalStatusUpdate(current, statusTransition.status)
        })
        await refreshSelectedCase(
          selectedCase.id,
          statusTransition.status === 'in_progress'
            ? 'Status atualizado para em atendimento.'
            : 'Status atualizado para aguardando cliente.',
        )
        return
      }

      const closedBy = authSession?.user?.name?.trim() || authSession?.user?.email?.trim() || 'operador'
      await closeCase(selectedCase.id, {
        rating: 5,
        feedback: 'Caso finalizado pela cabine operacional.',
        closedBy,
      })
      await refreshSelectedCase(selectedCase.id, 'Caso finalizado na cabine sem troca de contexto.')
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Erro ao atualizar status do caso.'
      setError(resolveCaseActionErrorMessage(message, 'status'))
    } finally {
      setIsStatusUpdating(false)
    }
  }

  async function handleForwardCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedCase || !forwardDestination.trim()) {
      return
    }

    try {
      setIsForwarding(true)
      setActionFeedback(null)
      setError(null)

      await respondToCase(selectedCase.id, buildForwardMessage({
        destination: forwardDestination,
        note: forwardNote,
      }))
      setForwardDestination('')
      setForwardNote('')
      await refreshSelectedCase(selectedCase.id, 'Encaminhamento registrado na trilha do caso.')
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Erro ao encaminhar caso.'
      setError(resolveCaseActionErrorMessage(message, 'forward'))
    } finally {
      setIsForwarding(false)
    }
  }

  async function handleEscalateCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedCase || !escalationReason.trim()) {
      return
    }

    try {
      setIsEscalating(true)
      setActionFeedback(null)
      setError(null)

      await respondToCase(selectedCase.id, buildEscalationMessage({
        severity: escalationSeverity,
        reason: escalationReason,
      }))
      setEscalationReason('')
      await refreshSelectedCase(selectedCase.id, 'Escalonamento registrado para a rotina operacional.')
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Erro ao escalonar caso.'
      setError(resolveCaseActionErrorMessage(message, 'escalate'))
    } finally {
      setIsEscalating(false)
    }
  }

  return (
    <AdminOfficeLayout
      officeId={officeId}
      section="casos"
      title="Casos"
      subtitle="Painel operacional do fluxo de casos do escritório dentro da plataforma."
    >
      {error ? (
        <FeedbackBanner tone="error">
          <span>{error}</span>
          {showTeamBindingCta ? (
            <span className="admin-feedback-inline-action">
              {' '}
              <a href={LEGAL_ROUTES.admin.escritorio(officeId, 'equipe')}>Ir para Equipe</a>
            </span>
          ) : null}
        </FeedbackBanner>
      ) : null}
      {actionFeedback ? <FeedbackBanner tone="success">{actionFeedback}</FeedbackBanner> : null}

      <SurfaceCard tone="admin" className="admin-card admin-backlog-dashboard">
        <div className="admin-card-header">
          <h2>Painel do backlog de casos</h2>
          <span>Atualizado em {formatDateTime(backlogReport.generatedAt)}</span>
        </div>

        <p className="admin-diagnosis-copy">{operationalReport}</p>

        <div className="admin-domain-grid admin-backlog-dashboard__buckets">
          <article className="admin-domain-card">
            <strong>Casos críticos</strong>
            <span>{backlogReport.buckets.criticalCases}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Casos atrasados</strong>
            <span>{backlogReport.buckets.delayedCases}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Sem resposta</strong>
            <span>{backlogReport.buckets.noResponseCases}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Vencendo SLA</strong>
            <span>{backlogReport.buckets.expiringSlaCases}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Aguardando operador</strong>
            <span>{backlogReport.buckets.waitingOperatorCases}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Aguardando cliente</strong>
            <span>{backlogReport.buckets.waitingClientCases}</span>
          </article>
        </div>

        <div className="admin-domain-grid admin-backlog-dashboard__kpis">
          <article className="admin-domain-card">
            <strong>Backlog total</strong>
            <span>{backlogReport.kpis.backlogTotal}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Backlog crítico</strong>
            <span>{backlogReport.kpis.backlogCritical}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Primeira resposta média</strong>
            <span>
              {backlogReport.kpis.averageFirstResponseMinutes == null
                ? 'Sem dados'
                : formatDurationMinutes(backlogReport.kpis.averageFirstResponseMinutes)}
            </span>
          </article>
          <article className="admin-domain-card">
            <strong>SLA médio (restante)</strong>
            <span>
              {backlogReport.kpis.averageSlaRemainingMinutes == null
                ? 'Sem SLA configurado'
                : formatDurationMinutes(Math.abs(backlogReport.kpis.averageSlaRemainingMinutes))
                  + (backlogReport.kpis.averageSlaRemainingMinutes < 0 ? ' em atraso' : ' restante')}
            </span>
          </article>
        </div>

        <section className="admin-diagnosis-section">
          <h3>Casos por responsável</h3>
          {backlogReport.kpis.casesByOperator.length === 0 ? (
            <p className="admin-diagnosis-copy">Nenhum caso atribuído no momento.</p>
          ) : (
            <ul className="admin-diagnosis-list">
              {backlogReport.kpis.casesByOperator.map((item) => (
                <li key={item.operatorId}>{item.operatorId}: {item.cases} caso(s)</li>
              ))}
            </ul>
          )}
        </section>
      </SurfaceCard>

      <SurfaceCard tone="admin" className="admin-card admin-capacity-runtime-card">
        <div className="admin-card-header">
          <h2>Capacidade operacional</h2>
          <StatusChip tone={resolveCapacityTone()}>{capacityRuntime.state}</StatusChip>
        </div>

        <div className="admin-domain-grid admin-capacity-runtime-grid">
          <article className="admin-domain-card">
            <strong>Capacidade atual</strong>
            <span>{capacityRuntime.declaredCapacity}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Carga atual</strong>
            <span>{capacityRuntime.activeCases}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Pressão operacional</strong>
            <span>{capacityRuntime.operationalPressurePercent}%</span>
          </article>
          <article className="admin-domain-card">
            <strong>Risco de overload</strong>
            <span>{capacityRuntime.overloadRisk}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Capacidade livre</strong>
            <span>{capacityRuntime.freeCapacity}</span>
          </article>
          <article className="admin-domain-card">
            <strong>Operadores ativos</strong>
            <span>{capacityRuntime.activeOperators}</span>
          </article>
          <article className="admin-domain-card">
            <strong>SLA configurado</strong>
            <span>
              {capacityRuntime.configuredSlaMinutes == null
                ? 'Não configurado'
                : formatDurationMinutes(capacityRuntime.configuredSlaMinutes)}
            </span>
          </article>
          <article className="admin-domain-card">
            <strong>Utilizacao</strong>
            <span>{capacityRuntime.utilizationPercent}%</span>
          </article>
        </div>

        <p className="admin-diagnosis-copy">{capacityRuntime.reason}</p>
      </SurfaceCard>

        <section className="admin-workbench-layout" aria-label="Cabine operacional de casos">
        <SurfaceCard tone="admin" className="admin-card admin-workbench-column">
          <div className="admin-card-header">
            <h2>Fila priorizada</h2>
            <span>{isLoading ? 'Carregando...' : `${prioritizedCases.length} caso${prioritizedCases.length === 1 ? '' : 's'}`}</span>
          </div>
          <p className="admin-diagnosis-meta">
            Sequenciamento automático por prioridade operacional. Selecione um caso para atuar sem trocar de tela.
          </p>

          {isLoading ? (
            <FeedbackBanner>Carregando fila...</FeedbackBanner>
          ) : prioritizedCases.length === 0 ? (
            <FeedbackBanner>Nenhum caso encontrado para este escritório.</FeedbackBanner>
          ) : (
            <ul className="admin-office-list">
              {prioritizedCases.map((item) => {
                const priority = priorityByCaseId.get(item.id)
                const isSelected = selectedCaseId === item.id

                return (
                  <li key={item.id} className={`admin-office-item ${isSelected ? 'admin-workbench-queue-item--selected' : ''}`}>
                    <div className="admin-office-main">
                      <strong>{item.description}</strong>
                      <span>{item.id}</span>
                      <span>{item.assignedProfessionalId ? `Responsável: ${item.assignedProfessionalId}` : 'Sem responsável atribuído'}</span>
                      {priority ? (
                        <>
                          <span>Prioridade: {formatPriorityLevel(priority.level)} ({priority.score})</span>
                          <span>Sem resposta: {formatDurationMinutes(priority.metrics.timeWithoutResponseMinutes)}</span>
                          <span>{formatSlaRemainingLabel(priority.metrics.slaRemainingMinutes)}</span>
                        </>
                      ) : null}
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="admin-button admin-button--ghost"
                          onClick={() => setSelectedCaseId(item.id)}
                        >
                          Selecionar
                        </button>
                        {canAssumeCase(item) ? (
                          <button
                            type="button"
                            className="admin-button"
                            onClick={() => void handleAssignCase(item.id)}
                            disabled={isAssigning}
                          >
                            {isAssigning && selectedCaseId === item.id ? 'Assumindo...' : 'Assumir'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="admin-office-meta">
                      <StatusChip tone={resolveCaseStatusTone(item.status)}>{formatCaseStatus(item.status)}</StatusChip>
                      {priority ? <StatusChip tone={resolvePriorityTone(priority.level)}>{formatPriorityLevel(priority.level)}</StatusChip> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard tone="admin" className="admin-card admin-workbench-column">
          <div className="admin-card-header">
            <h2>Resumo do caso</h2>
            <span>{selectedCase ? selectedCase.id : 'nenhum caso selecionado'}</span>
          </div>

          {isCaseLoading ? (
            <FeedbackBanner>Carregando resumo do caso...</FeedbackBanner>
          ) : !selectedCase ? (
                    <FeedbackBanner>Selecione um caso na fila para abrir o resumo.</FeedbackBanner>
          ) : (
            <>
              {selectedPriority ? (
                <section className="admin-diagnosis-section">
                  <h3>Prioridade operacional</h3>
                  <ul className="admin-diagnosis-list">
                    <li>Nível: {formatPriorityLevel(selectedPriority.level)} ({selectedPriority.score})</li>
                    <li>Tempo sem resposta: {formatDurationMinutes(selectedPriority.metrics.timeWithoutResponseMinutes)}</li>
                    <li>{formatSlaRemainingLabel(selectedPriority.metrics.slaRemainingMinutes)}</li>
                    {(selectedPriority.reasons ?? []).slice(0, 3).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="admin-domain-grid">
                <article className="admin-domain-card">
                  <strong>Status</strong>
                  <StatusChip tone={resolveCaseStatusTone(selectedCase.status)}>{formatCaseStatus(selectedCase.status)}</StatusChip>
                </article>
                <article className="admin-domain-card">
                  <strong>Responsável</strong>
                  <span>{selectedCase.assignedProfessionalId ?? selectedCase.assignedLawyerId ?? 'Não atribuído'}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Resposta</strong>
                  <span>{selectedCase.responseState === 'waiting_client' ? 'Aguardando cliente' : selectedCase.responseState === 'waiting_office' ? 'Aguardando escritório' : selectedCase.responseState === 'closed' ? 'Encerrado' : 'Ativo'}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Criado em</strong>
                  <span>{formatDateTime(selectedCase.createdAt)}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Atualizado em</strong>
                  <span>{formatDateTime(selectedCase.updatedAt)}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Resumo</strong>
                  <span>{selectedCase.description}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Cobrança simulada</strong>
                  <span>
                    {selectedCase.monetization
                      ? `${formatCaseMonetizationAmount(selectedCase.monetization.amountCents, selectedCase.monetization.currency)} (${selectedCase.monetization.status})`
                      : `Taxa fixa prevista: ${formatCaseMonetizationAmount()}`}
                  </span>
                </article>
              </div>

              <section className="admin-diagnosis-section">
                <h3>Histórico de mensagens</h3>
                <ConversationThread messages={messages} />
              </section>
            </>
          )}
        </SurfaceCard>

        <SurfaceCard tone="admin" className="admin-card admin-workbench-column">
          <div className="admin-card-header">
            <h2>Ações operacionais</h2>
            <span>Sem sair da tela</span>
          </div>

          {!selectedCase ? (
            <FeedbackBanner>Selecione um caso na fila para habilitar as ações.</FeedbackBanner>
          ) : (
            <>
              <form className="admin-form" onSubmit={(event) => void handleStatusUpdate(event)}>
                <label className="admin-field">
                  <span>Atualizar status</span>
                  <select value={statusAction} onChange={(event) => setStatusAction(event.target.value as StatusAction)}>
                    <option value="em-atendimento">Em atendimento</option>
                    <option value="pendente-cliente">Aguardando cliente</option>
                    <option value="finalizado">Finalizado</option>
                  </select>
                </label>
                <div className="admin-actions">
                  <button
                    type="submit"
                    className="admin-button"
                    disabled={shouldDisableStatusUpdateAction(selectedCase, isStatusUpdating, isAssigning)}
                  >
                    {isStatusUpdating ? 'Atualizando...' : 'Atualizar status'}
                  </button>
                </div>
              </form>

              <form className="admin-form" onSubmit={(event) => void handleRespond(event)}>
                <label className="admin-field">
                  <span>Responder caso</span>
                  <textarea
                    value={responseText}
                    onChange={(event) => setResponseText(event.target.value)}
                    rows={4}
                    placeholder="Escreva a resposta do advogado..."
                    disabled={responseRequiresAssignment || isResponding || selectedCase.status === 'closed'}
                  />
                </label>
                {responseRequiresAssignment ? (
                  <p className="admin-diagnosis-copy">Assuma ou atribua este caso para liberar resposta.</p>
                ) : null}
                <div className="admin-actions">
                  <button type="submit" className="admin-button" disabled={responseRequiresAssignment || isResponding || selectedCase.status === 'closed'}>
                    {isResponding ? 'Enviando...' : 'Responder'}
                  </button>
                  {canAssumeCase(selectedCase) ? (
                    <button
                      type="button"
                      className="admin-button admin-button--ghost"
                      onClick={() => void handleAssignCase(selectedCase.id)}
                      disabled={isAssigning}
                    >
                      {isAssigning ? 'Assumindo...' : 'Assumir caso'}
                    </button>
                  ) : null}
                </div>
              </form>

              <form className="admin-form" onSubmit={(event) => void handleForwardCase(event)}>
                <label className="admin-field">
                  <span>Encaminhar</span>
                  <input
                    value={forwardDestination}
                    onChange={(event) => setForwardDestination(event.target.value)}
                    placeholder="Destino (ex: Núcleo Trabalhista)"
                  />
                </label>
                <label className="admin-field">
                  <span>Nota de encaminhamento (opcional)</span>
                  <textarea
                    rows={3}
                    value={forwardNote}
                    onChange={(event) => setForwardNote(event.target.value)}
                    placeholder="Contexto para quem vai receber o caso"
                  />
                </label>
                <div className="admin-actions">
                  <button type="submit" className="admin-button" disabled={isForwarding || selectedCase.status === 'closed' || !forwardDestination.trim()}>
                    {isForwarding ? 'Encaminhando...' : 'Encaminhar caso'}
                  </button>
                </div>
              </form>

              <form className="admin-form" onSubmit={(event) => void handleEscalateCase(event)}>
                <label className="admin-field">
                  <span>Escalonar</span>
                  <select value={escalationSeverity} onChange={(event) => setEscalationSeverity(event.target.value as 'alta' | 'moderada' | 'baixa')}>
                    <option value="alta">Severidade alta</option>
                    <option value="moderada">Severidade moderada</option>
                    <option value="baixa">Severidade baixa</option>
                  </select>
                </label>
                <label className="admin-field">
                  <span>Motivo do escalonamento</span>
                  <textarea
                    rows={3}
                    value={escalationReason}
                    onChange={(event) => setEscalationReason(event.target.value)}
                    placeholder="Descreva o motivo para a rotina operacional"
                  />
                </label>
                <div className="admin-actions">
                  <button type="submit" className="admin-button" disabled={isEscalating || selectedCase.status === 'closed' || !escalationReason.trim()}>
                    {isEscalating ? 'Escalonando...' : 'Escalonar caso'}
                  </button>
                </div>
              </form>

              <ProfessionalReputationCard
                lawyerId={selectedCase.assignedProfessionalId ?? selectedCase.assignedLawyerId}
                reputation={reputation}
                isLoading={isReputationLoading}
                error={reputationError}
                emptyMessage="A reputação aparece após a atribuição do advogado."
              />
            </>
          )}
        </SurfaceCard>
      </section>
    </AdminOfficeLayout>
  )
}
