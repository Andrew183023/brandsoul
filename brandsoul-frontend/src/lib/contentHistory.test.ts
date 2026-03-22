import { describe, expect, it } from 'vitest'

import { parseStructuredContent } from './contentHistory'

describe('parseStructuredContent', () => {
  it('finds Principal, CTA, Variacao and Hashtags', () => {
    const parsed = parseStructuredContent(`
[Instagram Post]
Principal: Hoje eu puxo meu delivery com mais ritmo.
CTA: Me chama agora e eu resolvo seu pedido.
Variacao: Hoje eu entro na sua noite com um combinado que vale a pena.
Hashtags: #delivery #sushi #noite
`)

    expect(parsed).not.toBeNull()
    expect(parsed?.blocks.principal).toContain('delivery')
    expect(parsed?.blocks.cta).toContain('Me chama')
    expect(parsed?.blocks.variacao).toContain('noite')
    expect(parsed?.blocks.hashtags).toContain('#sushi')
  })

  it('tolerates incomplete blocks', () => {
    const parsed = parseStructuredContent(`
[Story]
Principal: Hoje eu apareco rapido no seu feed.
Variacao: Passa por aqui que eu te mostro o destaque.
`)

    expect(parsed).not.toBeNull()
    expect(parsed?.blocks.principal).toContain('feed')
    expect(parsed?.blocks.cta).toBeUndefined()
    expect(parsed?.blocks.variacao).toContain('destaque')
  })
})
