import { useEffect, useState } from 'react'

import { getSeoLandingPage, type SeoLandingPage } from '../../backend-bridge/api/seoLandingApi'
import PublicShell from '../../app/shells/PublicShell'
import '../../styles/entityPublicPage.css'

type SeoLandingPageProps = {
  city: string
  specialty: string
}

export default function SeoLandingPage({ city, specialty }: SeoLandingPageProps) {
  const [page, setPage] = useState<SeoLandingPage | undefined>()
  const [isLoading, setIsLoading] = useState(true)

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
