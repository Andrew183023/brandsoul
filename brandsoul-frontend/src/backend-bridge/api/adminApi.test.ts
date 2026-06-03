import { afterEach, describe, expect, it, vi } from 'vitest'

const buildRequiredBackendAuthHeadersMock = vi.hoisted(() => vi.fn(async () => ({
  authorization: 'Bearer test-token',
  'Content-Type': 'application/json',
})))

vi.mock('./authHeaders', () => ({
  buildRequiredBackendAuthHeaders: buildRequiredBackendAuthHeadersMock,
}))

vi.mock('../../lib/api', () => ({
  readBackendBridgeBaseUrl: () => 'http://localhost:3001',
}))

import { respondToCase, updateCaseStatus } from './adminApi'

describe('adminApi respondToCase', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    buildRequiredBackendAuthHeadersMock.mockClear()
  })

  it('uses the canonical /cases/:id/messages route', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: 'ready',
        caseId: 'case-1',
        messages: [],
      }),
    }))

    vi.stubGlobal('fetch', fetchMock)

    await respondToCase('case-1', 'Resposta inicial.', 'http://localhost:3001')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/cases/case-1/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          role: 'lawyer',
          body: 'Resposta inicial.',
        }),
      }),
    )
  })
})

describe('adminApi updateCaseStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    buildRequiredBackendAuthHeadersMock.mockClear()
  })

  it('uses the canonical /cases/:id/status route', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: 'ready',
        case: {
          id: 'case-1',
          status: 'pending',
        },
      }),
    }))

    vi.stubGlobal('fetch', fetchMock)

    await updateCaseStatus('case-1', {
      status: 'pending',
      reason: 'manual_triage_step:pendente-cliente',
    }, 'http://localhost:3001')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/cases/case-1/status',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          status: 'pending',
          reason: 'manual_triage_step:pendente-cliente',
        }),
      }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      'http://localhost:3001/cases/case-1/messages',
      expect.anything(),
    )
  })
})
