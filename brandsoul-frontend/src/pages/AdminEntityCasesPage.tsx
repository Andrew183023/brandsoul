import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import {
  assignCase,
  getCase,
  getCaseMessages,
  getLawyerReputation,
  listEntityCases,
  respondToCase,
  type AdminLegalCase,
  type AdminLegalCaseMessage,
  type AdminLawyerReputation,
} from '../backend-bridge/api/adminApi'
import { ConversationThread } from '../app/components/ConversationThread'
import ProfessionalReputationCard from '../app/components/ProfessionalReputationCard'
import AdminEntityLayout from '../components/AdminEntityLayout'
import FeedbackBanner from '../components/FeedbackBanner'
import StatusChip from '../components/StatusChip'
import SurfaceCard from '../components/SurfaceCard'
import { useAuthSession } from '../lib/session'
import {
  formatCaseStatus,
  formatCaseMonetizationAmount,
  formatDateTime,
  resolveCaseStatusTone,
} from './adminCaseUi'

type AdminEntityCasesPageProps = {
  entityId: string
}

export default function AdminEntityCasesPage({ entityId }: AdminEntityCasesPageProps) {
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
  const [isReputationLoading, setIsReputationLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [reputation, setReputation] = useState<AdminLawyerReputation | null>(null)
  const [reputationError, setReputationError] = useState<string | null>(null)

  async function loadCases(preferredCaseId?: string | null) {
    setIsLoading(true)
    setError(null)

    try {
      const payload = await listEntityCases(entityId)
      setCases(payload.cases)

      const nextSelectedId = preferredCaseId
        ?? selectedCaseId
        ?? payload.cases[0]?.id
        ?? null

      setSelectedCaseId(nextSelectedId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao carregar casos.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadCases(null)
  }, [entityId])

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
    const stableAssignedLawyerId = selectedCase?.assignedLawyerId ?? ''

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

        const payload = await getLawyerReputation(String(entityId), String(stableAssignedLawyerId))
        if (!cancelled) {
          setReputation(payload.reputation)
        }
      } catch (nextError) {
        if (!cancelled) {
          setReputationError(nextError instanceof Error ? nextError.message : 'Erro ao carregar reputacao do advogado.')
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
  }, [entityId, selectedCase?.assignedLawyerId, selectedCase?.updatedAt])

  async function handleAssignCase(caseId: string) {
    if (!authSession?.user?.id) {
      setError('Sessao invalida para assumir o caso.')
      return
    }

    const confirmed = window.confirm(`Assumir este caso registra uma cobranca mock fixa de ${formatCaseMonetizationAmount()}. Deseja continuar?`)
    if (!confirmed) {
      return
    }

    try {
      setIsAssigning(true)
      setActionFeedback(null)
      const payload = await assignCase(caseId, String(authSession.user.id))
      setActionFeedback(`Caso assumido com sucesso. Monetizacao mock registrada em ${formatCaseMonetizationAmount(payload.case.monetization?.amountCents, payload.case.monetization?.currency)}.`)
      setSelectedCase(payload.case)
      setSelectedCaseId(payload.case.id)
      await loadCases(payload.case.id)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao assumir caso.')
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
      const payload = await respondToCase(selectedCaseId, responseText.trim())
      setMessages(payload.messages)
      setResponseText('')
      setActionFeedback('Resposta enviada dentro do case.')
      const refreshed = await getCase(selectedCaseId)
      setSelectedCase(refreshed.case)
      await loadCases(selectedCaseId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao responder caso.')
    } finally {
      setIsResponding(false)
    }
  }

  return (
    <AdminEntityLayout
      entityId={entityId}
      section="cases"
      title="Cases"
      subtitle="Painel operacional do fluxo de casos da entidade dentro da plataforma."
    >
      {error ? <FeedbackBanner tone="error">{error}</FeedbackBanner> : null}
      {actionFeedback ? <FeedbackBanner tone="success">{actionFeedback}</FeedbackBanner> : null}

      <div className="admin-cases-layout">
        <SurfaceCard tone="admin" className="admin-card">
          <div className="admin-card-header">
            <h2>Casos</h2>
            <span>{isLoading ? 'Carregando...' : `${cases.length} caso${cases.length === 1 ? '' : 's'}`}</span>
          </div>

          {isLoading ? (
            <FeedbackBanner>Carregando casos...</FeedbackBanner>
          ) : cases.length === 0 ? (
            <FeedbackBanner>Nenhum caso encontrado para esta entidade.</FeedbackBanner>
          ) : (
            <ul className="admin-entity-list">
              {cases.map((item) => (
                <li key={item.id} className="admin-entity-item">
                  <div className="admin-entity-main">
                    <strong>{item.description}</strong>
                    <span>{item.id}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                    <span>{item.assignedLawyerId ? `Advogado: ${item.assignedLawyerId}` : 'Sem advogado atribuido'}</span>
                    {item.monetization ? (
                      <span>
                        Monetizacao: {formatCaseMonetizationAmount(item.monetization.amountCents, item.monetization.currency)} ({item.monetization.status})
                      </span>
                    ) : null}
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="admin-button admin-button--ghost"
                        onClick={() => setSelectedCaseId(item.id)}
                      >
                        Abrir caso
                      </button>
                      <a href={`/admin/cases/${item.id}`} className="admin-inline-link">
                        Tela dedicada
                      </a>
                      {item.status === 'open' ? (
                        <button
                          type="button"
                          className="admin-button"
                          onClick={() => void handleAssignCase(item.id)}
                          disabled={isAssigning}
                        >
                          {isAssigning && selectedCaseId === item.id ? 'Assumindo...' : `Assumir caso (${formatCaseMonetizationAmount()})`}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="admin-entity-meta">
                    <StatusChip tone={resolveCaseStatusTone(item.status)}>{formatCaseStatus(item.status)}</StatusChip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard tone="admin" className="admin-card">
          <div className="admin-card-header">
            <h2>Case aberto</h2>
            <span>{selectedCase ? selectedCase.id : 'nenhum case selecionado'}</span>
          </div>

          {isCaseLoading ? (
            <FeedbackBanner>Carregando case...</FeedbackBanner>
          ) : !selectedCase ? (
            <FeedbackBanner>Selecione um caso para operar.</FeedbackBanner>
          ) : (
            <>
              <div className="admin-domain-grid">
                <article className="admin-domain-card">
                  <strong>Status</strong>
                  <StatusChip tone={resolveCaseStatusTone(selectedCase.status)}>{formatCaseStatus(selectedCase.status)}</StatusChip>
                </article>
                <article className="admin-domain-card">
                  <strong>Advogado</strong>
                  <span>{selectedCase.assignedLawyerId ?? 'Nao atribuido'}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Criado em</strong>
                  <span>{formatDateTime(selectedCase.createdAt)}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Resumo</strong>
                  <span>{selectedCase.description}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Monetizacao</strong>
                  <span>
                    {selectedCase.monetization
                      ? `${formatCaseMonetizationAmount(selectedCase.monetization.amountCents, selectedCase.monetization.currency)} (${selectedCase.monetization.status})`
                      : `Taxa fixa prevista: ${formatCaseMonetizationAmount()}`}
                  </span>
                </article>
              </div>

              <ProfessionalReputationCard
                lawyerId={selectedCase.assignedLawyerId}
                reputation={reputation}
                isLoading={isReputationLoading}
                error={reputationError}
                emptyMessage="A reputacao aparece apos atribuicao do advogado."
              />

              <section className="admin-diagnosis-section">
                <h3>Historico de mensagens</h3>
                <ConversationThread messages={messages} />
              </section>

              <form className="admin-form" onSubmit={(event) => void handleRespond(event)}>
                <label className="admin-field">
                  <span>Responder dentro do case</span>
                  <textarea
                    value={responseText}
                    onChange={(event) => setResponseText(event.target.value)}
                    rows={4}
                    placeholder="Escreva a resposta do advogado..."
                  />
                </label>
                <div className="admin-actions">
                  <button type="submit" className="admin-button" disabled={isResponding || selectedCase.status === 'closed'}>
                    {isResponding ? 'Enviando...' : 'Enviar resposta'}
                  </button>
                  {selectedCase.status === 'open' ? (
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
            </>
          )}
        </SurfaceCard>
      </div>
    </AdminEntityLayout>
  )
}
