import './caseCollections.css'

import type { AdminLegalCaseTimelineEntry } from '../../backend-bridge/api/adminApi'
import { formatDateTime } from '../../pages/adminCaseUi'

type TimelineListProps = {
  entries: AdminLegalCaseTimelineEntry[]
}

type TimelineEventAppearance = {
  label: string
  tone: 'created' | 'assigned' | 'responded' | 'closed' | 'monetization' | 'updated'
}

function resolveTimelineAppearance(entry: AdminLegalCaseTimelineEntry): TimelineEventAppearance {
  const summary = entry.summary.toLowerCase()

  if (entry.type === 'case_opened') {
    return { label: 'criado', tone: 'created' }
  }

  if (entry.type === 'case_closed') {
    return { label: 'encerrado', tone: 'closed' }
  }

  if (summary.includes('monetiza') || summary.includes('cobranc') || summary.includes('pagament') || summary.includes('fee')) {
    return { label: 'monetizacao', tone: 'monetization' }
  }

  if (entry.type === 'message_added') {
    return { label: 'resposta', tone: 'responded' }
  }

  if (summary.includes('atribu') || summary.includes('assum') || summary.includes('assigned')) {
    return { label: 'atribuido', tone: 'assigned' }
  }

  if (summary.includes('fech') || summary.includes('encerr') || summary.includes('finaliz') || summary.includes('closed')) {
    return { label: 'encerrado', tone: 'closed' }
  }

  return { label: 'atualizado', tone: 'updated' }
}

export function TimelineList({ entries }: TimelineListProps) {
  return (
    <div className="admin-case-timeline timeline-list">
      {entries.map((entry) => {
        const appearance = resolveTimelineAppearance(entry)

        return (
          <article key={entry.id} className="admin-case-timeline-item timeline-list__item">
            <div className="admin-case-timeline-item__meta timeline-list__meta">
              <strong>{entry.type}</strong>
              <span>{formatDateTime(entry.createdAt)}</span>
            </div>
            <div className="timeline-list__content">
              <span className={`timeline-list__event timeline-list__event--${appearance.tone}`}>{appearance.label}</span>
              <p>{entry.summary}</p>
            </div>
          </article>
        )
      })}
    </div>
  )
}