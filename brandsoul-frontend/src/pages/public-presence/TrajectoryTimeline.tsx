import type { PublicPresenceResponse } from '../../domain/entity/contracts/PublicPresenceResponse'

type TrajectoryTimelineProps = {
  items: PublicPresenceResponse['trajectory']
}

function formatMoment(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TrajectoryTimeline({ items }: TrajectoryTimelineProps) {
  return (
    <div className="entity-public-timeline">
      {items.map((item) => (
        <article key={`${item.occurredAt}-${item.summary}`} className="entity-public-timeline__item">
          <span>{formatMoment(item.occurredAt)}</span>
          <p>{item.summary}</p>
        </article>
      ))}
    </div>
  )
}

export default TrajectoryTimeline
