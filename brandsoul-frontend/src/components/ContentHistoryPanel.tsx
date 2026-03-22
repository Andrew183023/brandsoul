import { useMemo, useState } from 'react'

import type { ContentHistoryItem, ParsedContent } from '../lib/contentHistory'
import ContentBlock from './ContentBlock'

interface ContentHistoryPanelProps {
  items: ContentHistoryItem[]
  onClear: () => void
}

function formatHistoryDate(value: string) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function ContentHistoryPanel({ items, onClear }: ContentHistoryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const parsedItems = useMemo(
    () =>
      items.map(
        (item) =>
          ({
            id: item.id,
            createdAt: formatHistoryDate(item.created_at),
            preview: item.parsed_blocks.principal?.split('\n')[0] ?? item.parsed_blocks.options?.[0] ?? item.raw_text.split('\n')[0],
            parsedContent: {
              contentType: item.content_type,
              rawText: item.raw_text,
              blocks: item.parsed_blocks,
            } satisfies ParsedContent,
          }) as const,
      ),
    [items],
  )

  if (items.length === 0) {
    return null
  }

  return (
    <section className="content-history-panel" aria-label="Conteudos recentes">
      <div className="content-history-header">
        <div>
          <span className="channel-selector-label">Conteudos recentes</span>
          <span className="channel-selector-subtitle">Materiais prontos que eu gerei aqui por dentro.</span>
        </div>
        <button type="button" className="chat-header-button subtle" onClick={onClear}>
          Limpar conteudos recentes
        </button>
      </div>

      <div className="content-history-list">
        {parsedItems.map((item) => {
          const isExpanded = expandedId === item.id

          return (
            <article key={item.id} className="content-history-item">
              <button
                type="button"
                className="content-history-trigger"
                onClick={() => setExpandedId((currentId) => (currentId === item.id ? null : item.id))}
              >
                <span className="content-history-type">{item.parsedContent.contentType.replace(/_/g, ' ')}</span>
                <strong>{item.preview}</strong>
                <span className="content-history-date">{item.createdAt}</span>
              </button>

              {isExpanded ? <ContentBlock content={item.parsedContent} /> : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
