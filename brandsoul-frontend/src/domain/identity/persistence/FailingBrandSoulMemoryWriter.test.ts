import { describe, expect, it } from 'vitest'

import { FailingBrandSoulMemoryWriter } from './FailingBrandSoulMemoryWriter'

describe('FailingBrandSoulMemoryWriter', () => {
  it('fails intentionally for total write failure simulation', async () => {
    const writer = new FailingBrandSoulMemoryWriter({
      errorMessage: 'simulated total failure',
    })

    await expect(
      writer.write({
        records: [],
      }),
    ).rejects.toThrow('simulated total failure')
  })
})