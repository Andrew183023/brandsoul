import { useEffect, useMemo, useState } from 'react'

import {
  listAdminEntities,
  type AdminEntityListItem,
} from '../backend-bridge/api/adminApi'
import FeedbackBanner from '../components/FeedbackBanner'
import StatusChip, { type StatusChipTone } from '../components/StatusChip'
import SurfaceCard from '../components/SurfaceCard'
import { logout } from '../lib/auth'

function resolveEntityName(entity: Record<string, unknown>) {
  const finalForm = typeof entity.finalForm === 'object' && entity.finalForm !== null
    ? entity.finalForm as Record<string, unknown>
    : null
  const identity = finalForm && typeof finalForm.identity === 'object' && finalForm.identity !== null
    ? finalForm.identity as Record<string, unknown>
    : null
  const social = typeof entity.social === 'object' && entity.social !== null
    ? entity.social as Record<string, unknown>
    : null

  return (
    (typeof identity?.name === 'string' && identity.name) ||
    (typeof social?.publicName === 'string' && social.publicName) ||
    (typeof entity.id === 'string' && entity.id) ||
    'Sem nome'
  )
}

function formatTimestamp(value?: string) {
  if (!value) {
    return 'agora'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function resolveEntityStatusTone(status: string): StatusChipTone {
  const normalizedStatus = status.trim().toLowerCase()

  if (normalizedStatus === 'ready' || normalizedStatus === 'active') {
    return 'success'
  }

  if (normalizedStatus === 'draft' || normalizedStatus === 'pending') {
    return 'warning'
  }

  if (normalizedStatus === 'failed' || normalizedStatus === 'error' || normalizedStatus === 'rejected') {
    return 'danger'
  }

  return 'neutral'
}

function resolveEntityTimestamp(item: AdminEntityListItem) {
  return new Date(item.updatedAt ?? item.createdAt ?? 0).getTime()
}

export default function AdminPage() {
  const [entities, setEntities] = useState<AdminEntityListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadEntities() {
    setIsLoading(true)
    setError(null)

    try {
      const payload = await listAdminEntities()
      setEntities(payload.entities)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Falha ao carregar entidades.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadEntities()
  }, [])

  async function handleLogout() {
    await logout()
    window.location.replace('/login')
  }

  const sortedEntities = useMemo(
    () => [...entities].sort((left, right) => resolveEntityTimestamp(right) - resolveEntityTimestamp(left)),
    [entities],
  )

  const activeEntity = sortedEntities[0] ?? null
  const secondaryEntities = activeEntity ? sortedEntities.slice(1) : []

  return (
    <main className="admin-shell">
      <section className="admin-panel">
        <div className="admin-header">
          <div>
            <p className="admin-kicker">admin</p>
            <h1>Painel da Centelha</h1>
            <p className="admin-subtitle">Configure a identidade, comunicação e operação da sua marca viva.</p>
          </div>
          <div className="admin-actions">
            <button type="button" className="admin-button admin-button--ghost" onClick={() => void loadEntities()} disabled={isLoading}>
              Atualizar
            </button>
            <button type="button" className="admin-button admin-button--ghost" onClick={() => void handleLogout()}>
              Sair
            </button>
          </div>
        </div>

        <div className="admin-grid">
          <SurfaceCard tone="admin">
            <div className="admin-card-header">
              <h2>Nascimento da Centelha</h2>
              <span>Fluxo oficial</span>
            </div>

            {activeEntity ? (
              <>
                <div className="admin-feedback">
                  Este console opera a Centelha principal da sua marca. Para iniciar uma nova presença viva, use o fluxo dedicado de nascimento.
                </div>

                <div className="admin-actions">
                  <a href="/create" className="admin-button admin-button--ghost">
                    Dar vida a uma nova Centelha
                  </a>
                </div>
              </>
            ) : (
              <>
                <div className="admin-feedback">
                  A primeira Centelha representa a presença viva da sua empresa.
                </div>

                <div className="admin-actions">
                  <a href="/create" className="admin-button">
                    Dar vida a sua marca
                  </a>
                </div>
              </>
            )}
          </SurfaceCard>

          <SurfaceCard tone="admin">
            <div className="admin-card-header">
              <h2>Centelha ativa</h2>
              <span>{isLoading ? 'Sincronizando...' : activeEntity ? 'Pronta para operar' : 'Aguardando nascimento'}</span>
            </div>

            {error ? <FeedbackBanner tone="error">{error}</FeedbackBanner> : null}

            {isLoading ? (
              <FeedbackBanner>Carregando a Centelha principal...</FeedbackBanner>
            ) : activeEntity === null ? (
              <div className="admin-centelha-empty">
                <p className="admin-centelha-empty__copy">Nenhuma Centelha foi criada ainda. Comece pelo ritual de nascimento para ativar a presença da sua marca.</p>
                <a href="/create" className="admin-button">
                  Dar vida a sua marca
                </a>
              </div>
            ) : (
              <>
                <article className="admin-centelha-card">
                  <div className="admin-centelha-card__main">
                    <p className="admin-centelha-card__eyebrow">Centelha principal</p>
                    <h3>{resolveEntityName(activeEntity.entity)}</h3>
                    <p className="admin-centelha-card__meta">Atualizada em {formatTimestamp(activeEntity.updatedAt ?? activeEntity.createdAt)}</p>
                  </div>

                  <div className="admin-centelha-card__status">
                    <StatusChip tone={resolveEntityStatusTone(activeEntity.status)}>{activeEntity.status}</StatusChip>
                    <span>{activeEntity.entityId}</span>
                  </div>

                  <div className="admin-actions">
                    <a className="admin-button" href={`/admin/entity/${activeEntity.entityId}/identity`}>
                      Configurar Centelha
                    </a>
                    <a className="admin-button admin-button--ghost" href={`/entity/${activeEntity.entityId}`}>
                      Ver publico
                    </a>
                    <a className="admin-button admin-button--ghost" href={`/admin/entity/${activeEntity.entityId}/cases`}>
                      Acompanhar casos
                    </a>
                  </div>
                </article>

                {secondaryEntities.length > 0 ? (
                  <div className="admin-centelha-secondary">
                    <div className="admin-card-header">
                      <h3>Contexto tecnico</h3>
                      <span>Entidades adicionais detectadas pela API</span>
                    </div>

                    <ul className="admin-entity-list">
                      {secondaryEntities.map((item) => (
                        <li key={item.entityId} className="admin-entity-item">
                          <div className="admin-entity-main">
                            <strong>{resolveEntityName(item.entity)}</strong>
                            <span>{formatTimestamp(item.updatedAt ?? item.createdAt)}</span>
                            <a className="admin-inline-link" href={`/admin/entity/${item.entityId}/identity`}>
                              Abrir configuracao
                            </a>
                          </div>
                          <div className="admin-entity-meta">
                            <StatusChip tone={resolveEntityStatusTone(item.status)}>{item.status}</StatusChip>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </SurfaceCard>
        </div>
      </section>
    </main>
  )
}
