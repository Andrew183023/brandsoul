import { useEffect, useMemo, useState } from 'react'

import { getSeoLandingPage, type SeoLandingPage } from '../../backend-bridge/api/seoLandingApi'
import { trackLandingVisit } from '../../backend-bridge/api/leadAttributionApi'
import { createRegionalLead, type RegionalLeadUrgency } from '../../backend-bridge/api/regionalLeadApi'
import { LEGAL_ROUTES } from '../../app/routes/legalRoutes'
import PublicShell from '../../app/shells/PublicShell'
import '../../styles/entityPublicPage.css'

const ATTRIBUTION_STORAGE_KEY = 'brandsoul_growth_attribution'
const runtimeAttributionLocks = new Set<string>()

type AttributionRegistry = Record<string, string>

type SeoLandingPageProps = {
  city: string
  specialty: string
}

type LeadFormState = {
  name: string
  phone: string
  email: string
  urgency: RegionalLeadUrgency
  caseSummary: string
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

function formatRegionalHeading(page: SeoLandingPage) {
  const normalizedSpecialty = page.specialty.trim()
  const normalizedCity = page.city.trim()
  return normalizedSpecialty && normalizedCity
    ? `${normalizedSpecialty} em ${normalizedCity}`
    : page.title
}

function formatUrgencyLabel(value: RegionalLeadUrgency) {
  switch (value) {
    case 'critical':
      return 'Crítica'
    case 'high':
      return 'Alta'
    case 'low':
      return 'Baixa'
    default:
      return 'Normal'
  }
}

function sanitizeSeoLandingHtml(contentHtml: string | undefined) {
  const source = contentHtml?.trim()
  if (!source || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return ''
  }

  const parser = new DOMParser()
  const parsed = parser.parseFromString(source, 'text/html')
  const allowedTags = new Set([
    'a',
    'blockquote',
    'br',
    'em',
    'h2',
    'h3',
    'h4',
    'li',
    'ol',
    'p',
    'strong',
    'ul',
  ])

  parsed.body.querySelectorAll('*').forEach((element) => {
    const tagName = element.tagName.toLowerCase()

    if (!allowedTags.has(tagName)) {
      element.replaceWith(document.createTextNode(element.textContent ?? ''))
      return
    }

    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase()
      if (attributeName.startsWith('on') || attributeName === 'style') {
        element.removeAttribute(attribute.name)
      }
    })

    if (tagName === 'a') {
      const href = element.getAttribute('href')?.trim() ?? ''
      const isSafeHref = href.startsWith('/') || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')

      if (!isSafeHref) {
        element.removeAttribute('href')
      } else if (href.startsWith('http://') || href.startsWith('https://')) {
        element.setAttribute('target', '_blank')
        element.setAttribute('rel', 'noreferrer')
      }
    } else {
      Array.from(element.attributes).forEach((attribute) => {
        element.removeAttribute(attribute.name)
      })
    }
  })

  return parsed.body.innerHTML.trim()
}

export default function SeoLandingPage({ city, specialty }: SeoLandingPageProps) {
  const [page, setPage] = useState<SeoLandingPage | undefined>()
  const [isLoading, setIsLoading] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [isSubmittingLead, setIsSubmittingLead] = useState(false)
  const [formState, setFormState] = useState<LeadFormState>({
    name: '',
    phone: '',
    email: '',
    urgency: 'normal',
    caseSummary: '',
  })

  const sanitizedContentHtml = useMemo(() => sanitizeSeoLandingHtml(page?.contentHtml), [page?.contentHtml])

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
        <main className="office-profile-page seo-landing-page">
          <section className="office-loading-card">Carregando presença regional...</section>
        </main>
      </PublicShell>
    )
  }

  if (!page) {
    return (
      <PublicShell>
        <main className="office-profile-page seo-landing-page">
          <section className="office-state-banner office-state-banner--warning">
            <strong>Página regional não encontrada.</strong>
            <p>Essa presença pode ainda não ter sido publicada.</p>
          </section>
        </main>
      </PublicShell>
    )
  }

  const officeProfileUrl = LEGAL_ROUTES.public.escritorioPerfil(page.entityId)
  const officeTriageUrl = '#seo-landing-form'
  const officeLabel = page.entityId.trim() || 'Escritório parceiro'
  const regionalHeading = formatRegionalHeading(page)
  const landingSubtitle = page.metaDesc?.trim()
    || `Atendimento em ${page.city} com foco em ${page.specialty}, triagem inicial organizada e encaminhamento com mais contexto.`
  const urgencyHighlight = formState.urgency === 'critical' || formState.urgency === 'high'
    ? 'Urgência alta ou crítica recebe priorização na triagem inicial.'
    : 'A triagem ajuda a classificar urgência, contexto e próximo passo antes do contato jurídico.'

  async function handleLeadSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!page) {
      return
    }

    const searchParams = new URLSearchParams(window.location.search)

    setIsSubmittingLead(true)
    setSubmitError(null)
    setSubmitSuccess(null)

    try {
      await createRegionalLead({
        landingSlug: page.slug,
        campaignId: page.campaignId,
        landingPageId: page.id,
        tenantId: page.tenantId,
        entityId: page.entityId,
        name: formState.name,
        phone: formState.phone,
        email: formState.email || undefined,
        city: page.city,
        specialty: page.specialty,
        urgency: formState.urgency,
        caseSummary: formState.caseSummary,
        utmSource: searchParams.get('utm_source') ?? undefined,
        utmMedium: searchParams.get('utm_medium') ?? undefined,
        utmCampaign: searchParams.get('utm_campaign') ?? undefined,
        utmTerm: searchParams.get('utm_term') ?? undefined,
        referrer: document.referrer || undefined,
      })

      setSubmitSuccess('Recebemos sua solicitação. O escritório poderá analisar seu caso com mais contexto.')
      setFormState({
        name: '',
        phone: '',
        email: '',
        urgency: 'normal',
        caseSummary: '',
      })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível enviar sua solicitação agora.')
    } finally {
      setIsSubmittingLead(false)
    }
  }

  return (
    <PublicShell>
      <main className="office-profile-page seo-landing-page">
        <section className="office-profile-header seo-landing-hero">
          <div className="office-profile-header__identity seo-landing-hero__identity">
            <p className="office-profile-header__kicker">presença regional jurídica</p>
            <h1>{regionalHeading}</h1>
            <p className="office-profile-header__meta">Atendimento em {page.city} com foco em {page.specialty}</p>
            <p className="office-profile-header__tagline seo-landing-hero__tagline">{landingSubtitle}</p>
            <div className="seo-landing-hero__highlights" aria-label="Destaques regionais">
              <span className="seo-landing-hero__pill">Cidade: {page.city}</span>
              <span className="seo-landing-hero__pill">Especialidade: {page.specialty}</span>
              <span className="seo-landing-hero__pill">Triagem gratuita e contextual</span>
            </div>
          </div>

          <div className="seo-landing-hero__panel">
            <div className="seo-landing-hero__card">
              <p className="office-profile-header__kicker">próximo passo</p>
              <h2>Explique seu caso e inicie a triagem gratuita</h2>
              <p>
                Você compartilha o contexto inicial, a urgência e o melhor canal de contato. O escritório recebe
                tudo de forma organizada para responder com mais clareza.
              </p>
            </div>
            <div className="office-profile-header__actions seo-landing-hero__actions">
              <a className="office-button office-button--primary" href={officeTriageUrl}>
                Iniciar triagem gratuita
              </a>
            </div>
            <a className="seo-landing-hero__secondary-link" href={officeProfileUrl}>
              Ver escritório responsável
            </a>
          </div>
        </section>

        <section className="seo-landing-grid">
          <article className="office-profile-block office-profile-block--narrative seo-landing-main">
            <section className="office-profile-section seo-landing-region">
              <div className="office-block-heading">
                <p>Contexto local</p>
                <h2>Atendimento pensado para {page.city}</h2>
              </div>
              <p>
                Esta landing regional conecta pessoas que buscam {page.specialty.toLowerCase()} em {page.city} com
                uma entrada mais objetiva, clara e organizada desde o primeiro contato.
              </p>
              <div className="seo-landing-region__grid">
                <article className="seo-landing-region__card">
                  <span>Cidade</span>
                  <strong>{page.city}</strong>
                  <p>Leitura regional para facilitar o primeiro contato com contexto local.</p>
                </article>
                <article className="seo-landing-region__card">
                  <span>Especialidade</span>
                  <strong>{page.specialty}</strong>
                  <p>Conteúdo e captação alinhados com a frente jurídica desta busca.</p>
                </article>
                <article className="seo-landing-region__card">
                  <span>Urgência</span>
                  <strong>{formatUrgencyLabel(formState.urgency)}</strong>
                  <p>{urgencyHighlight}</p>
                </article>
              </div>
            </section>

            <section className="office-profile-section seo-landing-editorial">
              <div className="office-block-heading">
                <p>Leitura editorial</p>
                <h2>Como este atendimento costuma começar</h2>
              </div>
              {sanitizedContentHtml ? (
                <div
                  className="seo-landing-content"
                  dangerouslySetInnerHTML={{ __html: sanitizedContentHtml }}
                />
              ) : (
                <div className="seo-landing-content">
                  <p>
                    O primeiro passo é reunir um resumo claro do caso, entender a urgência e definir o melhor canal
                    para retorno. Isso reduz retrabalho e melhora a qualidade da análise inicial.
                  </p>
                  <p>
                    Em {page.city}, a busca por {page.specialty.toLowerCase()} costuma exigir rapidez na organização
                    do contexto e um encaminhamento compreensível para o escritório responsável.
                  </p>
                </div>
              )}
            </section>
          </article>

          <aside className="seo-landing-side">
            <section className="office-profile-block seo-landing-trust">
              <div className="office-block-heading">
                <p>Confiança</p>
                <h2>Atendimento organizado por escritório parceiro</h2>
              </div>
              <p>
                A triagem é estruturada pela plataforma para preservar contexto. O atendimento jurídico segue com o
                escritório responsável por esta presença regional.
              </p>
              <div className="seo-landing-trust__entity">
                <span>Escritório responsável</span>
                <strong>{officeLabel}</strong>
              </div>
              <a className="office-button office-button--secondary" href={officeProfileUrl}>
                Ver escritório responsável
              </a>
            </section>

            <section className="office-profile-intake seo-landing-form-shell" id="seo-landing-form">
              <div className="office-profile-intake__header">
                <p className="office-profile-header__kicker">triagem gratuita</p>
                <h2>Compartilhe seu caso com clareza</h2>
                <p>
                  Preencha o essencial. A plataforma organiza contexto, urgência e contato para facilitar o retorno.
                </p>
              </div>

              <form className="seo-landing-form" onSubmit={(event) => void handleLeadSubmit(event)}>
                <label className="seo-landing-field">
                  <span>Nome</span>
                  <input
                    value={formState.name}
                    onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Seu nome"
                    required
                  />
                </label>

                <label className="seo-landing-field">
                  <span>WhatsApp ou telefone</span>
                  <input
                    value={formState.phone}
                    onChange={(event) => setFormState((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="(31) 99999-9999"
                    required
                  />
                </label>

                <label className="seo-landing-field">
                  <span>Email (opcional)</span>
                  <input
                    value={formState.email}
                    onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                    placeholder="voce@exemplo.com"
                    type="email"
                  />
                </label>

                <label className="seo-landing-field">
                  <span>Urgência</span>
                  <select
                    value={formState.urgency}
                    onChange={(event) => setFormState((current) => ({ ...current, urgency: event.target.value as RegionalLeadUrgency }))}
                  >
                    <option value="low">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </label>

                <label className="seo-landing-field">
                  <span>Resumo do caso</span>
                  <textarea
                    value={formState.caseSummary}
                    onChange={(event) => setFormState((current) => ({ ...current, caseSummary: event.target.value }))}
                    placeholder="Explique seu caso com o máximo de contexto útil para a triagem."
                    rows={5}
                    required
                  />
                </label>

                {submitError ? (
                  <div className="office-state-banner office-state-banner--warning">
                    <strong>Não foi possível enviar agora.</strong>
                    <p>{submitError}</p>
                  </div>
                ) : null}

                {submitSuccess ? (
                  <div className="office-state-banner office-state-banner--info">
                    <strong>Solicitação recebida.</strong>
                    <p>{submitSuccess}</p>
                  </div>
                ) : null}

                <div className="seo-landing-form__actions">
                  <button className="office-button office-button--primary" type="submit" disabled={isSubmittingLead}>
                    {isSubmittingLead ? 'Enviando triagem...' : 'Iniciar triagem gratuita'}
                  </button>
                </div>
              </form>
            </section>
          </aside>
        </section>
      </main>
    </PublicShell>
  )
}
