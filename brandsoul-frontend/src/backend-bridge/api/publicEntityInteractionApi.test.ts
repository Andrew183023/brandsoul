import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildOptionalBackendAuthHeadersMock = vi.hoisted(() => vi.fn())
const readBackendBridgeBaseUrlMock = vi.hoisted(() => vi.fn(() => 'http://127.0.0.1:3001'))

vi.mock('./authHeaders', () => ({
  buildOptionalBackendAuthHeaders: buildOptionalBackendAuthHeadersMock,
}))

vi.mock('../../lib/api', () => ({
  readBackendBridgeBaseUrl: readBackendBridgeBaseUrlMock,
}))

import {
  PublicEntityInteractionApiError,
  requestPublicOfficeInteraction,
} from './publicEntityInteractionApi'

describe('publicEntityInteractionApi', () => {
  beforeEach(() => {
    buildOptionalBackendAuthHeadersMock.mockReset()
    readBackendBridgeBaseUrlMock.mockClear()
    buildOptionalBackendAuthHeadersMock.mockResolvedValue({
      'Content-Type': 'application/json',
    })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('preserves field-level intake errors returned by the public office triage route', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_intake',
        message: 'Não foi possível criar o atendimento. Verifique os campos obrigatórios.',
        requestId: 'triage-400',
        fields: [
          {
            field: 'clientName',
            code: 'required',
            message: 'Informe o nome completo do cliente.',
          },
        ],
      }),
    } as Response)

    await expect(requestPublicOfficeInteraction({
      officeId: 'office-1',
      request: {
        requestId: 'triage-400',
        userMessage: 'Preciso de ajuda.',
      },
    })).rejects.toMatchObject({
      status: 400,
      code: 'invalid_intake',
      requestId: 'triage-400',
      fields: [
        {
          field: 'clientName',
          code: 'required',
          message: 'Informe o nome completo do cliente.',
        },
      ],
    })
  })

  it('preserves operational request references without exposing a nested legacy contract requirement', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'triage_creation_failed',
        message: 'Não foi possível criar o atendimento agora. Tente novamente em instantes.',
        requestId: 'triage-500',
      }),
    } as Response)

    try {
      await requestPublicOfficeInteraction({
        officeId: 'office-1',
        request: {
          requestId: 'triage-500',
          userMessage: 'Preciso de ajuda.',
        },
      })
      throw new Error('Expected triage request to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(PublicEntityInteractionApiError)
      expect(error).toMatchObject({
        status: 500,
        code: 'triage_creation_failed',
        message: 'Não foi possível criar o atendimento agora. Tente novamente em instantes.',
        requestId: 'triage-500',
      })
    }
  })
})
