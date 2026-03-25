import { useState } from 'react'

import type { ParsedContent } from '../contentHistory'

interface ContentBlockProps {
  content: ParsedContent
}

export default function ContentBlock({ content }: ContentBlockProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const optionValues = content.blocks.options ?? []

  const copyText = async (copyKey: string, text: string) => {
    if (!text.trim()) {
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(copyKey)
      window.setTimeout(() => {
        setCopiedKey((currentKey) => (currentKey === copyKey ? null : currentKey))
      }, 1400)
    } catch (error) {
      console.error(error)
    }
  }

  const sections = [
    { key: 'principal', label: 'Principal', value: content.blocks.principal },
    { key: 'cta', label: 'CTA', value: content.blocks.cta },
    { key: 'variacao', label: 'Variacao', value: content.blocks.variacao },
    { key: 'hashtags', label: 'Hashtags', value: content.blocks.hashtags },
  ].filter((section) => section.value)

  return (
    <div className="content-block">
      <div className="content-block-header">
        <span className="content-block-type">{content.contentType.replace(/_/g, ' ')}</span>
        <button type="button" className="content-copy-button" onClick={() => copyText('all', content.rawText)}>
          {copiedKey === 'all' ? 'Copiado' : 'Copiar tudo'}
        </button>
      </div>

      {sections.map((section) => (
        <section key={section.key} className="content-block-section">
          <div className="content-block-section-header">
            <span className="content-block-section-title">{section.label}</span>
            <button type="button" className="content-copy-button" onClick={() => copyText(section.key, section.value ?? '')}>
              {copiedKey === section.key ? 'Copiado' : `Copiar ${section.label.toLowerCase()}`}
            </button>
          </div>
          <p>{section.value}</p>
        </section>
      ))}

      {optionValues.length > 0 ? (
        <section className="content-block-section">
          <div className="content-block-section-header">
            <span className="content-block-section-title">CTA</span>
            <button type="button" className="content-copy-button" onClick={() => copyText('options', optionValues.join('\n'))}>
              {copiedKey === 'options' ? 'Copiado' : 'Copiar CTAs'}
            </button>
          </div>
          <ul className="content-options-list">
            {optionValues.map((option, index) => (
              <li key={`${option}-${index}`}>{option}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
