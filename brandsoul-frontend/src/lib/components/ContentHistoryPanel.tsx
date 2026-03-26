import { useMemo, useState } from 'react'

import type { ContentHistoryItem, ParsedContent } from '../contentHistory'
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

function getPreviewLines(value?: string) {
  return value
    ?.split('\n')
    .map((line) => line.trim())
    .filter(Boolean) ?? []
}

export default function ContentHistoryPanel({ items, onClear }: ContentHistoryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const parsedItems = useMemo(
    () =>
      items.map(
        (item) => {
          const principalLines = getPreviewLines(item.parsed_blocks.principal)
          const fallbackLines = getPreviewLines(item.raw_text)
          const headline = principalLines[0] ?? item.parsed_blocks.options?.[0] ?? fallbackLines[0] ?? 'Conteúdo recente'
          const previewCandidates = [
            principalLines.slice(1).join(' '),
            item.parsed_blocks.cta,
            item.parsed_blocks.variacao,
            item.parsed_blocks.hashtags,
            fallbackLines.slice(1).join(' '),
          ]
            .map((value) => value?.trim() ?? '')
            .filter(Boolean)
          const preview = previewCandidates.find((value) => value !== headline)

          return {
            id: item.id,
            createdAt: formatHistoryDate(item.created_at),
            headline,
            preview,
            parsedContent: {
              contentType: item.content_type,
              rawText: item.raw_text,
              blocks: item.parsed_blocks,
            } satisfies ParsedContent,
          } as const
        },
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
                <strong className="content-history-headline">{item.headline}</strong>
                {item.preview ? <span className="content-history-preview">{item.preview}</span> : null}
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
