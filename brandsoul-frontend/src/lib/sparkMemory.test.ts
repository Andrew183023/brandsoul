import { describe, expect, it } from 'vitest'

import {
  createEmptySparkMemory,
  incrementConversationCount,
  recordDetectedIntent,
  recordSuggestionExposure,
} from './sparkMemory'

describe('sparkMemory', () => {
  it('increments conversation_count', () => {
    const nextMemory = incrementConversationCount(createEmptySparkMemory())
    expect(nextMemory.conversation_count).toBe(1)
  })

  it('keeps top intents limited', () => {
    let memory = createEmptySparkMemory()
    memory = recordDetectedIntent(memory, 'delivery', 'tem entrega?')
    memory = recordDetectedIntent(memory, 'order', 'quero pedir')
    memory = recordDetectedIntent(memory, 'price', 'quanto custa?')
    memory = recordDetectedIntent(memory, 'greeting', 'oi')

    expect(memory.top_intents.length).toBeLessThanOrEqual(3)
    expect(memory.top_intents).toContain('delivery')
  })

  it('stores recent suggestions without growing infinitely', () => {
    let memory = createEmptySparkMemory()
    memory = recordSuggestionExposure(memory, [
      'Criar promocao',
      'Criar story',
      'Criar post',
      'Criar mensagem',
      'Responder clientes',
      'Ativar contato',
      'Variar CTA',
    ])

    expect(memory.last_suggestions.length).toBeLessThanOrEqual(6)
    expect(memory.last_suggestions[0]).toBe('Criar promocao')
  })
})
