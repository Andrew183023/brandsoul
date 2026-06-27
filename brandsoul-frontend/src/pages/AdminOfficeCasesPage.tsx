import { useEffect, useMemo, useRef, useState } from 'react'
import React, { type FormEvent } from 'react'

void React

import '../styles/adminOfficeCasesPage.css'

import {
  assignCase,
  listOfficeProfessionals,
  type OfficeProfessional,
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
type WorkbenchPanel = 'attendance' | 'response' | 'status' | 'forward' | 'escalation'

export function resolveStatusActionTransitionPayload(statusAction: StatusAction) {
  if (statusAction === 'em-atendimento') {
    return {
      status: 'in_progress' as const,
      reason: 'admin_cabin_status_update:em-atendimento',
    }
  }

  if (statusAction === 'pendente-cliente') {
    return {
      status: 'accepted' as const,
      reason: 'admin_cabin_status_update:aceito',
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

function buildCaseReference(caseId: string) {
  const compact = caseId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return `CASO-${compact.slice(0, 8) || 'LEGAL'}`
}

function readNestedString(record: unknown, path: string[]) {
  let current: unknown = record

  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined
    }

    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === 'string' && current.trim() ? current.trim() : undefined
}

function isLikelyContactValue(value: string) {
  return value.includes('@') || /[\d()+-]{6,}/.test(value) || value.startsWith('http')
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
  const [officeProfessionals, setOfficeProfessionals] = useState<OfficeProfessional[]>([])
  const [selectedProfessionalIdByCaseId, setSelectedProfessionalIdByCaseId] = useState<Record<string, string>>({})
  const [reputation, setReputation] = useState<AdminLawyerReputation | null>(null)
  const [reputationError, setReputationError] = useState<string | null>(null)
  const [officeConfig, setOfficeConfig] = useState<Awaited<ReturnType<typeof getOfficeBusinessConfig>>['businessConfig'] | null>(null)
  const [prioritySnapshotAt, setPrioritySnapshotAt] = useState<string>(new Date().toISOString())
  const [statusAction, setStatusAction] = useState<StatusAction>('em-atendimento')
  const [forwardDestination, setForwardDestination] = useState('')
  const [forwardNote, setForwardNote] = useState('')
  const [escalationSeverity, setEscalationSeverity] = useState<'alta' | 'moderada' | 'baixa'>('alta')
  const [escalationReason, setEscalationReason] = useState('')
  const [showIndicators, setShowIndicators] = useState(false)
  const [activeWorkbenchPanel, setActiveWorkbenchPanel] = useState<WorkbenchPanel>('attendance')
  const casesLoadRequestIdRef = useRef(0)
  const selectedCaseLoadRequestIdRef = useRef(0)

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

  function formatPriorityBadgeLabel(level: PriorityLevel) {
    if (level === 'critical') {
      return 'Crítico'
    }

    if (level === 'high') {
      return 'Alto'
    }

    if (level === 'medium') {
      return 'Médio'
    }

    return 'Baixo'
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

  function formatResponseStateLabel(value: AdminLegalCase['responseState']) {
    if (value === 'waiting_client') {
      return 'Aguardando cliente'
    }

    if (value === 'waiting_office') {
      return 'Aguardando escritório'
    }

    if (value === 'closed') {
      return 'Encerrado'
    }

    return 'Ativo'
  }

  async function loadCases(preferredCaseId?: string | null) {
    const requestId = ++casesLoadRequestIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      const [payload, officeConfigPayload] = await Promise.all([
        listOfficeCases(officeId),
        getOfficeBusinessConfig(officeId).catch(() => null),
      ])
      const snapshotAt = new Date().toISOString()
      if (requestId !== casesLoadRequestIdRef.current) {
        return
      }

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
      if (requestId === casesLoadRequestIdRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'Erro ao carregar casos.')
      }
    } finally {
      if (requestId === casesLoadRequestIdRef.current) {
        setIsLoading(false)
      }
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
  const activeOfficeProfessionals = useMemo(
    () => officeProfessionals.filter((professional) => professional.status === 'active'),
    [officeProfessionals],
  )
  const professionalById = useMemo(
    () => new Map(officeProfessionals.map((professional) => [professional.id, professional])),
    [officeProfessionals],
  )

  const responseRequiresAssignment = !selectedCase?.isAssigned
  const showTeamBindingCta = error === 'Antes de assumir casos, vincule um profissional ao seu acesso.'

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

  function resolveProfessionalLabelById(professionalId?: string) {
    if (!professionalId) {
      return 'Sem responsável'
    }

    const professional = professionalById.get(professionalId)
    if (!professional) {
      return 'Responsável não identificado'
    }

    return professional.oabCredential
      ? `${professional.displayName} · ${professional.oabCredential}`
      : professional.displayName
  }

  function resolveQueueClientLabel(caseItem: AdminLegalCase) {
    const normalizedContact = caseItem.contact?.trim()
    if (normalizedContact) {
      return normalizedContact
    }

    const firstClientMessage = caseItem.messages.find((message) => message.role === 'user')?.text?.trim()
    if (firstClientMessage) {
      return firstClientMessage.length > 56 ? `${firstClientMessage.slice(0, 56)}...` : firstClientMessage
    }

    return 'Cliente sem identificação'
  }

  function resolveSelectedCaseClientName(caseItem: AdminLegalCase, caseMessages: AdminLegalCaseMessage[]) {
    const metadata = (caseItem as unknown as { metadata?: unknown }).metadata
    const metadataName = readNestedString(metadata, ['clientName'])
      ?? readNestedString(metadata, ['fullName'])
      ?? readNestedString(metadata, ['name'])
      ?? readNestedString(metadata, ['customer', 'name'])
      ?? readNestedString(metadata, ['contact', 'name'])
      ?? readNestedString(metadata, ['publicTriage', 'clientName'])

    if (metadataName) {
      return metadataName
    }

    const primaryContact = caseItem.contact?.trim()
    if (primaryContact && !isLikelyContactValue(primaryContact)) {
      return primaryContact
    }

    const firstClientMessage = caseMessages.find((message) => message.role === 'user')?.text?.trim()
    if (firstClientMessage && firstClientMessage.length <= 56 && !isLikelyContactValue(firstClientMessage)) {
      return firstClientMessage
    }

    return 'Cliente não identificado'
  }

  function resolveSelectedCasePrimaryContact(caseItem: AdminLegalCase) {
    const metadata = (caseItem as unknown as { metadata?: unknown }).metadata
    const contactPreference = readNestedString(metadata, ['contactPreference'])
      ?? readNestedString(metadata, ['publicTriage', 'contactPreference'])
    const contactValue = readNestedString(metadata, ['contactValue'])
      ?? readNestedString(metadata, ['publicTriage', 'contactValue'])
      ?? readNestedString(metadata, ['contact'])
      ?? readNestedString(metadata, ['contact', 'value'])
      ?? readNestedString(metadata, ['contact', 'whatsapp'])
      ?? readNestedString(metadata, ['contact', 'phone'])
      ?? readNestedString(metadata, ['contact', 'email'])

    if (contactPreference && contactValue) {
      return `${contactPreference} · ${contactValue}`
    }

    if (contactValue) {
      return contactValue
    }

    return caseItem.contact?.trim() || 'Contato não informado'
  }

  function resolveSelectedCaseSummary(caseItem: AdminLegalCase) {
    const normalizedDescription = caseItem.description?.trim()
    if (normalizedDescription) {
      return normalizedDescription
    }

    return 'Sem resumo operacional disponível para este caso.'
  }

  function resolveInitialClientMessage(caseItem: AdminLegalCase | null, caseMessages: AdminLegalCaseMessage[]) {
    if (!caseItem) {
      return 'Selecione um caso para visualizar a primeira mensagem.'
    }

    const firstClientMessage = caseMessages.find((message) => message.role === 'user')
      ?? caseItem.messages.find((message) => message.role === 'user')

    return firstClientMessage?.text?.trim() || caseItem.description || 'Nenhuma mensagem inicial registrada.'
  }

  function resolveSlaProgress(priorityEntry: typeof selectedPriority) {
    const target = priorityEntry?.metrics.slaTargetMinutes
    const remaining = priorityEntry?.metrics.slaRemainingMinutes

    if (target == null || remaining == null || target <= 0) {
      return null
    }

    const consumed = target - remaining
    return Math.max(0, Math.min(1, consumed / target))
  }

  function resolveQueueAgeLabel(priorityEntry: NonNullable<(typeof priorityQueue.entries)[number]>) {
    return `Aberto há ${formatDurationMinutes(priorityEntry.metrics.caseAgeMinutes)}`
  }

  function resolveQuickStatValue(matcher: (entry: (typeof priorityQueue.entries)[number]) => boolean) {
    return priorityQueue.entries.filter(matcher).length
  }

  useEffect(() => {
    void loadCases(null)

    async function loadProfessionals() {
      try {
        const payload = await listOfficeProfessionals(String(officeId))
        setOfficeProfessionals(payload.professionals)
      } catch (nextError) {
        setOfficeProfessionals([])
        console.warn('Failed to load office professionals for case assignment', nextError)
      }
    }

    void loadProfessionals()
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
    if (!selectedCaseId) {
      return
    }

    setActiveWorkbenchPanel('attendance')
  }, [selectedCaseId])

  useEffect(() => {
    async function loadSelectedCase() {
      if (!selectedCaseId) {
        setSelectedCase(null)
        setMessages([])
        return
      }

      const requestId = ++selectedCaseLoadRequestIdRef.current

      try {
        setIsCaseLoading(true)
        setError(null)

        const [casePayload, messagesPayload] = await Promise.all([
          getCase(selectedCaseId),
          getCaseMessages(selectedCaseId),
        ])

        if (requestId !== selectedCaseLoadRequestIdRef.current) {
          return
        }

        setSelectedCase(casePayload.case)
        setMessages(messagesPayload.messages)
      } catch (nextError) {
        if (requestId === selectedCaseLoadRequestIdRef.current) {
          setError(nextError instanceof Error ? nextError.message : 'Erro ao carregar o caso.')
        }
      } finally {
        if (requestId === selectedCaseLoadRequestIdRef.current) {
          setIsCaseLoading(false)
        }
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
    const requestId = ++selectedCaseLoadRequestIdRef.current
    const [casePayload, messagesPayload] = await Promise.all([
      getCase(caseId),
      getCaseMessages(caseId),
    ])

    if (requestId !== selectedCaseLoadRequestIdRef.current) {
      return
    }

    setSelectedCase(casePayload.case)
    setMessages(messagesPayload.messages)
    setSelectedCaseId(casePayload.case.id)
    if (feedback) {
      setActionFeedback(feedback)
    }
    await loadCases(casePayload.case.id)
  }

  const isMutating = isAssigning || isResponding || isStatusUpdating || isForwarding || isEscalating

  async function handleAssignCase(caseId: string, requireConfirmation = true, professionalId?: string) {
    if (isMutating) {
      return
    }

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
      const selectedProfessionalId = professionalId ?? selectedProfessionalIdByCaseId[caseId]
      const payload = await assignCase(caseId, selectedProfessionalId || undefined)
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

    if (isMutating || !selectedCaseId || !responseText.trim()) {
      return
    }

    try {
      setIsResponding(true)
      setActionFeedback(null)
      setError(null)
      await respondToCase(selectedCaseId, responseText.trim())
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

    if (isMutating || !selectedCase) {
      return
    }

    try {
      setIsStatusUpdating(true)
      setActionFeedback(null)
      setError(null)

      const statusTransition = resolveStatusActionTransitionPayload(statusAction)
      if (statusTransition) {
        await updateCaseStatus(selectedCase.id, statusTransition)
        await refreshSelectedCase(
          selectedCase.id,
          statusTransition.status === 'accepted'
            ? 'Status atualizado para aceito.'
            : statusTransition.status === 'in_progress'
              ? 'Status atualizado para em atendimento.'
              : 'Status atualizado para resolvido.',
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

    if (isMutating || !selectedCase || !forwardDestination.trim()) {
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

    if (isMutating || !selectedCase || !escalationReason.trim()) {
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

  const selectedCaseSummary = selectedCase ? resolveSelectedCaseSummary(selectedCase) : null
  const selectedCaseInitialMessage = resolveInitialClientMessage(selectedCase, messages)
  const selectedCaseReference = selectedCase ? buildCaseReference(selectedCase.id) : null
  const selectedCaseClientName = selectedCase ? resolveSelectedCaseClientName(selectedCase, messages) : 'Cliente não identificado'
  const selectedCasePrimaryContact = selectedCase ? resolveSelectedCasePrimaryContact(selectedCase) : 'Contato não informado'
  const selectedSlaProgress = resolveSlaProgress(selectedPriority)
  const unassignedCaseCount = useMemo(
    () => priorityQueue.entries.filter((entry) => !entry.caseItem.isAssigned).length,
    [priorityQueue.entries],
  )
  const waitingClientCount = useMemo(
    () => resolveQuickStatValue((entry) => entry.caseItem.responseState === 'waiting_client'),
    [priorityQueue.entries],
  )
  const criticalCaseCount = useMemo(
    () => resolveQuickStatValue((entry) => entry.level === 'critical'),
    [priorityQueue.entries],
  )

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

      <SurfaceCard tone="admin" className="admin-card admin-cases-cabin__toolbar">
        <div className="admin-cases-cabin__toolbar-main">
          <div>
            <p className="admin-cases-cabin__eyebrow">Cabine operacional</p>
            <h2>Casos</h2>
          </div>
          <button
            type="button"
            className="admin-button admin-button--ghost"
            onClick={() => setShowIndicators((current) => !current)}
          >
            {showIndicators ? 'Ocultar indicadores' : 'Mostrar indicadores'}
          </button>
        </div>
        <div className="admin-cases-cabin__quick-stats" aria-label="Leitura rápida da operação">
          <span>{isLoading ? 'Atualizando fila...' : `${prioritizedCases.length} caso${prioritizedCases.length === 1 ? '' : 's'} na cabine`}</span>
          <span>{criticalCaseCount} crítico(s)</span>
          <span>{unassignedCaseCount} sem responsável</span>
          <span>{waitingClientCount} aguardando cliente</span>
        </div>
      </SurfaceCard>

      {showIndicators ? (
        <>
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
                    <li key={item.operatorId}>
                      {resolveProfessionalLabelById(item.operatorId)}: {item.cases} caso(s)
                    </li>
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
                <strong>Utilização</strong>
                <span>{capacityRuntime.utilizationPercent}%</span>
              </article>
            </div>

            <p className="admin-diagnosis-copy">{capacityRuntime.reason}</p>
          </SurfaceCard>
        </>
      ) : null}

      <section className="admin-workbench-layout admin-cases-cabin" aria-label="Cabine operacional de casos">
        <SurfaceCard tone="admin" className="admin-card admin-workbench-column admin-cases-cabin__queue">
          <div className="admin-card-header">
            <h2>Fila</h2>
            <span>{isLoading ? 'Carregando...' : `${prioritizedCases.length} ticket(s)`}</span>
          </div>
          <p className="admin-diagnosis-meta">
            Clique em um ticket para abrir o caso e operar sem trocar de tela.
          </p>

          {isLoading ? (
            <FeedbackBanner>Carregando fila...</FeedbackBanner>
          ) : prioritizedCases.length === 0 ? (
            <FeedbackBanner>Nenhum caso encontrado para este escritório.</FeedbackBanner>
          ) : (
            <ul className="admin-office-list admin-cases-cabin__queue-list">
              {priorityQueue.entries.map((entry) => {
                const item = entry.caseItem
                const isSelected = selectedCaseId === item.id
                const queueSlaProgress = resolveSlaProgress(entry)

                return (
                  <li key={item.id}>
                      <button
                        type="button"
                        className={`admin-cases-cabin__queue-ticket ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedCaseId(item.id)}
                        disabled={isMutating}
                      >
                      <div className="admin-cases-cabin__queue-ticket-header">
                        <strong>{item.practiceArea?.trim() || 'Caso jurídico geral'}</strong>
                        <StatusChip tone={resolvePriorityTone(entry.level)}>{formatPriorityBadgeLabel(entry.level)}</StatusChip>
                      </div>
                      <span>{resolveQueueClientLabel(item)}</span>
                      <span>{resolveQueueAgeLabel(entry)}</span>
                      <span>{resolveProfessionalLabelById(item.assignedProfessionalId ?? item.assignedLawyerId)}</span>
                      <div className="admin-cases-cabin__queue-ticket-sla">
                        <div className="admin-cases-cabin__sla-bar" aria-hidden="true">
                          <span style={{ width: `${Math.round((queueSlaProgress ?? 0) * 100)}%` }} />
                        </div>
                        <span>{formatSlaRemainingLabel(entry.metrics.slaRemainingMinutes)}</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard tone="admin" className="admin-card admin-workbench-column admin-cases-cabin__detail">
          <div className="admin-card-header">
            <h2>Caso</h2>
            <span>{selectedCase ? formatDateTime(selectedCase.updatedAt) : 'nenhum caso selecionado'}</span>
          </div>

          {isCaseLoading ? (
            <FeedbackBanner>Carregando resumo do caso...</FeedbackBanner>
          ) : !selectedCase ? (
            <FeedbackBanner>Selecione um caso na fila para abrir a ficha operacional.</FeedbackBanner>
          ) : (
            <div className="admin-cases-cabin__detail-stack">
              <header className="admin-cases-cabin__case-header">
                <div>
                  <p className="admin-cases-cabin__eyebrow">Ficha operacional</p>
                  <h3>{resolveQueueClientLabel(selectedCase)}</h3>
                  <p className="admin-cases-cabin__case-subtitle">{selectedCase.practiceArea?.trim() || 'Caso jurídico geral'}</p>
                </div>
                <div className="admin-cases-cabin__case-header-chips">
                  <StatusChip tone={resolveCaseStatusTone(selectedCase.status)}>{formatCaseStatus(selectedCase.status)}</StatusChip>
                  {selectedPriority ? (
                    <StatusChip tone={resolvePriorityTone(selectedPriority.level)}>
                      {formatPriorityBadgeLabel(selectedPriority.level)}
                    </StatusChip>
                  ) : null}
                </div>
              </header>

              <section className="admin-diagnosis-section admin-cases-cabin__detail-card admin-cases-cabin__identity-card">
                <div className="admin-cases-cabin__detail-card-header">
                  <h3>Identificação operacional</h3>
                  <span>{selectedCaseReference}</span>
                </div>
                <div className="admin-cases-cabin__identity-grid">
                  <article className="admin-domain-card admin-cases-cabin__summary-item">
                    <strong>Número do caso</strong>
                    <span>{selectedCaseReference}</span>
                  </article>
                  <article className="admin-domain-card admin-cases-cabin__summary-item">
                    <strong>Cliente</strong>
                    <span>{selectedCaseClientName}</span>
                  </article>
                  <article className="admin-domain-card admin-cases-cabin__summary-item">
                    <strong>Contato principal</strong>
                    <span>{selectedCasePrimaryContact}</span>
                  </article>
                </div>
              </section>

              <div className="admin-cases-cabin__badge-row" aria-label="Metadados principais do caso">
                <span className="admin-cases-cabin__meta-badge">Cliente · {resolveQueueClientLabel(selectedCase)}</span>
                <span className="admin-cases-cabin__meta-badge">Área · {selectedCase.practiceArea?.trim() || 'Geral'}</span>
                <span className="admin-cases-cabin__meta-badge">Responsável · {resolveProfessionalLabelById(selectedCase.assignedProfessionalId ?? selectedCase.assignedLawyerId)}</span>
                <span className="admin-cases-cabin__meta-badge">Abertura · {formatDateTime(selectedCase.createdAt)}</span>
                <span className="admin-cases-cabin__meta-badge">SLA · {selectedPriority ? formatSlaRemainingLabel(selectedPriority.metrics.slaRemainingMinutes) : 'Não calculado'}</span>
              </div>

              <section className="admin-diagnosis-section admin-cases-cabin__detail-card">
                <div className="admin-cases-cabin__detail-card-header">
                  <h3>Resumo do problema</h3>
                  <span>{formatResponseStateLabel(selectedCase.responseState)}</span>
                </div>
                <p className="admin-diagnosis-copy">{selectedCaseSummary}</p>
                {selectedPriority ? (
                  <div className="admin-cases-cabin__priority-panel">
                    <div className="admin-cases-cabin__priority-metrics">
                      <span>Tempo sem resposta: {formatDurationMinutes(selectedPriority.metrics.timeWithoutResponseMinutes)}</span>
                      <span>{formatSlaRemainingLabel(selectedPriority.metrics.slaRemainingMinutes)}</span>
                    </div>
                    <div className="admin-cases-cabin__sla-bar" aria-hidden="true">
                      <span style={{ width: `${Math.round((selectedSlaProgress ?? 0) * 100)}%` }} />
                    </div>
                    {(selectedPriority.reasons ?? []).length > 0 ? (
                      <ul className="admin-diagnosis-list admin-cases-cabin__priority-reasons">
                        {selectedPriority.reasons.slice(0, 3).map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="admin-diagnosis-section admin-cases-cabin__detail-card">
                <div className="admin-cases-cabin__detail-card-header">
                  <h3>Timeline operacional</h3>
                  <span>{selectedCase.timeline.length} evento(s)</span>
                </div>
                {selectedCase.timeline.length > 0 ? (
                  <ol className="admin-cases-cabin__timeline">
                    {selectedCase.timeline.map((entry) => (
                      <li key={entry.id} className="admin-cases-cabin__timeline-item">
                        <span className="admin-cases-cabin__timeline-dot" aria-hidden="true" />
                        <div className="admin-cases-cabin__timeline-body">
                          <strong>{entry.summary}</strong>
                          <span>{formatDateTime(entry.createdAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="admin-diagnosis-copy">Ainda não há eventos registrados na timeline operacional.</p>
                )}
              </section>

              <section className="admin-diagnosis-section admin-cases-cabin__detail-card">
                <div className="admin-cases-cabin__detail-card-header">
                  <h3>Mensagem inicial</h3>
                  <span>{selectedCase.contact?.trim() || selectedCase.city?.trim() || 'Sem contato visível'}</span>
                </div>
                <p className="admin-diagnosis-copy">{selectedCaseInitialMessage}</p>
              </section>

              <section className="admin-diagnosis-section admin-cases-cabin__detail-card">
                <div className="admin-cases-cabin__detail-card-header">
                  <h3>Mensagens</h3>
                  <span>{messages.length} interação(ões)</span>
                </div>
                <ConversationThread messages={messages} />
              </section>

              <section className="admin-diagnosis-section admin-cases-cabin__detail-card">
                <div className="admin-cases-cabin__detail-card-header">
                  <h3>Arquivos</h3>
                  <span>Sem integração de upload nesta cabine</span>
                </div>
                <p className="admin-diagnosis-copy">Nenhum arquivo disponível para leitura nesta visualização operacional.</p>
              </section>

              <section className="admin-diagnosis-section admin-cases-cabin__detail-card">
                <div className="admin-cases-cabin__detail-card-header">
                  <h3>Histórico</h3>
                  <span>Leitura rápida do caso</span>
                </div>
                <div className="admin-cases-cabin__history-grid">
                  <article className="admin-domain-card admin-cases-cabin__summary-item">
                    <strong>Status</strong>
                    <span>{formatCaseStatus(selectedCase.status)}</span>
                  </article>
                  <article className="admin-domain-card admin-cases-cabin__summary-item">
                    <strong>Prioridade</strong>
                    <span>{selectedPriority ? formatPriorityBadgeLabel(selectedPriority.level) : 'Não calculada'}</span>
                  </article>
                  <article className="admin-domain-card admin-cases-cabin__summary-item">
                    <strong>Responsável</strong>
                    <span>{resolveProfessionalLabelById(selectedCase.assignedProfessionalId ?? selectedCase.assignedLawyerId)}</span>
                  </article>
                  <article className="admin-domain-card admin-cases-cabin__summary-item">
                    <strong>Abertura</strong>
                    <span>{formatDateTime(selectedCase.createdAt)}</span>
                  </article>
                  <article className="admin-domain-card admin-cases-cabin__summary-item">
                    <strong>Última atualização</strong>
                    <span>{formatDateTime(selectedCase.updatedAt)}</span>
                  </article>
                  <article className="admin-domain-card admin-cases-cabin__summary-item">
                    <strong>Cobrança</strong>
                    <span>
                      {selectedCase.monetization
                        ? `${formatCaseMonetizationAmount(selectedCase.monetization.amountCents, selectedCase.monetization.currency)} (${selectedCase.monetization.status})`
                        : `Taxa fixa prevista: ${formatCaseMonetizationAmount()}`}
                    </span>
                  </article>
                </div>
              </section>
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard tone="admin" className="admin-card admin-workbench-column admin-cases-cabin__actions">
          <div className="admin-card-header">
            <h2>Ações</h2>
            <span>Uma operação por vez</span>
          </div>

          {!selectedCase ? (
            <FeedbackBanner>Selecione um caso na fila para habilitar a cabine operacional.</FeedbackBanner>
          ) : (
            <div className="admin-cases-cabin__accordion">
              <section className="admin-cases-cabin__accordion-item">
                <button
                  type="button"
                  className={`admin-cases-cabin__accordion-trigger ${activeWorkbenchPanel === 'attendance' ? 'is-open' : ''}`}
                  onClick={() => setActiveWorkbenchPanel('attendance')}
                  aria-expanded={activeWorkbenchPanel === 'attendance'}
                >
                  <span>{activeWorkbenchPanel === 'attendance' ? '▼' : '▶'} Atendimento</span>
                  <small>{resolveProfessionalLabelById(selectedCase.assignedProfessionalId ?? selectedCase.assignedLawyerId)}</small>
                </button>
                {activeWorkbenchPanel === 'attendance' ? (
                  <div className="admin-cases-cabin__accordion-content">
                    <form
                      className="admin-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void handleAssignCase(selectedCase.id, true, selectedProfessionalIdByCaseId[selectedCase.id])
                      }}
                    >
                      <label className="admin-field">
                        <span>Profissional</span>
                        <select
                          value={selectedProfessionalIdByCaseId[selectedCase.id] ?? ''}
                          onChange={(event) => setSelectedProfessionalIdByCaseId((current) => ({
                            ...current,
                            [selectedCase.id]: event.target.value,
                          }))}
                          disabled={isMutating || selectedCase.status === 'closed'}
                        >
                          <option value="">Selecione um profissional ativo</option>
                          {activeOfficeProfessionals.map((professional) => (
                            <option key={professional.id} value={professional.id}>
                              {professional.displayName}{professional.oabCredential ? ` · ${professional.oabCredential}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedCase.isAssigned ? (
                        <p className="admin-diagnosis-copy">Este caso já possui responsável atribuído. As ações de atendimento continuam disponíveis abaixo.</p>
                      ) : null}
                      <div className="admin-actions admin-cases-cabin__action-row">
                        <button
                          type="submit"
                          className="admin-button"
                          disabled={isMutating || selectedCase.status === 'closed' || !selectedProfessionalIdByCaseId[selectedCase.id]}
                        >
                          {isAssigning ? 'Atribuindo...' : 'Atribuir'}
                        </button>
                        <button
                          type="button"
                          className="admin-button admin-button--ghost"
                          onClick={() => void handleAssignCase(selectedCase.id)}
                          disabled={isMutating || selectedCase.status === 'closed'}
                        >
                          {isAssigning ? 'Assumindo...' : 'Assumir comigo'}
                        </button>
                      </div>
                    </form>

                    <ProfessionalReputationCard
                      lawyerId={selectedCase.assignedProfessionalId ?? selectedCase.assignedLawyerId}
                      reputation={reputation}
                      isLoading={isReputationLoading}
                      error={reputationError}
                      emptyMessage="A reputação aparece após a atribuição do advogado."
                      className="admin-cases-cabin__reputation-card"
                    />
                  </div>
                ) : null}
              </section>

              <section className="admin-cases-cabin__accordion-item">
                <button
                  type="button"
                  className={`admin-cases-cabin__accordion-trigger ${activeWorkbenchPanel === 'response' ? 'is-open' : ''}`}
                  onClick={() => setActiveWorkbenchPanel('response')}
                  aria-expanded={activeWorkbenchPanel === 'response'}
                >
                  <span>{activeWorkbenchPanel === 'response' ? '▼' : '▶'} Resposta</span>
                  <small>{responseRequiresAssignment ? 'requer responsável' : 'pronta para envio'}</small>
                </button>
                {activeWorkbenchPanel === 'response' ? (
                  <div className="admin-cases-cabin__accordion-content">
                    <form className="admin-form" onSubmit={(event) => void handleRespond(event)}>
                      <label className="admin-field">
                        <span>Resposta</span>
                        <textarea
                          value={responseText}
                          onChange={(event) => setResponseText(event.target.value)}
                          rows={5}
                          placeholder="Escreva a resposta do advogado..."
                          disabled={responseRequiresAssignment || isMutating || selectedCase.status === 'closed'}
                        />
                      </label>
                      {responseRequiresAssignment ? (
                        <p className="admin-diagnosis-copy">Assuma ou atribua este caso para liberar resposta.</p>
                      ) : null}
                      <div className="admin-actions">
                        <button type="submit" className="admin-button" disabled={responseRequiresAssignment || isMutating || selectedCase.status === 'closed'}>
                          {isResponding ? 'Enviando...' : 'Responder'}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </section>

              <section className="admin-cases-cabin__accordion-item">
                <button
                  type="button"
                  className={`admin-cases-cabin__accordion-trigger ${activeWorkbenchPanel === 'status' ? 'is-open' : ''}`}
                  onClick={() => setActiveWorkbenchPanel('status')}
                  aria-expanded={activeWorkbenchPanel === 'status'}
                >
                  <span>{activeWorkbenchPanel === 'status' ? '▼' : '▶'} Status</span>
                  <small>{formatCaseStatus(selectedCase.status)}</small>
                </button>
                {activeWorkbenchPanel === 'status' ? (
                  <div className="admin-cases-cabin__accordion-content">
                    <form className="admin-form" onSubmit={(event) => void handleStatusUpdate(event)}>
                      <label className="admin-field">
                        <span>Status</span>
                        <select value={statusAction} onChange={(event) => setStatusAction(event.target.value as StatusAction)}>
                          <option value="pendente-cliente">Aceito</option>
                          <option value="em-atendimento">Em atendimento</option>
                          <option value="finalizado">Finalizado</option>
                        </select>
                      </label>
                      <div className="admin-actions">
                        <button
                          type="submit"
                          className="admin-button"
                          disabled={shouldDisableStatusUpdateAction(selectedCase, isStatusUpdating, isAssigning) || isResponding || isForwarding || isEscalating}
                        >
                          {isStatusUpdating ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </section>

              <section className="admin-cases-cabin__accordion-item">
                <button
                  type="button"
                  className={`admin-cases-cabin__accordion-trigger ${activeWorkbenchPanel === 'forward' ? 'is-open' : ''}`}
                  onClick={() => setActiveWorkbenchPanel('forward')}
                  aria-expanded={activeWorkbenchPanel === 'forward'}
                >
                  <span>{activeWorkbenchPanel === 'forward' ? '▼' : '▶'} Encaminhamento</span>
                  <small>{forwardDestination.trim() ? 'destino preenchido' : 'sem destino'}</small>
                </button>
                {activeWorkbenchPanel === 'forward' ? (
                  <div className="admin-cases-cabin__accordion-content">
                    <form className="admin-form" onSubmit={(event) => void handleForwardCase(event)}>
                      <label className="admin-field">
                        <span>Destino</span>
                        <input
                          value={forwardDestination}
                          onChange={(event) => setForwardDestination(event.target.value)}
                          placeholder="Ex.: Núcleo Trabalhista"
                        />
                      </label>
                      <label className="admin-field">
                        <span>Observação</span>
                        <textarea
                          rows={4}
                          value={forwardNote}
                          onChange={(event) => setForwardNote(event.target.value)}
                          placeholder="Contexto para quem vai receber o caso"
                        />
                      </label>
                      <div className="admin-actions">
                        <button type="submit" className="admin-button" disabled={isMutating || selectedCase.status === 'closed' || !forwardDestination.trim()}>
                          {isForwarding ? 'Encaminhando...' : 'Encaminhar'}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </section>

              <section className="admin-cases-cabin__accordion-item">
                <button
                  type="button"
                  className={`admin-cases-cabin__accordion-trigger ${activeWorkbenchPanel === 'escalation' ? 'is-open' : ''}`}
                  onClick={() => setActiveWorkbenchPanel('escalation')}
                  aria-expanded={activeWorkbenchPanel === 'escalation'}
                >
                  <span>{activeWorkbenchPanel === 'escalation' ? '▼' : '▶'} Escalonamento</span>
                  <small>{escalationSeverity}</small>
                </button>
                {activeWorkbenchPanel === 'escalation' ? (
                  <div className="admin-cases-cabin__accordion-content">
                    <form className="admin-form" onSubmit={(event) => void handleEscalateCase(event)}>
                      <label className="admin-field">
                        <span>Severidade</span>
                        <select value={escalationSeverity} onChange={(event) => setEscalationSeverity(event.target.value as 'alta' | 'moderada' | 'baixa')}>
                          <option value="alta">Severidade alta</option>
                          <option value="moderada">Severidade moderada</option>
                          <option value="baixa">Severidade baixa</option>
                        </select>
                      </label>
                      <label className="admin-field">
                        <span>Motivo</span>
                        <textarea
                          rows={4}
                          value={escalationReason}
                          onChange={(event) => setEscalationReason(event.target.value)}
                          placeholder="Descreva o motivo para a rotina operacional"
                        />
                      </label>
                      <div className="admin-actions">
                        <button type="submit" className="admin-button" disabled={isMutating || selectedCase.status === 'closed' || !escalationReason.trim()}>
                          {isEscalating ? 'Escalonando...' : 'Escalonar'}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </SurfaceCard>
      </section>
    </AdminOfficeLayout>
  )
}
