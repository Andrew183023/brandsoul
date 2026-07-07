import AdminOfficeGatewayPage from '../pages/AdminOfficeGatewayPage'
import AdminOfficeCasesPage from '../pages/AdminOfficeCasesPage'
import AdminOfficeCabinPage from '../pages/AdminOfficeCabinPage'
import AdminExecutiveCockpitPage from '../pages/AdminExecutiveCockpitPage'
import AdminOfficeGrowthPage from '../pages/AdminOfficeGrowthPage'
import AdminOfficeGrowthIntelligencePage from '../pages/AdminOfficeGrowthIntelligencePage'

function decodeRouteSegment(value?: string | null) {
  return value ? decodeURIComponent(value) : null
}

type LegalAdminSection =
  | 'visao-geral'
  | 'casos'
  | 'triagem'
  | 'equipe'
  | 'cobertura'
  | 'disponibilidade'
  | 'perfil-publico'
  | 'publicacao'
  | 'crescimento'
  | 'inteligencia-crescimento'
  | 'configuracoes'

function RouteNotFoundPage() {
  return (
    <main className="discovery-shell discovery-shell--loading">
      <div className="discovery-panel">
        <p>Rota administrativa invalida.</p>
        <a href="/admin">Voltar ao admin juridico</a>
      </div>
    </main>
  )
}

export default function LegalAdminApp() {
  const executiveDashboardMatch = window.location.pathname.match(/^\/admin\/escritorios\/([^/]+)\/executive-dashboard\/?$/)
  const officeSectionMatch = window.location.pathname.match(/^\/admin\/escritorios\/([^/]+)\/(visao-geral|casos|triagem|equipe|cobertura|disponibilidade|perfil-publico|publicacao|crescimento|inteligencia-crescimento|configuracoes)\/?$/)
  const executiveOfficeId = decodeRouteSegment(executiveDashboardMatch?.[1])
  const officeId = decodeRouteSegment(officeSectionMatch?.[1])
  const section = officeSectionMatch?.[2] as LegalAdminSection | undefined

  if (window.location.pathname === '/admin') {
    return <AdminOfficeGatewayPage />
  }

  if (executiveOfficeId) {
    return <AdminExecutiveCockpitPage officeId={executiveOfficeId} />
  }

  if (!officeId || !section) {
    return <RouteNotFoundPage />
  }

  if (section === 'casos') {
    return <AdminOfficeCasesPage officeId={officeId} />
  }

  if (section === 'crescimento') {
    return <AdminOfficeGrowthPage officeId={officeId} />
  }

  if (section === 'inteligencia-crescimento') {
    return <AdminOfficeGrowthIntelligencePage officeId={officeId} />
  }

  return <AdminOfficeCabinPage officeId={officeId} section={section} />
}
