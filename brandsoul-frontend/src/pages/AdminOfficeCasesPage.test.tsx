// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const assignCaseMock = vi.hoisted(() => vi.fn())
const respondToCaseMock = vi.hoisted(() => vi.fn())
const closeCaseMock = vi.hoisted(() => vi.fn())
const getCaseMock = vi.hoisted(() => vi.fn())
const getCaseMessagesMock = vi.hoisted(() => vi.fn())
const getLawyerReputationMock = vi.hoisted(() => vi.fn())
const getOfficeBusinessConfigMock = vi.hoisted(() => vi.fn())
const listOfficeCasesMock = vi.hoisted(() => vi.fn())
const useAuthSessionMock = vi.hoisted(() => vi.fn(() => ({
  user: {
    id: 7,
    email: 'owner@office.test',
    name: 'Dra. Ana Rocha',
  },
})))

vi.mock('../backend-bridge/api/adminApi', () => ({
  assignCase: assignCaseMock,
  closeCase: closeCaseMock,
  getOfficeBusinessConfig: getOfficeBusinessConfigMock,
  getCase: getCaseMock,
  getCaseMessages: getCaseMessagesMock,
  getLawyerReputation: getLawyerReputationMock,
  listOfficeCases: listOfficeCasesMock,
  respondToCase: respondToCaseMock,
}))

vi.mock('../lib/session', () => ({
  useAuthSession: useAuthSessionMock,
}))

vi.mock('../app/components/ConversationThread', () => ({
  ConversationThread: ({ messages }: { messages: Array<{ id: string }> }) => <div>Mensagens: {messages.length}</div>,
}))

vi.mock('../app/components/ProfessionalReputationCard', () => ({
  default: () => <div>Reputação</div>,
}))

vi.mock('../components/AdminOfficeLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/FeedbackBanner', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/StatusChip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../components/SurfaceCard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}))

vi.mock('../lib/caseBacklogDashboard', () => ({
  buildCaseBacklogReport: () => ({
    kpis: {
      backlogTotal: 1,
      backlogCritical: 0,
      averageFirstResponseMinutes: 15,
      averageSlaRemainingMinutes: 45,
      casesByOperator: [],
    },
    buckets: {
      criticalCases: 0,
      delayedCases: 0,
      expiringSlaCases: 0,
      noResponseCases: 0,
      waitingOperatorCases: 0,
      waitingClientCases: 0,
    },
  }),
}))

vi.mock('../lib/priorityQueueEngine', () => ({
  evaluatePriorityQueue: (cases: Array<Record<string, unknown>>) => ({
    entries: cases.map((caseItem) => ({
      caseItem,
      level: 'medium',
      score: 50,
      metrics: {
        timeWithoutResponseMinutes: 15,
        slaRemainingMinutes: 45,
      },
      reasons: ['Fila normal'],
    })),
  }),
  formatDurationMinutes: (value: number) => `${value} min`,
  formatPriorityLevel: () => 'Média',
}))

vi.mock('../lib/officeCapacityRuntime', () => ({
  evaluateOfficeCapacityRuntime: () => ({
    state: 'ESTAVEL',
    declaredCapacity: 5,
    activeCases: 1,
    operationalPressurePercent: 20,
    overloadRisk: 'baixo',
    freeCapacity: 4,
    activeOperators: 1,
    configuredSlaMinutes: 120,
    utilizationPercent: 20,
    reason: 'Capacidade estável.',
  }),
}))

vi.mock('../lib/operationalWorkbench', () => ({
  buildEscalationMessage: () => 'Escalonamento',
  buildForwardMessage: () => 'Encaminhamento',
  buildPendingClientStatusMessage: () => 'Pendente cliente',
}))

vi.mock('./adminCaseUi', () => ({
  formatCaseStatus: (status: string) => status,
  formatCaseMonetizationAmount: () => 'R$ 20,00',
  formatDateTime: (value: string) => value,
  resolveCaseStatusTone: () => 'neutral',
}))

import AdminOfficeCasesPage from './AdminOfficeCasesPage'

function createCaseFixture() {
  return {
    id: 'case-public-1',
    entityId: 'office-real-1',
    description: 'Cliente precisa de orientação trabalhista.',
    status: 'open',
    assignedProfessionalId: undefined,
    assignedLawyerId: undefined,
    leadProfessionalId: undefined,
    assignmentState: 'unassigned',
    responseState: 'waiting_office',
    isAssigned: false,
    createdAt: '2026-05-30T12:00:00.000Z',
    updatedAt: '2026-05-30T12:00:00.000Z',
    monetization: {
      amountCents: 2000,
      currency: 'BRL',
      status: 'pending',
    },
  }
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('AdminOfficeCasesPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    assignCaseMock.mockReset()
    respondToCaseMock.mockReset()
    closeCaseMock.mockReset()
    getCaseMock.mockReset()
    getCaseMessagesMock.mockReset()
    getLawyerReputationMock.mockReset()
    getOfficeBusinessConfigMock.mockReset()
    listOfficeCasesMock.mockReset()

    const caseFixture = createCaseFixture()
    listOfficeCasesMock.mockResolvedValue({
      cases: [caseFixture],
    })
    getOfficeBusinessConfigMock.mockResolvedValue({
      businessConfig: {
        businessType: 'legal',
      },
    })
    getCaseMock.mockResolvedValue({
      case: caseFixture,
    })
    getCaseMessagesMock.mockResolvedValue({
      caseId: caseFixture.id,
      messages: [],
    })
    getLawyerReputationMock.mockResolvedValue({
      reputation: null,
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('calls the canonical assign route without sending a legacy user id and prevents duplicate clicks while pending', async () => {
    let resolveAssign: ((value: { case: ReturnType<typeof createCaseFixture> }) => void) | undefined
    assignCaseMock.mockImplementation(() => new Promise((resolve) => {
      resolveAssign = resolve as typeof resolveAssign
    }))

    await act(async () => {
      root.render(<AdminOfficeCasesPage officeId="office-real-1" />)
    })
    await flushPromises()

    const respondButtonBeforeAssign = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Responder')
    expect((respondButtonBeforeAssign as HTMLButtonElement | undefined)?.disabled).toBe(true)
    expect(container.textContent).toContain('Assuma ou atribua este caso para liberar resposta.')

    const assignButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Assumir')
    expect(assignButton).toBeInstanceOf(HTMLButtonElement)

    await act(async () => {
      assignButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(assignCaseMock).toHaveBeenCalledTimes(1)
    expect(assignCaseMock).toHaveBeenCalledWith('case-public-1')
    expect((assignButton as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      assignButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(assignCaseMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      getCaseMock.mockResolvedValue({
        case: {
          ...createCaseFixture(),
          assignedProfessionalId: 'prof-owner-1',
          assignedLawyerId: 'prof-owner-1',
          status: 'dispatched',
          assignmentState: 'dispatched',
          responseState: 'waiting_office',
          isAssigned: true,
        },
      })
      listOfficeCasesMock.mockResolvedValue({
        cases: [
          {
            ...createCaseFixture(),
            assignedProfessionalId: 'prof-owner-1',
            assignedLawyerId: 'prof-owner-1',
            status: 'dispatched',
            assignmentState: 'dispatched',
            responseState: 'waiting_office',
            isAssigned: true,
          },
        ],
      })
      resolveAssign?.({
        case: {
          ...createCaseFixture(),
          assignedProfessionalId: 'prof-owner-1',
          assignedLawyerId: 'prof-owner-1',
          status: 'dispatched',
          assignmentState: 'dispatched',
          responseState: 'waiting_office',
          isAssigned: true,
        },
      })
      await Promise.resolve()
    })

    await flushPromises()

    const respondButtonAfterAssign = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Responder')
    expect((respondButtonAfterAssign as HTMLButtonElement | undefined)?.disabled).toBe(false)
  })

  it('shows a human-safe assign error when the route returns 404', async () => {
    assignCaseMock.mockRejectedValue(new Error('Failed to assign case (404).'))

    await act(async () => {
      root.render(<AdminOfficeCasesPage officeId="office-real-1" />)
    })
    await flushPromises()

    await act(async () => {
      const assignButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Assumir')
      assignButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushPromises()

    expect(container.textContent).toContain('Não foi possível assumir este caso agora.')
  })

  it('shows a team guidance CTA when professional binding is missing', async () => {
    assignCaseMock.mockRejectedValue(new Error('Cadastre ou vincule um profissional antes de assumir este caso.'))

    await act(async () => {
      root.render(<AdminOfficeCasesPage officeId="office-real-1" />)
    })
    await flushPromises()

    await act(async () => {
      const assignButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Assumir')
      assignButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushPromises()

    expect(container.textContent).toContain('Antes de assumir casos, vincule um profissional ao seu acesso.')
    const teamLink = Array.from(container.querySelectorAll('a')).find((link) => link.textContent?.trim() === 'Ir para Equipe')
    expect(teamLink?.getAttribute('href')).toBe('/admin/escritorios/office-real-1/equipe')
  })
})
