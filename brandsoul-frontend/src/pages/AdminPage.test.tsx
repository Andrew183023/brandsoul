// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listAdminEntitiesMock = vi.hoisted(() => vi.fn())

vi.mock('../backend-bridge/api/adminApi', () => ({
  listAdminEntities: listAdminEntitiesMock,
}))

vi.mock('../lib/auth', () => ({
  logout: vi.fn(),
}))

import AdminPage from './AdminPage'

describe('AdminPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    listAdminEntitiesMock.mockReset()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders the active entity returned by the admin API', async () => {
    listAdminEntitiesMock.mockResolvedValue({
      status: 'ready',
      userId: 7,
      tenantId: 11,
      entities: [
        {
          entityId: 'office-real-1',
          status: 'ready',
          createdAt: '2026-05-26T10:00:00.000Z',
          updatedAt: '2026-05-26T10:00:00.000Z',
          entity: {
            finalForm: {
              identity: {
                name: 'Ferreira Rocha Advocacia',
              },
            },
          },
        },
      ],
    })

    await act(async () => {
      root.render(<AdminPage />)
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listAdminEntitiesMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Ferreira Rocha Advocacia')
    expect(container.textContent).toContain('office-real-1')
  })
})
