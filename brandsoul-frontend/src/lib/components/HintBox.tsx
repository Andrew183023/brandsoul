interface HintBoxProps {
  title: string
  description: string
  example?: string
  icon?: string
  compact?: boolean
}

export default function HintBox({ title, description, example, icon = '✦', compact = false }: HintBoxProps) {
  return (
    <div className={`hint-box ${compact ? 'compact' : ''}`}>
      <div className="hint-box-header">
        <span className="hint-box-icon" aria-hidden="true">
          {icon}
        </span>
        <strong className="hint-box-title">{title}</strong>
      </div>
      <p className="hint-box-description">{description}</p>
      {example ? <p className="hint-box-example">{example}</p> : null}
    </div>
  )
}
