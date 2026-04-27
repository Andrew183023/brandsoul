import assert from 'node:assert/strict'
import test from 'node:test'

import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import {
  appendLegalCaseMessage,
  assignLegalCase,
  buildLawyerReputationMetrics,
  buildPublicInteractionActionResponseText,
  closeLegalCase,
  decidePublicInteractionAction,
  executePublicInteractionAction,
  listLegalCases,
} from './publicInteractionActionService.js'

function createLegalEntity(): EntityProfile {
  return {
    id: 'entity-legal-1',
    schemaVersion: 1,
    source: 'backend-engine',
    brand: {},
    context: {},
    palette: {},
    social: {
      publicName: 'BrandSoul Legal',
    },
    export: {},
    manifestation: {},
    morphology: {},
    behavior: {},
    relational: {
      behaviorState: {},
      progression: {},
      userMemory: {},
      hookLoop: {},
      binding: {},
      imprint: {},
      timelineLog: {},
      value: {},
    },
    finalForm: {
      identity: {
        name: 'BrandSoul Legal',
      },
    },
    metadata: {
      createdAt: '2026-04-25T10:00:00.000Z',
      businessConfig: {
        businessType: 'legal',
        legalMode: {
          enabled: true,
          emergencyMode: true,
        },
      },
      notes: [],
    },
  } as unknown as EntityProfile
}

test('decidePublicInteractionAction detects legal_case and extracts slots', () => {
  const decision = decidePublicInteractionAction({
    entityProfile: createLegalEntity(),
    userMessage: 'Preciso de ajuda urgente com um problema de trabalho em Campinas. Meu contato é 11987654321.',
    businessContext: {
      businessType: 'legal',
    },
  })

  assert.equal(decision.intent, 'legal_case')
  assert.equal(decision.slots.city, 'Campinas')
  assert.equal(decision.slots.contact, '11987654321')
  assert.ok(decision.slots.description)
})

test('executePublicInteractionAction creates a legal case and asks for missing data', async () => {
  const entityProfile = createLegalEntity()
  let updatedProfile: EntityProfile | undefined

  const actionResult = await executePublicInteractionAction({
    entityId: entityProfile.id,
    entityProfile,
    repository: {
      async updateEntity(input: { entityProfile: EntityProfile }) {
        updatedProfile = input.entityProfile
        return null
      },
    } as never,
    decision: {
      intent: 'legal_case',
      confidence: 0.92,
      slots: {
        description: 'Recebi uma cobranca indevida e preciso de orientacao juridica.',
      },
      missingFields: ['cidade', 'contato'],
    },
    now: '2026-04-25T12:00:00.000Z',
  })

  assert.equal(actionResult.actionType, 'create_legal_case')
  assert.equal(actionResult.status, 'created')
  if (actionResult.status !== 'created') {
    throw new Error('Expected legal case to be created.')
  }
  assert.ok(actionResult.caseId)
  assert.deepEqual(actionResult.missingFields, ['cidade', 'contato'])
  assert.ok(updatedProfile?.metadata.notes?.[0]?.startsWith('legal:case:'))
  const savedCases = updatedProfile ? listLegalCases(updatedProfile) : []
  assert.equal(savedCases.length, 1)
  assert.equal(savedCases[0]?.messages.length, 2)
  assert.equal(savedCases[0]?.timeline.length, 2)

  const responseText = buildPublicInteractionActionResponseText({
    entityName: 'BrandSoul Legal',
    baseResponseText: 'Resposta base.',
    actionDecision: {
      intent: 'legal_case',
      confidence: 0.92,
      slots: {
        description: 'Recebi uma cobranca indevida.',
      },
      missingFields: ['cidade', 'contato'],
    },
    actionResult,
  })

  assert.match(responseText, /identificador/)
  assert.match(responseText, /cidade e contato/)
})

test('appendLegalCaseMessage keeps conversation inside the case history', async () => {
  const entityProfile = createLegalEntity()
  let persistedProfile = entityProfile

  const created = await executePublicInteractionAction({
    entityId: entityProfile.id,
    entityProfile,
    repository: {
      async updateEntity(input: { entityProfile: EntityProfile }) {
        persistedProfile = input.entityProfile
        return null
      },
      async listEntities() {
        return [{
          id: entityProfile.id,
          entityProfile: persistedProfile,
        }]
      },
    } as never,
    decision: {
      intent: 'legal_case',
      confidence: 0.95,
      slots: {
        description: 'Preciso de orientacao sobre um problema com contrato de aluguel.',
        city: 'Sao Paulo',
        contact: '11999998888',
      },
      missingFields: [],
    },
    initialUserMessage: 'Preciso de orientacao sobre um problema com contrato de aluguel em Sao Paulo. Meu contato é 11999998888.',
    now: '2026-04-25T12:30:00.000Z',
  })

  assert.equal(created.actionType, 'create_legal_case')
  assert.equal(created.status, 'created')
  if (created.status !== 'created') {
    throw new Error('Expected legal case to be created.')
  }

  const appended = await appendLegalCaseMessage({
    repository: {
      async listEntities() {
        return [{
          id: entityProfile.id,
          entityProfile: persistedProfile,
        }]
      },
      async updateEntity(input: { entityProfile: EntityProfile }) {
        persistedProfile = input.entityProfile
        return null
      },
    } as never,
    caseId: created.caseId,
    role: 'user',
    text: 'Tenho documentos e posso enviar mais detalhes.',
    actorId: 'anon:test:user',
    now: '2026-04-25T12:35:00.000Z',
  })

  assert.ok(appended)
  assert.equal(appended?.legalCase.messages.at(-1)?.text, 'Tenho documentos e posso enviar mais detalhes.')
  assert.equal(appended?.legalCase.messages.at(-1)?.role, 'user')
  assert.equal(appended?.legalCase.timeline.at(-1)?.type, 'message_added')
})

test('assignLegalCase moves an open case to assigned and records timeline', async () => {
  const entityProfile = createLegalEntity()
  let persistedProfile = entityProfile

  const created = await executePublicInteractionAction({
    entityId: entityProfile.id,
    entityProfile,
    repository: {
      async updateEntity(input: { entityProfile: EntityProfile }) {
        persistedProfile = input.entityProfile
        return null
      },
    } as never,
    decision: {
      intent: 'legal_case',
      confidence: 0.91,
      slots: {
        description: 'Preciso de ajuda com uma questao contratual urgente.',
      },
      missingFields: ['cidade', 'contato'],
    },
    initialUserMessage: 'Preciso de ajuda com uma questao contratual urgente.',
    now: '2026-04-25T13:00:00.000Z',
  })
  if (created.status !== 'created') {
    throw new Error('Expected legal case to be created.')
  }

  const assigned = await assignLegalCase({
    repository: {
      async listEntities() {
        return [{
          id: entityProfile.id,
          entityProfile: persistedProfile,
        }]
      },
      async updateEntity(input: { entityProfile: EntityProfile }) {
        persistedProfile = input.entityProfile
        return null
      },
    } as never,
    caseId: created.caseId,
    lawyerId: 'lawyer-42',
    now: '2026-04-25T13:05:00.000Z',
  })

  assert.equal(assigned.status, 'assigned')
  if (assigned.status !== 'assigned') {
    return
  }

  assert.equal(assigned.legalCase.status, 'assigned')
  assert.equal(assigned.legalCase.assignedLawyerId, 'lawyer-42')
  assert.equal(assigned.legalCase.timeline.at(-1)?.type, 'status_changed')

  const secondAttempt = await assignLegalCase({
    repository: {
      async listEntities() {
        return [{
          id: entityProfile.id,
          entityProfile: persistedProfile,
        }]
      },
      async updateEntity() {
        return null
      },
    } as never,
    caseId: created.caseId,
    lawyerId: 'lawyer-99',
  })

  assert.equal(secondAttempt.status, 'invalid_state')
})

test('buildLawyerReputationMetrics aggregates assigned, closed, rated, revenue and first response time', () => {
  const metrics = buildLawyerReputationMetrics([
    {
      id: 'case-1',
      entityId: 'entity-1',
      status: 'closed',
      createdAt: '2026-04-25T10:00:00.000Z',
      updatedAt: '2026-04-25T11:00:00.000Z',
      assignedLawyerId: 'lawyer-42',
      description: 'Primeiro caso',
      source: 'public-interaction',
      messages: [
        {
          id: 'm-1',
          role: 'user',
          text: 'Mensagem inicial',
          createdAt: '2026-04-25T10:00:00.000Z',
        },
        {
          id: 'm-2',
          role: 'system',
          text: 'Sistema',
          createdAt: '2026-04-25T10:00:00.000Z',
        },
        {
          id: 'm-3',
          role: 'lawyer',
          text: 'Primeira resposta',
          createdAt: '2026-04-25T10:30:00.000Z',
        },
      ],
      timeline: [],
      outcome: {
        rating: 4,
        closedBy: 'lawyer-42',
        closedAt: '2026-04-25T11:00:00.000Z',
      },
      monetization: {
        amountCents: 2_000,
        currency: 'BRL',
        status: 'paid',
        paymentMode: 'mock-fixed-fee',
        initiatedAt: '2026-04-25T10:05:00.000Z',
        paidAt: '2026-04-25T10:05:00.000Z',
      },
    },
    {
      id: 'case-2',
      entityId: 'entity-1',
      status: 'assigned',
      createdAt: '2026-04-25T12:00:00.000Z',
      updatedAt: '2026-04-25T12:40:00.000Z',
      assignedLawyerId: 'lawyer-42',
      description: 'Segundo caso',
      source: 'public-interaction',
      messages: [
        {
          id: 'm-4',
          role: 'user',
          text: 'Outra mensagem inicial',
          createdAt: '2026-04-25T12:00:00.000Z',
        },
        {
          id: 'm-5',
          role: 'lawyer',
          text: 'Outra resposta',
          createdAt: '2026-04-25T12:10:00.000Z',
        },
      ],
      timeline: [],
      monetization: {
        amountCents: 2_000,
        currency: 'BRL',
        status: 'paid',
        paymentMode: 'mock-fixed-fee',
        initiatedAt: '2026-04-25T12:02:00.000Z',
        paidAt: '2026-04-25T12:02:00.000Z',
      },
    },
    {
      id: 'case-3',
      entityId: 'entity-1',
      status: 'closed',
      createdAt: '2026-04-25T13:00:00.000Z',
      updatedAt: '2026-04-25T14:00:00.000Z',
      assignedLawyerId: 'lawyer-99',
      description: 'Terceiro caso',
      source: 'public-interaction',
      messages: [],
      timeline: [],
      outcome: {
        rating: 5,
        closedBy: 'lawyer-99',
        closedAt: '2026-04-25T14:00:00.000Z',
      },
      monetization: {
        amountCents: 2_000,
        currency: 'BRL',
        status: 'paid',
        paymentMode: 'mock-fixed-fee',
        initiatedAt: '2026-04-25T13:05:00.000Z',
        paidAt: '2026-04-25T13:05:00.000Z',
      },
    },
  ], 'lawyer-42')

  assert.deepEqual(metrics, {
    lawyerId: 'lawyer-42',
    assignedCases: 2,
    closedCases: 1,
    averageRating: 4,
    ratingCount: 1,
    averageFirstResponseMinutes: 20,
    mockRevenueCents: 4_000,
    closureRate: 0.5,
  })
})

test('buildLawyerReputationMetrics returns null averages and zero rates when no assigned cases or replies exist', async () => {
  const entityProfile = createLegalEntity()
  let persistedProfile = entityProfile

  const created = await executePublicInteractionAction({
    entityId: entityProfile.id,
    entityProfile,
    repository: {
      async updateEntity(input: { entityProfile: EntityProfile }) {
        persistedProfile = input.entityProfile
        return null
      },
    } as never,
    decision: {
      intent: 'legal_case',
      confidence: 0.94,
      slots: {
        description: 'Preciso de ajuda com uma cobranca contratual.',
      },
      missingFields: ['cidade', 'contato'],
    },
    initialUserMessage: 'Preciso de ajuda com uma cobranca contratual.',
    now: '2026-04-25T15:00:00.000Z',
  })
  if (created.status !== 'created') {
    throw new Error('Expected legal case to be created.')
  }

  await assignLegalCase({
    repository: {
      async listEntities() {
        return [{ id: entityProfile.id, entityProfile: persistedProfile }]
      },
      async updateEntity(input: { entityProfile: EntityProfile }) {
        persistedProfile = input.entityProfile
        return null
      },
    } as never,
    caseId: created.caseId,
    lawyerId: 'lawyer-42',
    now: '2026-04-25T15:05:00.000Z',
  })

  await closeLegalCase({
    repository: {
      async listEntities() {
        return [{ id: entityProfile.id, entityProfile: persistedProfile }]
      },
      async updateEntity(input: { entityProfile: EntityProfile }) {
        persistedProfile = input.entityProfile
        return null
      },
    } as never,
    caseId: created.caseId,
    rating: 5,
    closedBy: 'Smoke Test',
    now: '2026-04-25T15:10:00.000Z',
  })

  const metricsWithoutReply = buildLawyerReputationMetrics(listLegalCases(persistedProfile), 'lawyer-42')
  const metricsWithoutAssignments = buildLawyerReputationMetrics(listLegalCases(persistedProfile), 'lawyer-404')

  assert.equal(metricsWithoutReply.averageFirstResponseMinutes, null)
  assert.equal(metricsWithoutReply.averageRating, 5)
  assert.equal(metricsWithoutAssignments.assignedCases, 0)
  assert.equal(metricsWithoutAssignments.closedCases, 0)
  assert.equal(metricsWithoutAssignments.averageRating, null)
  assert.equal(metricsWithoutAssignments.ratingCount, 0)
  assert.equal(metricsWithoutAssignments.averageFirstResponseMinutes, null)
  assert.equal(metricsWithoutAssignments.mockRevenueCents, 0)
  assert.equal(metricsWithoutAssignments.closureRate, 0)
})
