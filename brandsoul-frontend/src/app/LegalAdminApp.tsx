import AdminOfficeGatewayPage from '../pages/AdminOfficeGatewayPage'
import AdminOfficeCasesPage from '../pages/AdminOfficeCasesPage'
import AdminOfficeCabinPage from '../pages/AdminOfficeCabinPage'

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
  const pathname = window.location.pathname
  const officeSectionMatch = window.location.pathname.match(/^\/admin\/escritorios\/([^/]+)\/(visao-geral|casos|triagem|equipe|cobertura|disponibilidade|perfil-publico|publicacao|configuracoes)\/?$/)
  const officeId = decodeRouteSegment(officeSectionMatch?.[1])
  const section = officeSectionMatch?.[2] as LegalAdminSection | undefined

  console.log({
    event: 'legal-admin-bootstrap',
    pathname,
    officeId,
    section: section ?? null,
    source: 'LegalAdminApp',
  })

  if (window.location.pathname === '/admin') {
    return <AdminOfficeGatewayPage />
  }

  if (!officeId || !section) {
    return <RouteNotFoundPage />
  }

  if (section === 'casos') {
    return <AdminOfficeCasesPage officeId={officeId} />
  }

  return <AdminOfficeCabinPage officeId={officeId} section={section} />
}
