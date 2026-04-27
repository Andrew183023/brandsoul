import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'

export interface BrandInteractionTurnMessage {
  speaker_id: 'a' | 'b'
  brand_name: string
  content: string
  tone: string
  power: string
}

interface BrandInteractionListProps {
  transcript: BrandInteractionTurnMessage[]
  currentTurnIndex?: number | null
  executionState?: 'idle' | 'running' | 'done'
}

export default function BrandInteractionList({
  transcript,
  currentTurnIndex = null,
  executionState = 'idle',
}: BrandInteractionListProps) {
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [transcript])

  if (transcript.length === 0) {
    return (
      <div className="brand-interaction-empty-state">
        <p>{executionState === 'running' ? 'A interacao esta prestes a comecar.' : 'As duas Centelhas ainda nao iniciaram a troca.'}</p>
        <span>
          {executionState === 'running'
            ? 'O transcript sera revelado turno por turno.'
            : 'Configure as duas marcas, escolha um contexto e rode a simulacao.'}
        </span>
      </div>
    )
  }

  return (
    <div className="brand-interaction-list-shell">
      <ul className="brand-interaction-list" aria-live="polite">
        {transcript.map((turn, index) => (
          <motion.li
            key={`${turn.speaker_id}-${turn.brand_name}-${index}`}
            className={`brand-interaction-row ${turn.speaker_id} ${currentTurnIndex === index ? 'active-turn' : ''}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <div className={`brand-interaction-bubble ${turn.speaker_id} ${currentTurnIndex === index ? 'active-turn' : ''}`}>
              <div className="brand-interaction-meta">
                <span className="brand-interaction-speaker">{turn.brand_name}</span>
                <span className="brand-interaction-tags">
                  {turn.tone} · {turn.power}
                </span>
              </div>
              <p>{turn.content}</p>
            </div>
          </motion.li>
        ))}
      </ul>
      <div ref={endRef} />
    </div>
  )
}