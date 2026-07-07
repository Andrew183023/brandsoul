// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LEGAL_ROUTES } from '../routes/legalRoutes'
import AdminShell from './AdminShell'

describe('AdminShell', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    window.history.replaceState({}, '', '/admin/escritorios/office-1/executive-dashboard')
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders Cockpit Executivo in the office navigation using the canonical helper route', async () => {
    await act(async () => {
      root.render(
        <AdminShell
          officeId="office-1"
          section="visao-geral"
          title="Cabine"
          subtitle="Resumo"
        >
          <div>Conteúdo</div>
        </AdminShell>,
      )
    })

    const cockpitLink = Array.from(container.querySelectorAll('a')).find(
      (anchor) => anchor.textContent?.includes('Cockpit Executivo'),
    )

    expect(cockpitLink).toBeTruthy()
    expect(cockpitLink?.getAttribute('href')).toBe(
      LEGAL_ROUTES.admin.executiveDashboard('office-1'),
    )
  })
})
