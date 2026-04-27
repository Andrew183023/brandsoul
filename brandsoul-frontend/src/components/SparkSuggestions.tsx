export type SuggestionType = 'marketing' | 'sales' | 'operation'

export interface Suggestion {
  type: SuggestionType
  text: string
}

interface SparkSuggestionsProps {
  suggestions: Suggestion[]
  onSelect: (suggestion: Suggestion) => void
}

const suggestionTypeLabel: Record<SuggestionType, string> = {
  marketing: 'Marketing',
  sales: 'Vendas',
  operation: 'Operacao',
}

export default function SparkSuggestions({ suggestions, onSelect }: SparkSuggestionsProps) {
  if (suggestions.length === 0) {
    return null
  }

  return (
    <section className="suggestions-container" aria-label="Sugestoes proativas da Centelha">
      <div className="suggestions-header">
        <span className="suggestions-title">Sugestoes da Centelha</span>
        <span className="suggestions-subtitle">Ideias leves para movimentar marketing, vendas e operacao.</span>
      </div>

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
    </section>
  )
}
