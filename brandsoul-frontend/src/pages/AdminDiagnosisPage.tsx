import { useEffect, useState } from 'react'

import {
  approveDiagnosis,
  getDiagnosis,
  rejectDiagnosis,
  type DiagnosisArtifact,
} from '../backend-bridge/api/adminApi'
import FeedbackBanner from '../components/FeedbackBanner'
import StatusChip from '../components/StatusChip'
import SurfaceCard from '../components/SurfaceCard'

type AdminDiagnosisPageProps = {
  entityId: string
  embedded?: boolean
}

type DiagnosisUiState = 'loading' | 'error' | 'empty' | 'ready'

function formatDiagnosisStatus(status: DiagnosisArtifact['status']) {
  if (status === 'approved') {
    return 'Aprovado'
  }

  if (status === 'rejected') {
    return 'Rejeitado'
  }

  return 'Rascunho'
}

function resolveDiagnosisTone(status: DiagnosisArtifact['status']) {
  if (status === 'approved') {
    return 'success' as const
  }

  if (status === 'rejected') {
    return 'danger' as const
  }

  return 'neutral' as const
}

function formatCreatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export default function AdminDiagnosisPage({ entityId, embedded = false }: AdminDiagnosisPageProps) {
  const [uiState, setUiState] = useState<DiagnosisUiState>('loading')
  const [diagnosis, setDiagnosis] = useState<DiagnosisArtifact | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [isActing, setIsActing] = useState(false)

  useEffect(() => {
    async function loadDiagnosis() {
      try {
        setUiState('loading')
        setError(null)
        setActionFeedback(null)

        const result = await getDiagnosis(entityId)

        if (!result) {
          setDiagnosis(null)
          setUiState('empty')
          return
        }

        setDiagnosis(result)
        setUiState('ready')
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Erro ao carregar diagnostico.')
        setUiState('error')
      }
    }

    void loadDiagnosis()
  }, [entityId])

  async function handleApprove() {
    if (!diagnosis) {
      return
    }

    try {
      setIsActing(true)
      setActionFeedback(null)
      const result = await approveDiagnosis(entityId, diagnosis.id)
      setDiagnosis(result.diagnosis)
      setActionFeedback('Reconfiguracao aprovada com sucesso.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao aprovar diagnostico.')
      setUiState('error')
    } finally {
      setIsActing(false)
    }
  }

  async function handleReject() {
    if (!diagnosis) {
      return
    }

    try {
      setIsActing(true)
      setActionFeedback(null)
      const result = await rejectDiagnosis(entityId, diagnosis.id)
      setDiagnosis(result.diagnosis)
      setActionFeedback('Diagnostico rejeitado.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Erro ao rejeitar diagnostico.')
      setUiState('error')
    } finally {
      setIsActing(false)
    }
  }

  const content = (
    <>
      <div className="admin-header">
        <div>
          <p className="admin-kicker">re-brandingsoul</p>
          <h1>Diagnostico Estrategico</h1>
          <p className="admin-subtitle">Diagnostico, proposta e decisao sobre o rumo da entidade.</p>
        </div>
        {!embedded ? (
          <div className="admin-actions">
            <a href="/admin" className="admin-button admin-button--ghost">Voltar ao admin</a>
          </div>
        ) : null}
      </div>

      {uiState === 'loading' ? <FeedbackBanner>Carregando diagnostico...</FeedbackBanner> : null}

      {uiState === 'error' ? (
        <FeedbackBanner tone="error">
          {error ?? 'Erro ao carregar diagnostico.'}
        </FeedbackBanner>
      ) : null}

      {uiState === 'empty' ? (
        <SurfaceCard className="admin-card admin-empty-state">
          <p className="admin-empty-state__eyebrow">Intelligence</p>
          <div className="admin-card-header">
            <h2>Nenhum diagnostico disponivel</h2>
          </div>
          <p className="admin-empty-state__copy">Ainda nao existe artefato de diagnostico para esta entidade. Quando a base estiver mais bem configurada, esta seção passa a exibir leitura estratégica e steering com o mesmo shell do restante do produto.</p>
          <div className="admin-empty-state__actions">
            <a href={`/admin/entity/${entityId}/identity`} className="admin-button">Abrir identity</a>
          </div>
        </SurfaceCard>
      ) : null}

      {uiState === 'ready' && diagnosis ? (
        <SurfaceCard className="admin-card admin-diagnosis-card">
          <div className="admin-card-header">
            <div>
              <h2>{diagnosis.entityName}</h2>
              <p className="admin-diagnosis-meta">{diagnosis.entityId}</p>
            </div>
            <div className="admin-diagnosis-status">
              <StatusChip tone={resolveDiagnosisTone(diagnosis.status)}>{formatDiagnosisStatus(diagnosis.status)}</StatusChip>
              <span>{formatCreatedAt(diagnosis.createdAt)}</span>
            </div>
          </div>

          {typeof diagnosis.confidence === 'number' ? (
            <FeedbackBanner>
              Confianca do diagnostico: {Math.round(diagnosis.confidence * 100)}%
            </FeedbackBanner>
          ) : null}

          {actionFeedback ? <FeedbackBanner>{actionFeedback}</FeedbackBanner> : null}

          <section className="admin-diagnosis-section">
            <h3>Contexto</h3>
            <ul className="admin-diagnosis-list">
              {diagnosis.context.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="admin-diagnosis-section">
            <h3>Diagnostico</h3>
            <p className="admin-diagnosis-copy">{diagnosis.problem}</p>
          </section>

          <section className="admin-diagnosis-section">
            <h3>Proposta</h3>
            <p className="admin-diagnosis-copy">{diagnosis.proposal}</p>
          </section>

          <section className="admin-diagnosis-section">
            <h3>Impacto</h3>
            <ul className="admin-diagnosis-list">
              {diagnosis.impact.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <div className="admin-actions">
            <button
              type="button"
              className="admin-button"
              onClick={() => void handleApprove()}
              disabled={isActing || diagnosis.status === 'approved'}
            >
              {diagnosis.status === 'approved' ? 'Reconfiguracao aprovada' : 'Aprovar Reconfiguracao'}
            </button>
            <button
              type="button"
              className="admin-button admin-button--ghost"
              onClick={() => void handleReject()}
              disabled={isActing || diagnosis.status === 'rejected'}
            >
              {diagnosis.status === 'rejected' ? 'Diagnostico rejeitado' : 'Rejeitar'}
            </button>
          </div>
        </SurfaceCard>
      ) : null}
    </>
  )

  if (embedded) {
    return content
  }

  return (
    <main className="admin-shell">
      <section className="admin-panel">
        {content}
      </section>
    </main>
  )
}
