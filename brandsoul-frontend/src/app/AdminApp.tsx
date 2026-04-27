import AdminPage from '../pages/AdminPage'
import AdminBusinessConfigPage from '../pages/AdminBusinessConfigPage'
import AdminCaseDetailPage from '../pages/AdminCaseDetailPage'
import AdminDiagnosisPage from '../pages/AdminDiagnosisPage'
import AdminEntityCasesPage from '../pages/AdminEntityCasesPage'
import AdminEntityIdentityPage from '../pages/AdminEntityIdentityPage'
import AdminEntityInteractionPage from '../pages/AdminEntityInteractionPage'
import AdminEntityIntelligencePage from '../pages/AdminEntityIntelligencePage'
import AdminEntityOperationPage from '../pages/AdminEntityOperationPage'
import AdminEntityRuntimePage from '../pages/AdminEntityRuntimePage'

function decodeRouteSegment(value?: string | null) {
  return value ? decodeURIComponent(value) : null
}

export default function AdminApp() {
  const caseDetailMatch = window.location.pathname.match(/^\/admin\/cases\/([^/]+)\/?$/)
  const businessConfigMatch = window.location.pathname.match(/^\/admin\/entity\/([^/]+)\/config\/?$/)
  const diagnosisMatch = window.location.pathname.match(/^\/admin\/diagnosis\/([^/]+)\/?$/)
  const entitySectionMatch = window.location.pathname.match(/^\/admin\/entity\/([^/]+)\/(identity|operation|interaction|intelligence|runtime|cases)\/?$/)
  const caseId = decodeRouteSegment(caseDetailMatch?.[1])
  const businessConfigEntityId = decodeRouteSegment(businessConfigMatch?.[1])
  const entityId = decodeRouteSegment(diagnosisMatch?.[1])
  const sectionEntityId = decodeRouteSegment(entitySectionMatch?.[1])
  const section = entitySectionMatch?.[2]

  if (caseId) {
    return <AdminCaseDetailPage caseId={caseId} />
  }

  if (sectionEntityId && section === 'identity') {
    return <AdminEntityIdentityPage entityId={sectionEntityId} />
  }

  if (sectionEntityId && section === 'operation') {
    return <AdminEntityOperationPage entityId={sectionEntityId} />
  }

  if (sectionEntityId && section === 'interaction') {
    return <AdminEntityInteractionPage entityId={sectionEntityId} />
  }

  if (sectionEntityId && section === 'intelligence') {
    return <AdminEntityIntelligencePage entityId={sectionEntityId} />
  }

  if (sectionEntityId && section === 'runtime') {
    return <AdminEntityRuntimePage entityId={sectionEntityId} />
  }

  if (sectionEntityId && section === 'cases') {
    return <AdminEntityCasesPage entityId={sectionEntityId} />
  }

  if (businessConfigEntityId) {
    window.location.replace(`/admin/entity/${businessConfigEntityId}/identity`)
    return <AdminBusinessConfigPage entityId={businessConfigEntityId} />
  }

  if (entityId) {
    window.location.replace(`/admin/entity/${entityId}/intelligence`)
    return <AdminDiagnosisPage entityId={entityId} />
  }

  return <AdminPage />
}
