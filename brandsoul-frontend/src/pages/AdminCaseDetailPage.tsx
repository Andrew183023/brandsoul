import { useEffect, useState } from 'react'
import React, { type FormEvent } from 'react'

void React

import {
  assignCase,
  closeCase,
  getCase,
  getCaseMessages,
  getLawyerReputation,
  respondToCase,
  type AdminLegalCase,
  type AdminLegalCaseMessage,
  type AdminLawyerReputation,
} from '../backend-bridge/api/adminApi'
import { ConversationThread } from '../app/components/ConversationThread'
import ProfessionalReputationCard from '../app/components/ProfessionalReputationCard'
import { TimelineList } from '../app/components/TimelineList'
import CaseShell from '../app/shells/CaseShell'
import FeedbackBanner from '../components/FeedbackBanner'
import StatusChip from '../components/StatusChip'
import SurfaceCard from '../components/SurfaceCard'
import { useAuthSession } from '../lib/session'
import {
  formatCaseStatus,
  formatCaseMonetizationAmount,
  formatDateTime,
  resolveCaseStatusClassName,
  resolveCaseStatusTone,
} from './adminCaseUi'

type AdminCaseDetailPageProps = {
  caseId: string
}

function resolveLoadErrorMessage(message: string) {
  if (message.includes('not found') || message.includes('not found.')) {
    return 'Esse caso nao foi encontrado.'
  }

  if (message.includes('do not have access')) {
    return 'Acesso negado. Apenas participantes autorizados podem abrir este caso.'
  }

  return message
}

export default function AdminCaseDetailPage({ caseId }: AdminCaseDetailPageProps) {
  const authSession = useAuthSession()
  const [legalCase, setLegalCase] = useState<AdminLegalCase | null>(null)
  const [messages, setMessages] = useState<AdminLegalCaseMessage[]>([])
  const [responseText, setResponseText] = useState('')
  const [closeRating, setCloseRating] = useState(5)
  const [closeFeedback, setCloseFeedback] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAssigning, setIsAssigning] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isReputationLoading, setIsReputationLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [reputation, setReputation] = useState<AdminLawyerReputation | null>(null)
  const [reputationError, setReputationError] = useState<string | null>(null)

  async function loadCaseDetail() {
    try {
      setIsLoading(true)
      setError(null)

      const [casePayload, messagesPayload] = await Promise.all([
        getCase(caseId),
        getCaseMessages(caseId),
      ])

      setLegalCase(casePayload.case)
      setMessages(messagesPayload.messages)
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Erro ao carregar o caso.'
      setError(resolveLoadErrorMessage(message))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadCaseDetail()
  }, [caseId])

  useEffect(() => {
    const stableAssignedLawyerId = legalCase?.assignedLawyerId ?? ''
    const stableReputationEntityId = legalCase?.entityId ?? ''

    if (!stableAssignedLawyerId || !stableReputationEntityId) {
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

        const payload = await getLawyerReputation(String(stableReputationEntityId), String(stableAssignedLawyerId))
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
  }, [legalCase?.assignedLawyerId, legalCase?.entityId, legalCase?.updatedAt])

  async function handleAssignCase() {
    if (!authSession?.user?.id) {
      setError('Sessao invalida para atribuir o caso.')
      return
    }

    const confirmed = window.confirm(`Assumir este caso registra uma cobranca mock fixa de ${formatCaseMonetizationAmount()}. Deseja continuar?`)
    if (!confirmed) {
      return
    }

    try {
      setIsAssigning(true)
      setActionFeedback(null)
      setError(null)

      const payload = await assignCase(caseId, String(authSession.user.id))
      setLegalCase(payload.case)
      setActionFeedback(`Caso assumido com sucesso. Monetizacao mock registrada em ${formatCaseMonetizationAmount(payload.case.monetization?.amountCents, payload.case.monetization?.currency)}.`)
      await loadCaseDetail()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao assumir caso.')
    } finally {
      setIsAssigning(false)
    }
  }

  async function handleRespond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!responseText.trim()) {
      return
    }

    try {
      setIsResponding(true)
      setActionFeedback(null)
      setError(null)

      const payload = await respondToCase(caseId, responseText.trim())
      setMessages(payload.messages)
      setResponseText('')
      setActionFeedback('Resposta enviada dentro do case.')
      await loadCaseDetail()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao responder caso.')
    } finally {
      setIsResponding(false)
    }
  }

  async function handleCloseCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setIsClosing(true)
      setActionFeedback(null)
      setError(null)

      const closedBy = authSession?.user?.name?.trim() || authSession?.user?.email?.trim() || 'participante'
      const payload = await closeCase(caseId, {
        rating: closeRating,
        feedback: closeFeedback.trim() || undefined,
        closedBy,
      })

      setLegalCase(payload.case)
      setActionFeedback('Caso finalizado com avaliacao registrada.')
      await loadCaseDetail()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao finalizar caso.')
    } finally {
      setIsClosing(false)
    }
  }

  if (isLoading && !legalCase) {
    return (
      <CaseShell
        statusLabel="Carregando"
        title="Case"
        subtitle="Buscando o historico operacional deste atendimento."
        thread={<div className="admin-feedback">Carregando case...</div>}
      />
    )
  }

  if (error && !legalCase) {
    return (
      <CaseShell
        statusLabel="Indisponivel"
        title="Case"
        subtitle="Nao foi possivel carregar este atendimento."
        headerActions={(
          <a href="/admin" className="admin-button admin-button--ghost">Voltar ao admin</a>
        )}
        thread={<div className="admin-feedback admin-feedback--error">{error}</div>}
      />
    )
  }

  if (!legalCase) {
    return (
      <CaseShell
        statusLabel="Sem dados"
        title="Case"
        subtitle="Nenhum atendimento foi carregado."
        thread={<div className="admin-feedback">Nenhum case carregado.</div>}
      />
    )
  }

  return (
    <CaseShell
      statusLabel={formatCaseStatus(legalCase.status)}
      statusClassName={resolveCaseStatusClassName(legalCase.status)}
      title={legalCase.description}
      subtitle={`Case ${legalCase.id} operado dentro da plataforma.`}
      headerActions={(
        <>
          <a href={`/admin/entity/${legalCase.entityId}/cases`} className="admin-button admin-button--ghost">
            Voltar para lista de cases
          </a>
          <a href={`/entity/${legalCase.entityId}/cases/${legalCase.id}`} className="admin-button admin-button--ghost">
            Ver visao do cliente
          </a>
        </>
      )}
      feedback={(
        <>
          {error ? <FeedbackBanner tone="error">{error}</FeedbackBanner> : null}
          {actionFeedback ? <FeedbackBanner>{actionFeedback}</FeedbackBanner> : null}
        </>
      )}
      thread={(
        <>
          <div className="admin-card-header">
            <h2>Historico de mensagens</h2>
            <span>{messages.length} mensagem{messages.length === 1 ? '' : 'ens'}</span>
          </div>
          <ConversationThread messages={messages} />
        </>
      )}
      composer={(
        <>
          <form className="admin-form" onSubmit={(event) => void handleRespond(event)}>
            <label className="admin-field">
              <span>Responder como advogado</span>
              <textarea
                value={responseText}
                onChange={(event) => setResponseText(event.target.value)}
                rows={4}
                placeholder="Escreva a resposta do advogado..."
              />
            </label>

            <div className="admin-actions">
              <button type="submit" className="admin-button" disabled={isResponding || legalCase.status === 'closed'}>
                {isResponding ? 'Enviando...' : 'Enviar resposta'}
              </button>

              {legalCase.status === 'open' ? (
                <button
                  type="button"
                  className="admin-button admin-button--ghost"
                  onClick={() => void handleAssignCase()}
                  disabled={isAssigning}
                >
                  {isAssigning ? 'Assumindo...' : `Assumir caso (${formatCaseMonetizationAmount()})`}
                </button>
              ) : null}
            </div>
          </form>

          {legalCase.status !== 'closed' ? (
            <form className="admin-form" onSubmit={(event) => void handleCloseCase(event)}>
              <div className="admin-card-header">
                <h3>Finalizar caso</h3>
                <span>Registre uma avaliacao simples no encerramento</span>
              </div>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>Avaliacao</span>
                  <select value={String(closeRating)} onChange={(event) => setCloseRating(Number(event.target.value))}>
                    <option value="5">5 - excelente</option>
                    <option value="4">4 - muito bom</option>
                    <option value="3">3 - ok</option>
                    <option value="2">2 - abaixo do esperado</option>
                    <option value="1">1 - ruim</option>
                  </select>
                </label>
                <label className="admin-field">
                  <span>Feedback opcional</span>
                  <textarea
                    value={closeFeedback}
                    onChange={(event) => setCloseFeedback(event.target.value)}
                    rows={3}
                    placeholder="Resumo curto do fechamento..."
                  />
                </label>
              </div>
              <div className="admin-actions">
                <button type="submit" className="admin-button" disabled={isClosing}>
                  {isClosing ? 'Finalizando...' : 'Finalizar caso'}
                </button>
              </div>
            </form>
          ) : null}
        </>
      )}
      details={(
        <>
          <SurfaceCard className="admin-card admin-case-detail-card">
            <div className="admin-domain-grid">
              <article className="admin-domain-card">
                <strong>Status</strong>
                <StatusChip tone={resolveCaseStatusTone(legalCase.status)}>{formatCaseStatus(legalCase.status)}</StatusChip>
              </article>
              <article className="admin-domain-card">
                <strong>Advogado atribuido</strong>
                <span>{legalCase.assignedLawyerId ?? 'Nao atribuido'}</span>
              </article>
              <article className="admin-domain-card">
                <strong>Cidade</strong>
                <span>{legalCase.city ?? 'Nao informada'}</span>
              </article>
              <article className="admin-domain-card">
                <strong>Contato</strong>
                <span>{legalCase.contact ?? 'Nao informado'}</span>
              </article>
              <article className="admin-domain-card">
                <strong>Criado em</strong>
                <span>{formatDateTime(legalCase.createdAt)}</span>
              </article>
              <article className="admin-domain-card">
                <strong>Atualizado em</strong>
                <span>{formatDateTime(legalCase.updatedAt)}</span>
              </article>
              <article className="admin-domain-card">
                <strong>Monetizacao</strong>
                <span>
                  {legalCase.monetization
                    ? `${formatCaseMonetizationAmount(legalCase.monetization.amountCents, legalCase.monetization.currency)} (${legalCase.monetization.status})`
                    : `Taxa fixa prevista: ${formatCaseMonetizationAmount()}`}
                </span>
              </article>
            </div>
          </SurfaceCard>

          <ProfessionalReputationCard
            lawyerId={legalCase.assignedLawyerId}
            reputation={reputation}
            isLoading={isReputationLoading}
            error={reputationError}
            emptyMessage="A reputacao aparece apos atribuicao do advogado."
            className="admin-case-detail-card"
          />

          <SurfaceCard className="admin-card admin-case-detail-card">
            <div className="admin-card-header">
              <h3>Timeline</h3>
            </div>
            <TimelineList entries={legalCase.timeline} />
          </SurfaceCard>

          {legalCase.outcome ? (
            <SurfaceCard className="admin-card admin-case-detail-card">
              <div className="admin-card-header">
                <h3>Avaliacao registrada</h3>
              </div>
              <div className="admin-domain-grid">
                <article className="admin-domain-card">
                  <strong>Nota</strong>
                  <span>{legalCase.outcome.rating}/5</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Feedback</strong>
                  <span>{legalCase.outcome.feedback || 'Nao informado'}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Encerrado por</strong>
                  <span>{legalCase.outcome.closedBy || 'Nao informado'}</span>
                </article>
              </div>
            </SurfaceCard>
          ) : null}
        </>
      )}
    />
  )
}
