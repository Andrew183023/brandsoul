import { useEffect, useState } from 'react'

import { getSeoLandingPage, type SeoLandingPage } from '../../backend-bridge/api/seoLandingApi'
import { trackLandingVisit } from '../../backend-bridge/api/leadAttributionApi'
import PublicShell from '../../app/shells/PublicShell'
import '../../styles/entityPublicPage.css'

const ATTRIBUTION_STORAGE_KEY = 'brandsoul_growth_attribution'
const runtimeAttributionLocks = new Set<string>()

type AttributionRegistry = Record<string, string>

type SeoLandingPageProps = {
  city: string
  specialty: string
}

function buildAttributionKey(pathname: string, search: string) {
  return `${pathname}${search}`.toLowerCase()
}

function readAttributionRegistry() {
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? parsed as AttributionRegistry : {}
  } catch {
    return {}
  }
}

function saveAttributionRegistry(registry: AttributionRegistry) {
  window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(registry))
}

export default function SeoLandingPage({ city, specialty }: SeoLandingPageProps) {
  const [page, setPage] = useState<SeoLandingPage | undefined>()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const attributionKey = buildAttributionKey(window.location.pathname, window.location.search)

    if (runtimeAttributionLocks.has(attributionKey)) {
      return
    }

    const registry = readAttributionRegistry()
    if (registry[attributionKey]) {
      runtimeAttributionLocks.add(attributionKey)
      return
    }

    const pendingAttributionId = `pending-${Date.now()}`
    runtimeAttributionLocks.add(attributionKey)
    registry[attributionKey] = pendingAttributionId
    saveAttributionRegistry(registry)

    const searchParams = new URLSearchParams(window.location.search)

    void trackLandingVisit({
      landingSlug: window.location.pathname,
      utmSource: searchParams.get('utm_source') ?? undefined,
      utmMedium: searchParams.get('utm_medium') ?? undefined,
      utmCampaign: searchParams.get('utm_campaign') ?? undefined,
      utmTerm: searchParams.get('utm_term') ?? undefined,
      referrer: document.referrer || undefined,
    }).then((payload) => {
      const nextRegistry = readAttributionRegistry()
      nextRegistry[attributionKey] = payload.attribution.id
      saveAttributionRegistry(nextRegistry)
    }).catch((error) => {
      const nextRegistry = readAttributionRegistry()
      if (nextRegistry[attributionKey] === pendingAttributionId) {
        delete nextRegistry[attributionKey]
        saveAttributionRegistry(nextRegistry)
      }

      runtimeAttributionLocks.delete(attributionKey)
      console.warn('[SeoLandingPage] attribution tracking failed', error)
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadPage() {
      setIsLoading(true)
      const nextPage = await getSeoLandingPage(city, specialty)

      if (!cancelled) {
        setPage(nextPage)
        setIsLoading(false)
      }
    }

    void loadPage()

    return () => {
      cancelled = true
    }
  }, [city, specialty])

  if (isLoading) {
    return (
      <PublicShell>
        <main className="office-profile-page">
          <section className="office-loading-card">Carregando presença regional...</section>
        </main>
      </PublicShell>
    )
  }

  if (!page) {
    return (
      <PublicShell>
        <main className="office-profile-page">
          <section className="office-state-banner office-state-banner--warning">
            <strong>Página regional não encontrada.</strong>
            <p>Essa presença pode ainda não ter sido publicada.</p>
          </section>
        </main>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <main className="office-profile-page">
        <section className="office-profile-header">
          <div className="office-profile-header__identity">
            <p className="office-profile-header__kicker">presença regional</p>
            <h1>{page.title}</h1>
            <p className="office-profile-header__tagline">{page.metaDesc}</p>
          </div>

          <div className="office-profile-header__actions">
            <a className="office-button office-button--primary" href={`/escritorios/${page.entityId}/perfil#office-public-triagem`}>
              Fazer triagem segura
            </a>
            <a className="office-button office-button--secondary" href={`/escritorios/${page.entityId}/perfil`}>
              Ver escritório
            </a>
          </div>
        </section>

        <section className="office-profile-grid">
          <article className="office-profile-block office-profile-block--narrative">
            <h2>Atendimento em {page.city}</h2>
            <p>
              Esta página foi criada para conectar pessoas da região com atendimento jurídico
              compatível com a especialidade informada.
            </p>
          </article>

          <article className="office-profile-block office-profile-block--operational">
            <h2>Especialidade</h2>
            <p>{page.specialty}</p>
            <p>Triagem inicial, organização do caso e direcionamento para atendimento.</p>
          </article>
        </section>

        <section className="office-profile-intake">
          <div className="office-profile-intake__header">
            <p className="office-profile-header__kicker">próximo passo</p>
            <h2>Comece pela triagem inteligente</h2>
            <p>
              A BrandSoul Legal organiza o primeiro contato para preservar contexto,
              urgência e continuidade do atendimento.
            </p>
          </div>

          <a className="office-button office-button--primary" href={`/escritorios/${page.entityId}/perfil#office-public-triagem`}>
            Iniciar agora
          </a>
        </section>
      </main>
    </PublicShell>
  )
}
