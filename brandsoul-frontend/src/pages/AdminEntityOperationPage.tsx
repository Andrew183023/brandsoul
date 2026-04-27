import { useEffect, useState } from 'react'

import { getEntityBusinessConfig, type EntityBusinessConfig } from '../backend-bridge/api/adminApi'
import AdminEntityLayout from '../components/AdminEntityLayout'
import FeedbackBanner from '../components/FeedbackBanner'
import SurfaceCard from '../components/SurfaceCard'

type AdminEntityOperationPageProps = {
  entityId: string
}

type OperationUiState = 'loading' | 'error' | 'empty' | 'ready'

type OperationCard = {
  title: string
  description: string
  emphasis?: string
}

function resolveOperationHeadline(config: EntityBusinessConfig) {
  if (config.businessType === 'restaurant') {
    return 'Operação orientada por catálogo e jornada de consumo.'
  }

  if (config.businessType === 'store') {
    return 'Operação orientada por produtos, vitrine e conversão.'
  }

  if (config.businessType === 'legal') {
    return 'Operação orientada por serviços jurídicos, casos e triagem.'
  }

  return 'Operação orientada por serviços, agenda e atendimento.'
}

function resolveOperationCards(config: EntityBusinessConfig): OperationCard[] {
  const catalogEnabled = config.serviceRules?.catalogEnabled === true
  const bookingEnabled = config.serviceRules?.bookingEnabled === true
  const responseWindow = config.serviceRules?.responseWindowLabel ?? 'Nao configurada'

  if (config.businessType === 'restaurant') {
    return [
      {
        title: 'Catálogo',
        description: 'A mesma superfície de operação pode atender cardápio, categorias e destaques de consumo sem criar uma tela exclusiva para restaurante.',
        emphasis: catalogEnabled ? 'Catalogo habilitado' : 'Catalogo ainda nao habilitado',
      },
      {
        title: 'Atendimento',
        description: 'O tipo do negócio informa o foco operacional, mas a edição continua na mesma arquitetura de entidade.',
        emphasis: `Modo atual: ${config.serviceRules?.attendanceMode ?? 'mixed'}`,
      },
    ]
  }

  if (config.businessType === 'store') {
    return [
      {
        title: 'Produtos',
        description: 'A operação usa os mesmos componentes de configuração e projeção para vitrine, itens e CTA de compra.',
        emphasis: catalogEnabled ? 'Catalogo habilitado' : 'Catalogo ainda nao habilitado',
      },
      {
        title: 'Conversão',
        description: 'O runtime comercial permanece separado da identidade; aqui fica só a superfície de negócio.',
        emphasis: `Janela de resposta: ${responseWindow}`,
      },
    ]
  }

  if (config.businessType === 'legal') {
    return [
      {
        title: 'Serviços jurídicos',
        description: 'A mesma página suporta guidance, intake e operação de casos, sem criar uma vertical isolada de advocacia.',
        emphasis: 'Casos e atendimento juridico compartilham a mesma entidade',
      },
      {
        title: 'Triagem',
        description: 'O fluxo jurídico continua operacional, enquanto a inteligência e o runtime permanecem observáveis em outras seções.',
        emphasis: `Janela de resposta: ${responseWindow}`,
      },
    ]
  }

  return [
    {
      title: 'Serviços',
      description: 'A camada operacional trata ofertas, atendimento e agenda sem duplicar layout por vertical.',
      emphasis: bookingEnabled ? 'Booking habilitado' : 'Booking ainda nao habilitado',
    },
    {
      title: 'Execução',
      description: 'A entidade mantém uma única superfície administrativa e cresce por configuração, não por novas telas por segmento.',
      emphasis: `Janela de resposta: ${responseWindow}`,
    },
  ]
}

export default function AdminEntityOperationPage({ entityId }: AdminEntityOperationPageProps) {
  const [uiState, setUiState] = useState<OperationUiState>('loading')
  const [config, setConfig] = useState<EntityBusinessConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadOperationConfig() {
      try {
        setUiState('loading')
        setError(null)

        const payload = await getEntityBusinessConfig(entityId)
        setConfig(payload.businessConfig)
        setUiState(payload.businessConfig ? 'ready' : 'empty')
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Erro ao carregar operacao.')
        setUiState('error')
      }
    }

    void loadOperationConfig()
  }, [entityId])

  const cards = config ? resolveOperationCards(config) : []

  return (
    <AdminEntityLayout
      entityId={entityId}
      section="operation"
      title="Operation"
      subtitle="Uma única superfície operacional que varia por businessType sem fragmentar o admin."
    >
      {uiState === 'loading' ? <FeedbackBanner>Carregando operação...</FeedbackBanner> : null}
      {uiState === 'error' ? <FeedbackBanner tone="error">{error ?? 'Erro ao carregar operação.'}</FeedbackBanner> : null}
      {uiState === 'empty' ? (
        <SurfaceCard tone="admin" className="admin-card admin-empty-state">
          <p className="admin-empty-state__eyebrow">Operation</p>
          <div className="admin-card-header">
            <h2>Base operacional ainda vazia</h2>
          </div>
          <FeedbackBanner>Nenhuma base operacional configurada ainda.</FeedbackBanner>
          <p className="admin-empty-state__copy">
            Defina primeiro a identidade operacional da entidade. A página de operação se adapta ao businessType configurado, sem criar uma tela separada por vertical.
          </p>
          <div className="admin-empty-state__actions">
            <a href={`/admin/entity/${entityId}/identity`} className="admin-button">Abrir identity</a>
          </div>
        </SurfaceCard>
      ) : null}
      {uiState === 'ready' && config ? (
        <>
          <SurfaceCard tone="admin" className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2>{config.businessType}</h2>
                <p className="admin-diagnosis-meta">{resolveOperationHeadline(config)}</p>
              </div>
              <span>operation model</span>
            </div>
            <div className="admin-domain-grid">
              {cards.map((card) => (
                <article key={card.title} className="admin-domain-card">
                  <strong>{card.title}</strong>
                  <p>{card.description}</p>
                  {card.emphasis ? <span>{card.emphasis}</span> : null}
                </article>
              ))}
            </div>
          </SurfaceCard>
          <SurfaceCard tone="admin" className="admin-card">
            <div className="admin-card-header">
              <h2>Princípio da tela</h2>
            </div>
            <p className="admin-diagnosis-copy">
              Restaurant, store, legal e services mudam o conteúdo exibido, mas não mudam a arquitetura administrativa. A diferença de vertical entra como configuração de operação, não como nova aplicação paralela.
            </p>
          </SurfaceCard>
        </>
      ) : null}
    </AdminEntityLayout>
  )
}
