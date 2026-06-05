import React from 'react'

void React

import type { OperationalFeedbackSnapshot } from '../lib/operationalFeedbackEngine'

type OperationalFeedbackPanelProps = {
  title?: string
  subtitle?: string
  snapshot: OperationalFeedbackSnapshot
}

function resolveToneClassName(tone: 'critical' | 'warning' | 'neutral' | 'positive') {
  if (tone === 'critical') return 'is-critical'
  if (tone === 'warning') return 'is-warning'
  if (tone === 'positive') return 'is-positive'
  return 'is-neutral'
}

export default function OperationalFeedbackPanel({
  title = 'Painel de impacto vivo',
  subtitle = 'Inferencias deterministicas em tempo real, sem previsao ficticia.',
  snapshot,
}: OperationalFeedbackPanelProps) {
  return (
    <section className="operational-feedback-panel" aria-label="Painel de impacto operacional vivo">
      <div className="operational-feedback-panel__header">
        <h3>{title}</h3>
        <p>{subtitle}</p>
        <p className="operational-feedback-panel__summary">{snapshot.summary}</p>
      </div>

      <ul className="operational-feedback-panel__list">
        {snapshot.items.map((item) => (
          <li key={item.id} className={`operational-feedback-panel__item ${resolveToneClassName(item.tone)}`}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.valueLabel}</span>
            </div>
            <p>{item.impact}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
