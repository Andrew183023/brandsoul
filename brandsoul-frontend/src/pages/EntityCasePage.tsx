import { useEffect, useRef, useState } from 'react'
import React, { type FormEvent } from 'react'

void React

import type { AdminLegalCase, AdminLegalCaseMessage } from '../backend-bridge/api/adminApi'
import { ConversationThread, type ConversationThreadMessage } from '../app/components/ConversationThread'
import { TimelineList } from '../app/components/TimelineList'
import CaseShell from '../app/shells/CaseShell'
import {
  closePublicCase,
  getEntityBusinessConfig,
  getEntityPublicPresence,
  getPublicCase,
  getPublicCaseMessages,
  sendPublicCaseMessage,
} from '../backend-bridge/api/publicEntityApi'
import FeedbackBanner from '../components/FeedbackBanner'
import StatusChip from '../components/StatusChip'
import SurfaceCard from '../components/SurfaceCard'
import { useAuthSession } from '../lib/session'
import {
  formatCustomerCaseStatus,
  formatDateTime,
  resolveCaseStatusClassName,
  resolveCaseStatusTone,
} from './adminCaseUi'
import '../styles/entityPublicPage.css'

type EntityCasePageProps = {
  entityId: string
  caseId: string
}

function resolveLoadErrorMessage(message: string) {
  if (message.includes('not found')) {
    return 'Nao encontrei esse caso.'
  }

  if (message.includes('do not have access')) {
    return 'Acesso negado. Apenas participantes autorizados podem acompanhar este caso.'
  }

  return message
}

export default function EntityCasePage({ entityId, caseId }: EntityCasePageProps) {
  const authSession = useAuthSession()
  const [entityName, setEntityName] = useState('BrandSoul')
  const [legalCase, setLegalCase] = useState<AdminLegalCase | null>(null)
  const [messages, setMessages] = useState<AdminLegalCaseMessage[]>([])
  const [responseText, setResponseText] = useState('')
  const [closeRating, setCloseRating] = useState(5)
  const [closeFeedback, setCloseFeedback] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const threadMessages: ConversationThreadMessage[] = isSending
    ? [
        ...messages,
        {
          id: 'pending-message',
          role: 'user',
          text: 'Sua mensagem esta sendo enviada...',
          createdAt: new Date().toISOString(),
          pending: true,
        },
      ]
    : messages

  async function loadCase() {
    try {
      setIsLoading(true)
      setError(null)

      const [presence, businessConfig, loadedCase, loadedMessages] = await Promise.all([
        getEntityPublicPresence(entityId),
        getEntityBusinessConfig(entityId),
        getPublicCase(caseId),
        getPublicCaseMessages(caseId),
      ])

      setEntityName(
        presence?.entity.name
        ?? businessConfig?.description
        ?? 'BrandSoul',
      )
      setLegalCase(loadedCase)
      setMessages(loadedMessages)
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Erro ao carregar o caso.'
      setError(resolveLoadErrorMessage(message))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadCase()
  }, [entityId, caseId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages, isSending])

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!responseText.trim()) {
      return
    }

    try {
      setIsSending(true)
      setActionFeedback(null)
      setError(null)

      const nextMessages = await sendPublicCaseMessage(caseId, responseText.trim())
      setMessages(nextMessages)
      setResponseText('')
      setActionFeedback('Mensagem enviada com sucesso.')
      const nextCase = await getPublicCase(caseId)
      setLegalCase(nextCase)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao enviar mensagem.')
    } finally {
      setIsSending(false)
    }
  }

  async function handleCloseCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!authSession?.token) {
      setError('Voce precisa entrar para finalizar este caso.')
      return
    }

    try {
      setIsClosing(true)
      setActionFeedback(null)
      setError(null)

      const closedBy = authSession.user.name?.trim() || authSession.user.email?.trim() || 'cliente'
      const closedCase = await closePublicCase(caseId, {
        rating: closeRating,
        feedback: closeFeedback.trim() || undefined,
        closedBy,
      })

      setLegalCase(closedCase)
      setActionFeedback('Caso finalizado com sua avaliacao registrada.')
      const nextMessages = await getPublicCaseMessages(caseId)
      setMessages(nextMessages)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao finalizar caso.')
    } finally {
      setIsClosing(false)
    }
  }

  if (!authSession?.token) {
    return (
      <CaseShell
        statusLabel="Acesso protegido"
        title="Entre para acompanhar seu caso"
        subtitle="O acompanhamento do caso exige autenticacao dentro da plataforma."
        headerActions={(
          <a href={`/entity/${entityId}`} className="entity-public-button entity-public-button--ghost">Voltar para a entidade</a>
        )}
        thread={(
          <section className="entity-case-empty">
            <span className="entity-public-kicker">acompanhar caso</span>
            <p className="entity-public-copy">
              Para proteger a conversa dentro da plataforma, o acompanhamento do caso exige autenticacao.
            </p>
            <div className="entity-public-actions">
              <a href="/login" className="entity-public-button">Entrar</a>
            </div>
          </section>
        )}
      />
    )
  }

  if (isLoading && !legalCase) {
    return (
      <CaseShell
        statusLabel="Carregando"
        title={entityName}
        subtitle="Buscando o historico e o estado atual do caso."
        thread={<p className="entity-public-copy">Carregando caso...</p>}
      />
    )
  }

  if (error && !legalCase) {
    return (
      <CaseShell
        statusLabel="Indisponivel"
        title={entityName}
        subtitle="Nao foi possivel carregar este caso."
        headerActions={(
          <a href={`/entity/${entityId}`} className="entity-public-button entity-public-button--ghost">Voltar para a entidade</a>
        )}
        thread={(
          <section>
            <FeedbackBanner tone="error">{error}</FeedbackBanner>
          </section>
        )}
      />
    )
  }

  if (!legalCase) {
    return (
      <CaseShell
        statusLabel="Indisponivel"
        title={entityName}
        subtitle="Nenhum caso foi carregado."
        thread={<FeedbackBanner tone="error">Nao encontrei esse caso.</FeedbackBanner>}
      />
    )
  }

  return (
    <CaseShell
      statusLabel={formatCustomerCaseStatus(legalCase.status)}
      statusClassName={resolveCaseStatusClassName(legalCase.status)}
      title={entityName}
      subtitle={`Caso ${legalCase.id}. Acompanhe o atendimento e responda sem sair da plataforma.`}
      headerActions={(
        <a href={`/entity/${entityId}`} className="entity-public-button entity-public-button--ghost">Voltar para a entidade</a>
      )}
      feedback={(
        <>
          {error ? <FeedbackBanner tone="error">{error}</FeedbackBanner> : null}
          {actionFeedback ? <FeedbackBanner className="entity-case-feedback">{actionFeedback}</FeedbackBanner> : null}
        </>
      )}
      thread={(
        <>
          <div className="admin-card-header">
            <h2>Historico</h2>
            <span>{messages.length} mensagem{messages.length === 1 ? '' : 'ens'}</span>
          </div>
          <div className="entity-case-thread">
            {threadMessages.length === 0 ? (
              <div className="entity-case-empty">
                <strong>Ainda nao ha resposta no caso.</strong>
                <p>
                  Assim que o advogado assumir ou houver uma nova atualizacao, a conversa vai aparecer aqui.
                </p>
              </div>
            ) : (
              <>
                <ConversationThread messages={threadMessages} />
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </>
      )}
      composer={(
        <>
          <p className="entity-public-copy">
            {legalCase.status === 'open'
              ? 'Seu caso foi aberto e esta aguardando um advogado. Voce pode complementar informacoes aqui.'
              : legalCase.status === 'assigned'
                ? 'O caso esta em atendimento. Responda por aqui para manter toda a conversa dentro da plataforma.'
                : 'Esse caso foi finalizado. Se precisar complementar algo, abra um novo atendimento.'}
          </p>

          <form className="admin-form" onSubmit={(event) => void handleSendMessage(event)}>
            <label className="admin-field">
              <span>Sua mensagem</span>
              <textarea
                value={responseText}
                onChange={(event) => setResponseText(event.target.value)}
                rows={4}
                placeholder="Escreva sua atualizacao ou resposta..."
              />
            </label>
            <div className="entity-public-actions">
              <button type="submit" className="entity-public-button" disabled={isSending || legalCase.status === 'closed'}>
                {isSending ? 'Enviando...' : 'Enviar mensagem'}
              </button>
              {isSending ? <span className="entity-case-sending-hint">Enviando sua mensagem para o caso...</span> : null}
            </div>
          </form>

          {legalCase.status !== 'closed' ? (
            <form className="admin-form" onSubmit={(event) => void handleCloseCase(event)}>
              <div className="admin-card-header">
                <h3>Finalizar caso</h3>
                <span>Encerramento com avaliacao simples</span>
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
                    placeholder="Como foi sua experiencia com este atendimento?"
                  />
                </label>
              </div>
              <div className="entity-public-actions">
                <button type="submit" className="entity-public-button" disabled={isClosing}>
                  {isClosing ? 'Finalizando...' : 'Finalizar caso'}
                </button>
              </div>
            </form>
          ) : null}
        </>
      )}
      details={(
        <>
          <SurfaceCard tone="public" className="entity-public-card">
            <h2>Resumo do caso</h2>
            <div className="admin-domain-grid">
              <article className="admin-domain-card">
                <strong>Status</strong>
                <StatusChip tone={resolveCaseStatusTone(legalCase.status)}>{formatCustomerCaseStatus(legalCase.status)}</StatusChip>
              </article>
              <article className="admin-domain-card">
                <strong>Advogado</strong>
                <span>{legalCase.assignedLawyerId ?? 'Aguardando atribuicao'}</span>
              </article>
              <article className="admin-domain-card">
                <strong>Descricao</strong>
                <span>{legalCase.description}</span>
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
            </div>
          </SurfaceCard>

          {legalCase.timeline.length > 0 ? (
            <section className="entity-public-card">
              <h2>Timeline</h2>
              <TimelineList entries={legalCase.timeline} />
            </section>
          ) : null}

          {legalCase.outcome ? (
            <section className="entity-public-card">
              <h2>Avaliacao registrada</h2>
              <div className="admin-domain-grid">
                <article className="admin-domain-card">
                  <strong>Nota</strong>
                  <span>{legalCase.outcome.rating}/5</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Encerrado por</strong>
                  <span>{legalCase.outcome.closedBy}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Encerrado em</strong>
                  <span>{formatDateTime(legalCase.outcome.closedAt)}</span>
                </article>
                <article className="admin-domain-card">
                  <strong>Feedback</strong>
                  <span>{legalCase.outcome.feedback ?? 'Sem feedback adicional.'}</span>
                </article>
              </div>
            </section>
          ) : null}
        </>
      )}
    />
  )
}
