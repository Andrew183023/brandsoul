import AdminEntityLayout from '../components/AdminEntityLayout'

type AdminEntityRuntimePageProps = {
  entityId: string
}

export default function AdminEntityRuntimePage({ entityId }: AdminEntityRuntimePageProps) {
  return (
    <AdminEntityLayout
      entityId={entityId}
      section="runtime"
      title="Runtime"
      subtitle="Observação do estado operacional da entidade, separado da configuração e da identidade."
    >
      <section className="admin-card">
        <div className="admin-card-header">
          <h2>Runtime operacional</h2>
        </div>
        <p className="admin-diagnosis-copy">
          Esta seção existe para consolidar runtime, dashboard operacional e sinais do orchestrator na mesma arquitetura da entidade. A execução continua separada da configuração de negócio.
        </p>
      </section>

      <section className="admin-card">
        <div className="admin-card-header">
          <h2>Próximo encaixe</h2>
        </div>
        <div className="admin-domain-grid">
          <article className="admin-domain-card">
            <strong>Runtime</strong>
            <p>Snapshot da operação atual, sem editar cognição profunda.</p>
          </article>
          <article className="admin-domain-card">
            <strong>Dashboard</strong>
            <p>Leitura do estado autoritativo exposto pelo backend atual.</p>
          </article>
          <article className="admin-domain-card">
            <strong>Diagnóstico</strong>
            <p>Interpretação operacional sem acoplar layout à vertical do negócio.</p>
          </article>
        </div>
      </section>
    </AdminEntityLayout>
  )
}
