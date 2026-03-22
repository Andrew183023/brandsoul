import { describe, expect, it } from 'vitest'

import { inferInteractionProfilePreview } from './interactionProfilePreview'

describe('inferInteractionProfilePreview', () => {
  it('classifies restaurant, platform and factory', () => {
    expect(inferInteractionProfilePreview('temos um restaurante japones')).toMatchObject({
      business_type: 'service',
      sector: 'food',
      model: 'b2c',
    })

    expect(inferInteractionProfilePreview('somos uma plataforma de IA para empresas')).toMatchObject({
      business_type: 'service',
      sector: 'tech',
      model: 'hybrid',
    })

    expect(inferInteractionProfilePreview('somos uma fabrica industrial de componentes')).toMatchObject({
      business_type: 'industry',
      sector: 'industrial',
      model: 'b2b',
    })
  })
})
