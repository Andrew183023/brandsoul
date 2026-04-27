type EntityExportPageProps = {
  entityId: string
  exportId: string
}

export default function EntityExportPage({ entityId, exportId }: EntityExportPageProps) {
  return (
    <main className="entity-export-shell entity-export-shell--loading">
      <div className="entity-export-card">
        <p>O export público {exportId} ainda não foi restaurado por completo.</p>
        <a href={`/entity/${entityId}`}>Voltar para a entidade</a>
      </div>
    </main>
  )
}
