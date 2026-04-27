import AdminEntityLayout from '../components/AdminEntityLayout'
import AdminDiagnosisPage from './AdminDiagnosisPage'

type AdminEntityIntelligencePageProps = {
  entityId: string
}

export default function AdminEntityIntelligencePage({ entityId }: AdminEntityIntelligencePageProps) {
  return (
    <AdminEntityLayout
      entityId={entityId}
      section="intelligence"
      title="Intelligence"
      subtitle="Diagnóstico estratégico e steering da entidade sem reduzir o admin a um CRUD."
    >
      <AdminDiagnosisPage entityId={entityId} embedded />
    </AdminEntityLayout>
  )
}
