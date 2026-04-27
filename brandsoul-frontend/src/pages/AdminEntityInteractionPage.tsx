import { useEffect, useState } from 'react'

import { getEntityBusinessConfig, type EntityBusinessConfig } from '../backend-bridge/api/adminApi'
import AdminEntityLayout from '../components/AdminEntityLayout'
import FeedbackBanner from '../components/FeedbackBanner'
import SurfaceCard from '../components/SurfaceCard'

type AdminEntityInteractionPageProps = {
  entityId: string
}

function resolveInteractionSummary(config: EntityBusinessConfig | null) {
  if (!config) {
    return 'Interação ainda depende da configuração base da entidade.'
  }

  const mode = config.serviceRules?.attendanceMode ?? 'mixed'
  const channels = [
    config.channels?.whatsapp ? 'WhatsApp' : null,
    config.channels?.phone ? 'Telefone' : null,
    config.channels?.email ? 'Email' : null,
    config.channels?.website ? 'Website' : null,
  ].filter((item): item is string => item !== null)

  return `Modo atual: ${mode}. Canais ativos: ${channels.length > 0 ? channels.join(', ') : 'nenhum canal configurado'}.`
}

export default function AdminEntityInteractionPage({ entityId }: AdminEntityInteractionPageProps) {
  const [config, setConfig] = useState<EntityBusinessConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadConfig() {
      try {
        setIsLoading(true)
        setError(null)
        const payload = await getEntityBusinessConfig(entityId)
        setConfig(payload.businessConfig)
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Erro ao carregar interacao.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadConfig()
  }, [entityId])

  return (
    <AdminEntityLayout
      entityId={entityId}
      section="interaction"
      title="Interaction"
      subtitle="Configuração e leitura dos canais de conversa, sem duplicar a lógica cognitiva da entidade."
    >
      {isLoading ? <FeedbackBanner>Carregando interação...</FeedbackBanner> : null}
      {error ? <FeedbackBanner tone="error">{error}</FeedbackBanner> : null}
      {!isLoading && !error ? (
        <>
          {!config ? (
            <SurfaceCard tone="admin" className="admin-card admin-empty-state">
              <p className="admin-empty-state__eyebrow">Interaction</p>
              <div className="admin-card-header">
                <h2>Interação ainda sem base configurada</h2>
              </div>
              <FeedbackBanner>{resolveInteractionSummary(config)}</FeedbackBanner>
              <p className="admin-empty-state__copy">
                Primeiro defina os canais e o contexto operacional da entidade. Depois disso, esta seção passa a refletir a superfície de contato sem duplicar a lógica cognitiva.
              </p>
              <div className="admin-empty-state__actions">
                <a href={`/admin/entity/${entityId}/identity`} className="admin-button">Abrir identity</a>
                <a href={`/entity/${entityId}`} className="admin-button admin-button--ghost">Ver público</a>
              </div>
            </SurfaceCard>
          ) : (
            <SurfaceCard tone="admin" className="admin-card">
              <div className="admin-card-header">
                <h2>Superfície de interação</h2>
              </div>
              <p className="admin-diagnosis-copy">{resolveInteractionSummary(config)}</p>
            </SurfaceCard>
          )}
          <SurfaceCard tone="admin" className="admin-card">
            <div className="admin-card-header">
              <h2>Separação correta</h2>
            </div>
            <div className="admin-domain-grid">
              <article className="admin-domain-card">
                <strong>Configuração</strong>
                <p>A entidade define canais, tom e regras de atendimento em identity.</p>
              </article>
              <article className="admin-domain-card">
                <strong>Execução</strong>
                <p>O chat público e os fluxos operacionais usam essa configuração, mas a decisão continua no backend.</p>
              </article>
              <article className="admin-domain-card">
                <strong>Escala</strong>
                <p>Novas verticais continuam usando a mesma seção de interação, só mudando o contexto operacional.</p>
              </article>
            </div>
          </SurfaceCard>
        </>
      ) : null}
    </AdminEntityLayout>
  )
}
