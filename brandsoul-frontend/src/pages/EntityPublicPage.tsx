import { useEffect, useState } from 'react'

import {
  PublicEntityInteractionApiError,
  requestPublicEntityInteraction,
} from '../backend-bridge/api/publicEntityInteractionApi'
import {
  getEntityBusinessConfig,
  getEntityPublicPresence,
  type PublicEntityBusinessConfig,
} from '../backend-bridge/api/publicEntityApi'
import { getEntitySocialState, registerEntitySignal, type PublicEntitySocialState } from '../backend-bridge/api/publicSocialApi'
import type { PublicEntityDecisionResponse } from '../backend-bridge/contracts/PublicEntityDecisionResponse'
import type { PublicPresenceResponse } from '../domain/entity/contracts/PublicPresenceResponse'
import type { BrandSoulVisualRuntimePatch } from '../domain/rendering/contracts/BrandSoulVisualRuntimePatch'
import { useAuthSession } from '../lib/session'
import PublicShell from '../app/shells/PublicShell'
import FeedbackBanner from '../components/FeedbackBanner'
import SurfaceCard from '../components/SurfaceCard'
import PublicPresencePage from './public-presence/PublicPresencePage'
import { resolveDegradedResponse } from './public-presence/brandSoulPresenceRuntime'
import type { PublicPresenceCognitiveIndicator } from './public-presence/services/deriveCognitivePresenceIndicator'
import '../styles/entityPublicPage.css'

type EntityPublicPageProps = {
  entityId: string
}

function createPublicShadowRequestId() {
  return `public-shadow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeDecisionLabel(value: string) {
  return value.replace(/[-_]+/g, ' ')
}

function buildBackendDrivenCognitiveIndicator(response: PublicEntityDecisionResponse): PublicPresenceCognitiveIndicator | undefined {
  const indicator = response.decision.updatedPresenceIndicators?.cognitiveIndicator
  if (!indicator) {
    return undefined
  }

  return {
    presenceLabel: indicator.summary,
    intentLabel: normalizeDecisionLabel(response.decision.decision.intent),
    actionLabel: normalizeDecisionLabel(response.decision.decision.action),
  }
}

function applyBackendPresenceIndicators(
  presence: PublicPresenceResponse,
  indicators: PublicEntityDecisionResponse['decision']['updatedPresenceIndicators'] | undefined,
): PublicPresenceResponse {
  if (!indicators) {
    return presence
  }

  return {
    ...presence,
    visual: {
      ...presence.visual,
      intensity: typeof indicators.presenceIntensity === 'number'
        ? indicators.presenceIntensity
        : presence.visual.intensity,
    },
    relational: {
      ...presence.relational,
      relationshipLabel: indicators.relationshipLabel ?? presence.relational.relationshipLabel,
    },
  }
}

function shouldUseFrontendFallback(error: unknown) {
  if (!(error instanceof PublicEntityInteractionApiError)) {
    return true
  }

  return error.status >= 500 || error.code === 'PUBLIC_INTERACTION_DISABLED' || error.code === 'PUBLIC_INTERACTION_UNAVAILABLE'
}

function resolveFrontendFallbackReason(result:
  | { status: 'resolved'; value: PublicEntityDecisionResponse }
  | { status: 'rejected'; error: unknown }
  | { status: 'timeout' },
) {
  if (result.status === 'timeout') {
    return 'backend-timeout'
  }

  if (result.status === 'rejected') {
    if (result.error instanceof PublicEntityInteractionApiError) {
      return result.error.reason ?? result.error.code ?? `backend-status-${result.error.status}`
    }

    return 'backend-network-error'
  }

  return 'backend-authoritative'
}

function buildOfficialDecisionDebugSummary(response: PublicEntityDecisionResponse): PublicEntityDecisionResponse['decision']['debugSummary'] {
  return {
    fallbackUsed: response.decision.debugSummary?.fallbackUsed ?? response.fallback.occurred,
    fallbackReason: response.decision.debugSummary?.fallbackReason ?? response.fallback.reason,
    terminalReason: response.decision.debugSummary?.terminalReason ?? 'backend-decision-used',
    dominantReason: response.decision.debugSummary?.dominantReason
      ?? `backend decision used (${response.decision.decision.intent}/${response.decision.decision.action})`,
    authorityShift: response.decision.debugSummary?.authorityShift ?? response.decision.terminalAuthority,
    safeMode: response.decision.debugSummary?.safeMode ?? response.decision.semanticFrozen,
  }
}

function settleWithinBudget<T>(promise: Promise<T>, budgetMs: number): Promise<
  | { status: 'resolved'; value: T }
  | { status: 'rejected'; error: unknown }
  | { status: 'timeout' }
> {
  return new Promise((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) {
        return
      }

      settled = true
      resolve({ status: 'timeout' })
    }, budgetMs)

    void promise
      .then((value) => {
        if (settled) {
          return
        }

        settled = true
        window.clearTimeout(timer)
        resolve({ status: 'resolved', value })
      })
      .catch((error: unknown) => {
        if (settled) {
          return
        }

        settled = true
        window.clearTimeout(timer)
        resolve({ status: 'rejected', error })
      })
  })
}

function buildWhatsAppHref(value?: string, entityName?: string) {
  if (!value) {
    return undefined
  }

  const digits = value.replace(/\D+/g, '')
  if (!digits) {
    return undefined
  }

  const text = entityName ? `Ola, preciso falar com ${entityName}.` : 'Ola, preciso de ajuda.'
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function buildPhoneHref(value?: string) {
  if (!value) {
    return undefined
  }

  const digits = value.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : undefined
}

function groupCatalogItems(config?: PublicEntityBusinessConfig) {
  const items = (config?.catalog?.items ?? []).filter((item) => item.active !== false)
  const categories = config?.catalog?.categories ?? []

  return categories
    .map((category) => ({
      id: category.id,
      label: category.label,
      items: items.filter((item) => item.category === category.id),
    }))
    .filter((group) => group.items.length > 0)
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function buildBusinessContext(config?: PublicEntityBusinessConfig) {
  if (!config) {
    return undefined
  }

  const categories = (config.catalog?.categories ?? []).map((category) => category.label).slice(0, 6)
  const featuredItems = (config.catalog?.items ?? [])
    .filter((item) => item.active !== false)
    .map((item) => item.title)
    .slice(0, 8)
  const serviceNames = (config.services ?? [])
    .filter((service) => service.active !== false)
    .map((service) => service.name)
    .slice(0, 8)

  if (!config.description && categories.length === 0 && featuredItems.length === 0 && serviceNames.length === 0) {
    return undefined
  }

  return {
    businessType: config.businessType,
    description: config.description,
    catalogSummary: {
      categories,
      featuredItems,
    },
    servicesSummary: {
      names: serviceNames,
    },
  }
}

function resolveBusinessFallbackResponse(args: {
  message: string
  config?: PublicEntityBusinessConfig
  entityName: string
}) {
  const { config, entityName } = args
  if (!config) {
    return undefined
  }

  const message = normalizeText(args.message)
  const catalogItems = (config.catalog?.items ?? []).filter((item) => item.active !== false)
  const itemTitles = catalogItems.map((item) => item.title)
  const categoryLabels = (config.catalog?.categories ?? []).map((category) => category.label)
  const activeServices = (config.services ?? []).filter((service) => service.active !== false)
  const serviceNames = activeServices.map((service) => service.name)
  const topCatalogItems = itemTitles.slice(0, 4)
  const topCategories = categoryLabels.slice(0, 3)
  const topServices = serviceNames.slice(0, 4)

  if ((config.businessType === 'restaurant' || config.businessType === 'store') && itemTitles.length > 0) {
    if (message.includes('catalogo') || message.includes('cardapio') || message.includes('menu') || message.includes('produto')) {
      const categorySuffix = topCategories.length > 0 ? ` As categorias mais visiveis agora sao ${topCategories.join(', ')}.` : ''
      return `Posso te adiantar algumas opcoes de ${entityName}: ${topCatalogItems.join(', ')}.${categorySuffix}`
    }

    const matchedItem = itemTitles.find((title) => message.includes(normalizeText(title)))
    if (matchedItem) {
      return `${matchedItem} aparece entre as opcoes atuais de ${entityName}. Se quiser, posso te orientar para o melhor proximo passo.`
    }

    if (message.includes('marmita') || message.includes('prato') || message.includes('comida')) {
      return `As opcoes mais visiveis agora em ${entityName} sao: ${topCatalogItems.join(', ')}.`
    }
  }

  if (topServices.length > 0) {
    if (message.includes('servico') || message.includes('servicos') || message.includes('atendimento') || message.includes('consulta')) {
      return `Os atendimentos mais visiveis agora em ${entityName} sao: ${topServices.join(', ')}.`
    }

    const matchedService = serviceNames.find((serviceName) => message.includes(normalizeText(serviceName)))
    if (matchedService) {
      return `${matchedService} esta disponivel em ${entityName}. Se quiser, posso te orientar sobre o proximo passo de atendimento.`
    }
  }

  if (config.businessType === 'legal' && config.legalMode?.enabled) {
    if (message.includes('urgente') || message.includes('agora') || message.includes('emergencia') || message.includes('ajuda')) {
      return `Consigo iniciar um acolhimento inicial para ${entityName}. Se for uma situacao urgente, use o botao "Preciso de ajuda agora" ou descreva brevemente o caso.`
    }

    return `Posso te orientar no atendimento inicial de ${entityName}. Descreva o contexto e eu organizo o proximo passo.`
  }

  if (config.description) {
    return `${entityName} esta operando com foco em ${config.description.toLowerCase()}. Me diga o que voce procura e eu tento te orientar melhor.`
  }

  return undefined
}

export default function EntityPublicPage({ entityId }: EntityPublicPageProps) {
  const authSession = useAuthSession()
  const [presence, setPresence] = useState<PublicPresenceResponse | undefined>(undefined)
  const [businessConfig, setBusinessConfig] = useState<PublicEntityBusinessConfig | undefined>(undefined)
  const [socialState, setSocialState] = useState<PublicEntitySocialState | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [actionError, setActionError] = useState<string | undefined>(undefined)
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState<string | undefined>(undefined)
  const [cognitiveIndicator, setCognitiveIndicator] = useState<PublicPresenceCognitiveIndicator | undefined>(undefined)
  const [visualRuntimePatch, setVisualRuntimePatch] = useState<BrandSoulVisualRuntimePatch | undefined>(undefined)
  const [officialDecisionDebugSummary, setOfficialDecisionDebugSummary] = useState<PublicEntityDecisionResponse['decision']['debugSummary'] | undefined>(undefined)
  const [operationalFallbackReason, setOperationalFallbackReason] = useState<string | undefined>(undefined)
  const [legalCaseState, setLegalCaseState] = useState<PublicEntityDecisionResponse['actionResult'] | undefined>(undefined)
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'shared'>('idle')
  const [legalEmergencyActive, setLegalEmergencyActive] = useState(false)
  const showVisualDebug = import.meta.env.DEV || new URLSearchParams(window.location.search).has('presenceDebug')
  const publicPresenceMemorySessionId = `public-presence:${entityId}:tenant:${authSession?.tenant.id ?? 'public'}:user:${authSession?.user.id ?? 'anonymous'}`

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(undefined)

    void Promise.all([
      getEntityPublicPresence(entityId),
      getEntityBusinessConfig(entityId),
      getEntitySocialState(entityId),
      registerEntitySignal({
        entityId,
        type: 'viewed',
        source: 'entity-public-page',
        weight: 0.22,
      }),
    ]).then(([nextPresence, nextBusinessConfig, nextSocialState]) => {
      if (cancelled) {
        return
      }

      if (!nextPresence) {
        setError('Nao foi possivel carregar a entidade.')
        setLoading(false)
        return
      }

      setPresence(nextPresence)
      setBusinessConfig(nextBusinessConfig)
      setCognitiveIndicator(undefined)
      setVisualRuntimePatch(undefined)
      setOfficialDecisionDebugSummary(undefined)
      setOperationalFallbackReason(undefined)
      setLegalCaseState(undefined)
      setResponse(undefined)
      setSocialState(nextSocialState)
      setLoading(false)
    }).catch(() => {
      if (cancelled) {
        return
      }

      setError('Nao foi possivel carregar a entidade.')
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [entityId, authSession?.token])

  const handleFollow = async () => {
    if (!presence || socialState?.viewerState.followed) {
      return
    }

    if (!authSession) {
      setActionError('Faça login para registrar follow com segurança.')
      return
    }

    setActionError(undefined)
    await registerEntitySignal({
      entityId,
      type: 'followed',
      source: 'entity-public-page',
      weight: 0.78,
    })

    const nextSocialState = await getEntitySocialState(entityId)
    if (!nextSocialState) {
      setActionError('Nao foi possivel atualizar o follow agora.')
      return
    }
    setSocialState(nextSocialState)
  }

  const handleShare = async () => {
    if (!presence) {
      return
    }

    const shareUrl = `${window.location.origin}/entity/${entityId}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: presence.entity.name,
          text: presence.entity.tagline ?? 'Uma entidade viva em circulacao.',
          url: shareUrl,
        })
        setShareState('shared')
      } else {
        await navigator.clipboard.writeText(shareUrl)
        setShareState('copied')
      }
    } catch {
      return
    }

    if (authSession) {
      setActionError(undefined)
      await registerEntitySignal({
        entityId,
        type: 'shared',
        source: 'entity-public-page',
        weight: 0.68,
      })

      const nextSocialState = await getEntitySocialState(entityId)
      if (nextSocialState) {
        setSocialState(nextSocialState)
      }
    }
  }

  const handleSendMessage = async () => {
    if (!presence) {
      return
    }

    const cleanMessage = message.trim()
    if (!cleanMessage) {
      setResponse(`${presence.entity.name} observa o contexto antes de responder.`)
      return
    }

    const requestId = createPublicShadowRequestId()
    const backendBudgetMs = presence.publicFlowMindPartial?.latencyBudgetMs ?? 1_200
    const businessContext = buildBusinessContext(businessConfig)
    const backendAttempt = await settleWithinBudget(
      requestPublicEntityInteraction({
        entityId,
        request: {
          requestId,
          userMessage: cleanMessage,
          businessContext,
          context: {
            sessionId: publicPresenceMemorySessionId,
            allowDebug: showVisualDebug,
            clientRenderVersion: 'entity-public-page-phase-a',
          },
        },
      }),
      backendBudgetMs,
    )

    if (backendAttempt.status === 'resolved') {
      const backendDecision = backendAttempt.value
      console.info('[EntityPublicPage] backend decision used', {
        entityId,
        requestId,
        decisionSource: backendDecision.decision.decisionSource,
        terminalAuthority: backendDecision.decision.terminalAuthority,
        semanticFrozen: backendDecision.decision.semanticFrozen,
        intent: backendDecision.decision.decision.intent,
        action: backendDecision.decision.decision.action,
      })
      setPresence((currentPresence) => (currentPresence ? applyBackendPresenceIndicators(currentPresence, backendDecision.decision.updatedPresenceIndicators) : currentPresence))
      setResponse(backendDecision.decision.responseText)
      setCognitiveIndicator(buildBackendDrivenCognitiveIndicator(backendDecision))
      setVisualRuntimePatch(backendDecision.decision.visualPatch?.runtimePatch)
      setOfficialDecisionDebugSummary(buildOfficialDecisionDebugSummary(backendDecision))
      setOperationalFallbackReason(undefined)
      setLegalCaseState(backendDecision.actionResult)
      setActionError(undefined)
      return
    }

    if (backendAttempt.status === 'rejected' && !shouldUseFrontendFallback(backendAttempt.error)) {
      setActionError('Nao consegui concluir essa interacao publica agora.')
      return
    }

    const fallbackReason = resolveFrontendFallbackReason(backendAttempt)
    console.warn('[EntityPublicPage] local fallback used', {
      entityId,
      requestId,
      fallbackReason,
      backendStatus: backendAttempt.status,
    })

    const degradedResponse = resolveDegradedResponse({
      fallbackReason,
    })
    const businessFallbackResponse = resolveBusinessFallbackResponse({
      message: cleanMessage,
      config: businessConfig,
      entityName: presence.entity.name,
    })

    setCognitiveIndicator(undefined)
    setVisualRuntimePatch(undefined)
    setOfficialDecisionDebugSummary(undefined)
    setOperationalFallbackReason(`${degradedResponse.source}:${degradedResponse.fallbackReason}`)
    setLegalCaseState(undefined)
    setResponse(businessFallbackResponse ?? degradedResponse.responseText)
    setActionError(undefined)
  }

  const handleLegalEmergency = () => {
    if (!presence) {
      return
    }

    setLegalEmergencyActive(true)
    setMessage(`Preciso de ajuda agora com ${presence.entity.name}.`)
    setResponse('Fluxo de emergencia ativado. Descreva brevemente o que aconteceu para priorizar o atendimento.')
    setActionError(undefined)
  }

  let shellContent

  if (loading) {
    shellContent = (
      <SurfaceCard tone="public" className="entity-public-panel">
        <FeedbackBanner>Carregando presenca publica...</FeedbackBanner>
      </SurfaceCard>
    )
  } else if (!presence || error) {
    shellContent = (
      <SurfaceCard tone="public" className="entity-public-panel">
        <FeedbackBanner tone="error">{error ?? 'Entidade indisponivel.'}</FeedbackBanner>
        <a href="/discover">Explorar outras entidades</a>
      </SurfaceCard>
    )
  } else {
    const whatsappHref = buildWhatsAppHref(businessConfig?.channels?.whatsapp, presence.entity.name)
    const phoneHref = buildPhoneHref(businessConfig?.channels?.phone)
    const activePublicCtas = (businessConfig?.publicCtas ?? []).filter((cta) => cta.active !== false)
    const catalogGroups = groupCatalogItems(businessConfig)
    const showCatalog = businessConfig?.businessType === 'restaurant' || businessConfig?.businessType === 'store'
    const showLegalMode = businessConfig?.businessType === 'legal' && businessConfig.legalMode?.enabled === true

    shellContent = (
      <>
        {businessConfig ? (
          <section className="entity-public-section entity-public-section--business">
            <div className="entity-public-section__header">
              <p>negocio vivo</p>
              <h2>{businessConfig.description ?? presence.entity.tagline ?? presence.entity.name}</h2>
            </div>

            {(whatsappHref || phoneHref || activePublicCtas.length > 0) ? (
              <div className="entity-public-business-actions">
                {whatsappHref ? (
                  <a className="entity-public-button entity-public-button--primary" href={whatsappHref} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                ) : null}
                {phoneHref ? (
                  <a className="entity-public-button entity-public-button--secondary" href={phoneHref}>
                    Telefone
                  </a>
                ) : null}
                {activePublicCtas.map((cta) => (
                  <a
                    key={cta.id}
                    className={`entity-public-button ${cta.type === 'primary' || cta.type === 'booking' ? 'entity-public-button--primary' : 'entity-public-button--secondary'}`}
                    href={cta.href ?? '#'}
                    target={cta.href?.startsWith('http') ? '_blank' : undefined}
                    rel={cta.href?.startsWith('http') ? 'noreferrer' : undefined}
                  >
                    {cta.label}
                  </a>
                ))}
              </div>
            ) : null}

            {showLegalMode ? (
              <div className={`entity-public-legal-strip ${legalEmergencyActive ? 'entity-public-legal-strip--active' : ''}`}>
                <div>
                  <strong>Modo juridico ativo</strong>
                  <p>
                    {businessConfig.legalMode?.emergencyMode
                      ? 'Atendimento com prioridade para situacoes urgentes.'
                      : 'Orientacao inicial disponivel para esse atendimento.'}
                  </p>
                </div>
                {businessConfig.legalMode?.emergencyMode ? (
                  <button type="button" className="entity-public-button entity-public-button--primary" onClick={handleLegalEmergency}>
                    Preciso de ajuda agora
                  </button>
                ) : null}
              </div>
            ) : null}

            {showCatalog && catalogGroups.length > 0 ? (
              <section className="entity-public-catalog">
                <div className="entity-public-section__header">
                  <p>catalogo</p>
                  <h2>Opcoes em destaque</h2>
                </div>
                <div className="entity-public-catalog-groups">
                  {catalogGroups.map((group) => (
                    <article key={group.id} className="entity-public-catalog-group">
                      <strong>{group.label}</strong>
                      <ul className="entity-public-catalog-list">
                        {group.items.map((item) => (
                          <li key={item.id} className="entity-public-catalog-item">
                            <div>
                              <span>{item.title}</span>
                              {item.description ? <p>{item.description}</p> : null}
                            </div>
                            {item.priceLabel ? <em>{item.priceLabel}</em> : null}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        <PublicPresencePage
          presence={presence}
          socialState={socialState}
          isAuthenticated={Boolean(authSession)}
          shareState={shareState}
          actionError={actionError}
          message={message}
          response={response}
          cognitiveIndicator={cognitiveIndicator}
          visualRuntimePatch={visualRuntimePatch}
          officialDecisionDebugSummary={officialDecisionDebugSummary}
          operationalFallbackReason={operationalFallbackReason}
          legalCaseState={legalCaseState}
          showVisualDebug={showVisualDebug}
          onMessageChange={setMessage}
          onSendMessage={handleSendMessage}
          onFollow={handleFollow}
          onShare={handleShare}
        />
      </>
    )
  }

  return (
    <PublicShell isAuthenticated={Boolean(authSession)}>
      {shellContent}
    </PublicShell>
  )
}
