import type { PublicPresenceResponse } from '../../domain/entity/contracts/PublicPresenceResponse'

type LiveExportCardProps = {
  item: PublicPresenceResponse['exports'][number]
}

function formatMoment(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LiveExportCard({ item }: LiveExportCardProps) {
  return (
    <article className="entity-public-export-card">
      <span className="entity-public-export-card__date">{formatMoment(item.occurredAt)}</span>
      <strong>{item.summary ?? 'Export conectado ao estado atual da entidade.'}</strong>
      {item.origin ? <p>Origem: {item.origin}</p> : null}
      {item.impact ? <p>Impacto: {item.impact}</p> : null}
      {item.fileUrl ? (
        <a href={item.fileUrl} target="_blank" rel="noreferrer">
          Ver export
        </a>
      ) : null}
    </article>
  )
}

export default LiveExportCard
