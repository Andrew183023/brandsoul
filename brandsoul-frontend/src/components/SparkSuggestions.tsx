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

  return (
    <section className="suggestions-container" aria-label="Sugestoes proativas da Centelha">
      <div className="suggestions-header">
        <span className="suggestions-title">{introMode ? 'Posso te ajudar com' : 'Sugestoes da Centelha'}</span>
        <span className="suggestions-subtitle">
          {introMode ? 'Escolha um caminho e eu puxo a conversa daqui.' : 'Movimentos que eu posso puxar agora para ganhar ritmo.'}
        </span>
      </div>

      {suggestions.length > 0 ? (
        <div className="suggestions-list">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.type}:${suggestion.text}`}
              type="button"
              className="suggestion-chip"
              onClick={() => onSelect(suggestion)}
            >
              <span className="suggestion-chip-tag">{suggestionTypeLabel[suggestion.type]}</span>
              <span>{suggestion.text}</span>
            </button>
          ))}
        </div>
      ) : null}

      {contentActions.length > 0 ? (
        <div className="suggestions-list" aria-label="Acoes de conteudo">
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
