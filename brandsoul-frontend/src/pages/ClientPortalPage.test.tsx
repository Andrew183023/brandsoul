// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../backend-bridge/api/publicEntityApi', () => ({
  getClientPortalCase: vi.fn(),
  getPublicCaseMessages: vi.fn(),
  sendPublicCaseMessage: vi.fn(),
}))

import {
  getClientPortalCase,
  getPublicCaseMessages,
  sendPublicCaseMessage,
} from '../backend-bridge/api/publicEntityApi'
import ClientPortalPage from './ClientPortalPage'

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('ClientPortalPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as typeof globalThis & { React?: typeof React }).React = React
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    window.history.pushState({}, '', '/portal/case-123/token-abc')
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
    vi.useRealTimers()
    window.history.pushState({}, '', '/')
  })

  it('renders client-facing portal data with human labels', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-02T15:00:00.000Z'))

    vi.mocked(getClientPortalCase).mockResolvedValue({
      caseId: '123e4567-e89b-12d3-a456-426614174000',
      status: 'pending',
      practiceArea: 'Direito Trabalhista',
      officeName: 'Ferreira Rocha Advocacia',
      createdAt: '2026-06-02T12:00:00.000Z',
      updatedAt: '2026-06-02T13:00:00.000Z',
      responsibleProfessional: {
        id: 'prof-1',
        displayName: 'Dra. Ana Rocha',
        oabCredential: 'OAB/SP 123456',
        specialty: 'Direito Trabalhista',
      },
      timeline: [
        {
          type: 'created',
          label: 'Triagem recebida',
          occurredAt: '2026-06-02T12:00:00.000Z',
        },
        {
          type: 'status_changed',
          label: 'Aguardando informações',
          occurredAt: '2026-06-02T13:00:00.000Z',
        },
      ],
    })
    vi.mocked(getPublicCaseMessages).mockResolvedValue([
      {
        id: 'message-1',
        role: 'lawyer',
        text: 'Recebemos sua solicitação e vamos analisar.',
        createdAt: '2026-06-02T13:15:00.000Z',
      },
    ])

    await act(async () => {
      root.render(<ClientPortalPage caseId="123e4567-e89b-12d3-a456-426614174000" token="token-abc" />)
    })
    await flushPromises()

    const text = container.textContent ?? ''
    expect(text).toContain('Portal do cliente')
    expect(text).toContain('CASO-123E4567')
    expect(text).toContain('Aguardando informações')
    expect(text).toContain('Ferreira Rocha Advocacia')
    expect(text).toContain('Responsável pelo atendimento')
    expect(text).toContain('Dra. Ana Rocha')
    expect(text).toContain('Profissional responsável')
    expect(text).toContain('OAB/SP 123456')
    expect(text).toContain('Direito Trabalhista')
    expect(text).toContain('Progresso do caso')
    expect(text).toContain('Etapa atual: Em atendimento')
    expect(text).toContain('Mensagens do atendimento')
    expect(text).toContain('Escritório')
    expect(text).toContain('Recebemos sua solicitação e vamos analisar.')
    expect(text).toContain('Triagem recebida')
    expect(text).toContain('Responsável definido')
    expect(text).toContain('Encerrado')
    expect(text).toContain('Estamos aguardando informações ou documentos adicionais.')
    expect(text).toContain('Atualizado há 2 horas')
    expect(text).not.toContain('123e4567-e89b-12d3-a456-426614174000')
    expect(text).not.toContain('pending')
  })

  it('shows open cases in the first progress stage and falls back to updatedAt when the timeline has no valid activity date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T15:00:00.000Z'))

    vi.mocked(getClientPortalCase).mockResolvedValue({
      caseId: '987e6543-e89b-12d3-a456-426614174000',
      status: 'open',
      practiceArea: 'Direito de Família',
      officeName: 'BrandSoul Legal',
      createdAt: '2026-06-02T12:00:00.000Z',
      updatedAt: '2026-06-03T15:00:00.000Z',
      responsibleProfessional: null,
      timeline: [],
    })
    vi.mocked(getPublicCaseMessages).mockResolvedValue([])

    await act(async () => {
      root.render(<ClientPortalPage caseId="987e6543-e89b-12d3-a456-426614174000" token="token-xyz" />)
    })
    await flushPromises()

    const text = container.textContent ?? ''
    expect(text).toContain('Etapa atual: Triagem recebida')
    expect(text).toContain('Última movimentação há 1 dia')
    expect(text).toContain('Em definição pelo escritório')
    expect(text).toContain('Seu caso foi recebido e está aguardando análise inicial.')
    expect(text).not.toContain('OAB/')
    expect(text).not.toContain('open')
  })

  it('shows closed cases as finished without exposing raw enums', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

    vi.mocked(getClientPortalCase).mockResolvedValue({
      caseId: '555e6543-e89b-12d3-a456-426614174000',
      status: 'closed',
      practiceArea: 'Direito Civil',
      officeName: 'BrandSoul Legal',
      createdAt: '2026-06-02T12:00:00.000Z',
      updatedAt: '2026-06-05T09:00:00.000Z',
      responsibleProfessional: null,
      timeline: [
        {
          type: 'closed',
          label: 'Caso encerrado',
          occurredAt: '2026-06-05T09:00:00.000Z',
        },
      ],
    })
    vi.mocked(getPublicCaseMessages).mockResolvedValue([])

    await act(async () => {
      root.render(<ClientPortalPage caseId="555e6543-e89b-12d3-a456-426614174000" token="token-closed" />)
    })
    await flushPromises()

    const text = container.textContent ?? ''
    expect(text).toContain('Etapa atual: Encerrado')
    expect(text).toContain('O caso foi encerrado.')
    expect(text).toContain('Este atendimento está encerrado para novas mensagens.')
    expect(text).not.toContain('closed')
  })

  it('shows on_hold cases as paused while keeping em atendimento as the primary progress stage', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'))

    vi.mocked(getClientPortalCase).mockResolvedValue({
      caseId: '777e6543-e89b-12d3-a456-426614174000',
      status: 'on_hold',
      practiceArea: 'Direito Civil',
      officeName: 'BrandSoul Legal',
      createdAt: '2026-06-02T12:00:00.000Z',
      updatedAt: '2026-06-05T09:00:00.000Z',
      responsibleProfessional: {
        id: 'prof-1',
        displayName: 'Dra. Ana Rocha',
        specialty: 'Direito Civil',
      },
      timeline: [
        {
          type: 'status_changed',
          label: 'Atendimento pausado',
          occurredAt: '2026-06-05T09:00:00.000Z',
        },
      ],
    })
    vi.mocked(getPublicCaseMessages).mockResolvedValue([])

    await act(async () => {
      root.render(<ClientPortalPage caseId="777e6543-e89b-12d3-a456-426614174000" token="token-on-hold" />)
    })
    await flushPromises()

    const text = container.textContent ?? ''
    expect(text).toContain('Em pausa')
    expect(text).toContain('O atendimento encontra-se temporariamente pausado.')
    expect(text).toContain('Etapa atual: Em atendimento')
    expect(text).toContain('Atendimento pausado')
    expect(text).not.toContain('on_hold')
  })

  it('keeps core header readable with long office text while still hiding raw uuid', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-02T15:00:00.000Z'))

    const rawCaseId = 'f35a10ee-1234-4abc-b890-7d1c9f0a1234'
    const longOfficeName = 'Ferreira Rocha Advocacia Unidade Especializada em Litigios Complexos e Atendimento Interestadual de Alta Demanda'

    vi.mocked(getClientPortalCase).mockResolvedValue({
      caseId: rawCaseId,
      status: 'in_progress',
      practiceArea: 'Direito Trabalhista',
      officeName: longOfficeName,
      createdAt: '2026-06-02T12:00:00.000Z',
      updatedAt: '2026-06-02T14:59:40.000Z',
      responsibleProfessional: {
        id: 'prof-1',
        displayName: 'Dra. Ana Rocha',
        oabCredential: 'OAB/SP 123456',
        specialty: 'Direito Trabalhista',
      },
      timeline: [
        {
          type: 'created',
          label: 'Triagem recebida',
          occurredAt: '2026-06-02T12:00:00.000Z',
        },
        {
          type: 'status_changed',
          label: 'Caso em atendimento',
          occurredAt: '2026-06-02T14:59:40.000Z',
        },
      ],
    })
    vi.mocked(getPublicCaseMessages).mockResolvedValue([])

    await act(async () => {
      root.render(<ClientPortalPage caseId={rawCaseId} token="token-long-office" />)
    })
    await flushPromises()

    const text = container.textContent ?? ''
    expect(text).toContain('CASO-F35A10EE')
    expect(text).toContain('Em atendimento')
    expect(text).toContain('Seu caso está sendo analisado pelo escritório.')
    expect(text).toContain('Responsável pelo atendimento')
    expect(text).toContain('Caso em atendimento')
    expect(text).toContain('Ferreira Rocha Advocacia Unidade Especializada')
    expect(text).not.toContain(rawCaseId)
  })

  it('allows sending a new portal message while the case is active', async () => {
    vi.mocked(getClientPortalCase)
      .mockResolvedValueOnce({
        caseId: 'portal-case-1',
        status: 'accepted',
        practiceArea: 'Direito Civil',
        officeName: 'BrandSoul Legal',
        createdAt: '2026-06-02T12:00:00.000Z',
        updatedAt: '2026-06-02T13:00:00.000Z',
        responsibleProfessional: null,
        timeline: [],
      })
      .mockResolvedValueOnce({
        caseId: 'portal-case-1',
        status: 'in_progress',
        practiceArea: 'Direito Civil',
        officeName: 'BrandSoul Legal',
        createdAt: '2026-06-02T12:00:00.000Z',
        updatedAt: '2026-06-02T13:30:00.000Z',
        responsibleProfessional: null,
        timeline: [
          {
            type: 'message_added',
            label: 'Mensagem registrada',
            occurredAt: '2026-06-02T13:30:00.000Z',
          },
        ],
      })
    vi.mocked(getPublicCaseMessages).mockResolvedValue([])
    vi.mocked(sendPublicCaseMessage).mockResolvedValue([
      {
        id: 'message-client-1',
        role: 'user',
        text: 'Tenho novos documentos.',
        createdAt: '2026-06-02T13:30:00.000Z',
      },
    ])

    await act(async () => {
      root.render(<ClientPortalPage caseId="portal-case-1" token="token-send" />)
    })
    await flushPromises()

    const textarea = container.querySelector('#client-portal-message-textarea') as HTMLTextAreaElement | null
    expect(textarea).toBeTruthy()

    await act(async () => {
      textarea!.value = 'Tenho novos documentos.'
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const form = container.querySelector('.client-portal-page__message-form') as HTMLFormElement | null
    expect(form).toBeTruthy()

    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flushPromises()

    expect(sendPublicCaseMessage).toHaveBeenCalledWith('portal-case-1', 'token-send', 'Tenho novos documentos.')
    expect(container.textContent ?? '').toContain('Tenho novos documentos.')
  })

  it('blocks new portal messages when the case is resolved, closed or archived', async () => {
    vi.mocked(getClientPortalCase).mockResolvedValue({
      caseId: 'portal-case-closed',
      status: 'resolved',
      practiceArea: 'Direito Civil',
      officeName: 'BrandSoul Legal',
      createdAt: '2026-06-02T12:00:00.000Z',
      updatedAt: '2026-06-05T09:00:00.000Z',
      responsibleProfessional: null,
      timeline: [],
    })
    vi.mocked(getPublicCaseMessages).mockResolvedValue([])

    await act(async () => {
      root.render(<ClientPortalPage caseId="portal-case-closed" token="token-closed" />)
    })
    await flushPromises()

    expect(container.querySelector('#client-portal-message-textarea')).toBeNull()
    expect(container.textContent ?? '').toContain('Este atendimento está encerrado para novas mensagens.')
    expect(sendPublicCaseMessage).not.toHaveBeenCalled()
  })
})
