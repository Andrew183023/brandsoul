import { useEffect, useState } from 'react'

import { LEGAL_ROUTES } from '../app/routes/legalRoutes'
import { listAdminOffices, type AdminOfficeListItem } from '../backend-bridge/api/adminApi'
import FeedbackBanner from '../components/FeedbackBanner'
import SurfaceCard from '../components/SurfaceCard'
import { navigateTo } from '../lib/navigation'

export default function AdminOfficeGatewayPage() {
  const [offices, setOffices] = useState<AdminOfficeListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadOffices() {
      setIsLoading(true)
      setError(null)

      try {
        const payload = await listAdminOffices()
        if (cancelled) {
          return
        }

        console.log({
          event: 'legal-office-list-loaded',
          officesFromApi: payload.offices,
          officeIds: payload.offices.map((office) => office.officeId),
          officeCount: payload.offices.length,
        })

        console.log({
          event: 'legal-office-gateway-decision',
          officeCount: payload.offices.length,
          officeIds: payload.offices.map((office) => office.officeId),
          selectedOffice: payload.offices[0]?.officeId ?? null,
        })

        setOffices(payload.offices)

        if (payload.offices.length === 0) {
          return
        }

        if (payload.offices.length === 1) {
          navigateTo(LEGAL_ROUTES.admin.escritorio(payload.offices[0]!.officeId, 'visao-geral'))
          return
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Falha ao carregar escritorios.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadOffices()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="admin-shell">
      <section className="admin-panel">
        <div className="admin-header">
          <div>
            <p className="admin-kicker">admin juridico</p>
            <h1>Cabine do escritorio</h1>
            <p className="admin-subtitle">Resolva qual escritorio juridico deve abrir antes de entrar na operacao.</p>
          </div>
        </div>

        {error ? <FeedbackBanner tone="error">{error}</FeedbackBanner> : null}

        {isLoading ? (
          <FeedbackBanner>Carregando escritorios...</FeedbackBanner>
        ) : offices.length === 0 ? (
          <SurfaceCard tone="admin">
            <p>Nenhum escritorio juridico ativo foi encontrado. Vamos iniciar a ativacao institucional.</p>
            <div className="admin-actions">
              <a className="admin-button" href={LEGAL_ROUTES.onboarding.ativacao}>Iniciar ativacao</a>
            </div>
          </SurfaceCard>
        ) : (
          <div className="admin-grid">
            {offices.map((office) => (
              <SurfaceCard key={office.officeId} tone="admin">
                <div className="admin-card-header">
                  <h2>{office.officeName}</h2>
                  <span>{office.status}</span>
                </div>
                <p>{office.officeId}</p>
                <div className="admin-actions">
                  <a className="admin-button" href={LEGAL_ROUTES.admin.escritorio(office.officeId, 'visao-geral')}>
                    Abrir cabine
                  </a>
                  <a className="admin-button admin-button--ghost" href={LEGAL_ROUTES.admin.escritorio(office.officeId, 'casos')}>
                    Abrir casos
                  </a>
                </div>
              </SurfaceCard>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
