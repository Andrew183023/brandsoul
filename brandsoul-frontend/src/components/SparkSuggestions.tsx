import type { ContentAction } from '../lib/contentActions'

export type SuggestionType = 'marketing' | 'sales' | 'operation'

export interface Suggestion {
  type: SuggestionType
  text: string
}

interface SparkSuggestionsProps {
  suggestions: Suggestion[]
  onSelect: (suggestion: Suggestion) => void
  contentActions?: ContentAction[]
  onContentActionSelect?: (action: ContentAction) => void
  introMode?: boolean
}

const suggestionTypeLabel: Record<SuggestionType, string> = {
  marketing: 'Marketing',
  sales: 'Vendas',
  operation: 'Operacao',
}

export default function SparkSuggestions({
  suggestions,
  onSelect,
  contentActions = [],
  onContentActionSelect,
  introMode = false,
}: SparkSuggestionsProps) {
  if (suggestions.length === 0 && contentActions.length === 0) {
    return null
  }

  const primarySuggestion = suggestions[0]
  const secondarySuggestions = suggestions.slice(1)

  return (
    <section className="suggestions-container" aria-label="Sugestoes proativas da Centelha">
      <div className="suggestions-header">
        <span className="suggestions-title">{introMode ? 'Posso te ajudar com' : 'Sugestoes da Centelha'}</span>
        <span className="suggestions-subtitle">
          {introMode ? 'Escolha um caminho e eu puxo a conversa daqui.' : 'Movimentos que eu posso puxar agora para ganhar ritmo.'}
        </span>
      </div>

      {primarySuggestion ? (
        <div className="suggestions-feature">
          <div className="suggestions-feature-copy">
            <span className="suggestion-chip-tag">{suggestionTypeLabel[primarySuggestion.type]}</span>
            <p className="suggestions-feature-text">{primarySuggestion.text}</p>
          </div>
          <div className="suggestions-actions-row">
            <button
              type="button"
              className="suggestion-chip"
              onClick={() => onSelect(primarySuggestion)}
            >
              <span>Seguir essa sugestao</span>
            </button>
          </div>
        </div>
      ) : null}

      {secondarySuggestions.length > 0 ? (
        <div className="suggestions-actions-row">
          {secondarySuggestions.map((suggestion) => (
            <button key={`${suggestion.type}:${suggestion.text}`} type="button" className="suggestion-chip" onClick={() => onSelect(suggestion)}>
              <span className="suggestion-chip-tag">{suggestionTypeLabel[suggestion.type]}</span>
              <span>{suggestion.text}</span>
            </button>
          ))}
        </div>
      ) : null}

      {contentActions.length > 0 ? (
        <div className="suggestions-actions-row" aria-label="Acoes de conteudo">
          {contentActions.map((action) => (
            <button
              key={action.type}
              type="button"
              className="suggestion-chip"
              onClick={() => onContentActionSelect?.(action)}
            >
              <span className="suggestion-chip-tag">Conteudo</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
