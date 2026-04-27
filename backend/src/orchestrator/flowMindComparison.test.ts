import assert from 'node:assert/strict'
import test from 'node:test'

import { createContext, createIntent } from '../brain/flowmind/testUtils.js'
import type { EntityAction } from '../brain/domain/entity/contracts/EntityAction.js'
import { buildFlowMindDecisionComparison } from './flowMindComparison.js'
import type { FlowMindDecisionEnvelope } from './flowMindContracts.js'
import { createOrchestratorCommand } from './orchestratorCore.js'

function buildLegacyAction(args: { now: string; type: EntityAction['type'] }): EntityAction {
  return {
    schemaVersion: 1,
    entityId: 'entity-test',
    type: args.type,
    payload: args.type === 'askQuestion'
      ? { question: 'Qual sinal adicional deve ser reforcado?' }
      : { message: 'Retomar com continuidade contextual.' },
    priority: 'medium',
    confidence: 0.63,
    source: {
      intent: args.type === 'askQuestion' ? 'assist' : 'engage',
      userIntent: 'unknown',
      journeyMoment: 'birth',
    },
    createdAt: args.now,
  }
}

function buildLegacyEnvelope(args: {
  now: string
  action: EntityAction
  intent: FlowMindDecisionEnvelope['decision']['intent']
  confidence: number
}): FlowMindDecisionEnvelope {
  return {
    decision: {
      intent: args.intent,
      confidence: args.confidence,
      reason: 'legacy-test',
    },
    trace: {
      contextSnapshot: createContext({
        entityId: 'entity-test',
        userIntent: 'unknown',
        journeyMoment: 'birth',
        interactionType: 'message',
        observedAt: args.now,
      }),
      resolvedIntent: createIntent({
        entityId: 'entity-test',
        type: 'engage',
        confidence: args.confidence,
        createdAt: args.now,
        context: {
          userIntent: 'unknown',
          journeyMoment: 'birth',
          urgencyLevel: 'low',
          interactionType: 'message',
        },
      }),
      chosenAction: args.action,
      guardrailResult: {
        action: args.action,
        allowed: true,
      },
      confidence: args.confidence,
      reason: 'legacy-test',
      createdAt: args.now,
    },
    lineage: {
      rootCommandId: 'cmd-safe',
      reentryBlocked: true,
      entityAction: {
        type: args.action.type,
        priority: args.action.priority,
        confidence: args.action.confidence,
        createdAt: args.action.createdAt,
        source: args.action.source,
      },
      followUps: [],
    },
    outcome: {
      decisionConfidence: args.confidence,
      impact: {
        xpGranted: 0,
        bindingEvent: 'no_interaction',
        engagementScore: 0,
        success: false,
      },
    },
  }
}

test('buildFlowMindDecisionComparison aligns safe guide action with legacy sendMessage execution', () => {
  const now = '2026-04-19T22:00:00.000Z'
  const comparison = buildFlowMindDecisionComparison({
    legacyDecision: buildLegacyEnvelope({
      now,
      action: buildLegacyAction({ now, type: 'sendMessage' }),
      intent: 'stabilize_presence',
      confidence: 0.63,
    }),
    summary: {
      mode: 'active',
      adapterName: 'shadow-test-adapter',
      adapterLoadStatus: 'loaded',
      invokedAt: now,
      decisionSource: 'adaptive-core',
      terminalAuthority: 'adaptive-core',
      semanticFrozen: true,
      fallbackConditions: [],
      fallbackUsed: false,
      decision: {
        intent: 'stabilize_presence',
        action: 'guide',
        confidence: 0.63,
      },
      objectiveType: 'assist',
    },
    command: createOrchestratorCommand({
      type: 'command',
      name: 'resume_birth',
      issuedAt: now,
      source: 'user',
    }),
    now,
  })

  assert.equal(comparison.semanticDifference.intentChanged, false)
  assert.equal(comparison.semanticDifference.actionChanged, false)
  assert.equal(comparison.divergenceType, 'authority-shift')
})

test('buildFlowMindDecisionComparison keeps real safe action drift when executable action still differs', () => {
  const now = '2026-04-19T22:05:00.000Z'
  const comparison = buildFlowMindDecisionComparison({
    legacyDecision: buildLegacyEnvelope({
      now,
      action: buildLegacyAction({ now, type: 'sendMessage' }),
      intent: 'stabilize_presence',
      confidence: 0.63,
    }),
    summary: {
      mode: 'active',
      adapterName: 'shadow-test-adapter',
      adapterLoadStatus: 'loaded',
      invokedAt: now,
      decisionSource: 'adaptive-core',
      terminalAuthority: 'adaptive-core',
      semanticFrozen: true,
      fallbackConditions: [],
      fallbackUsed: false,
      decision: {
        intent: 'stabilize_presence',
        action: 'support',
        confidence: 0.63,
      },
      objectiveType: 'assist',
    },
    command: createOrchestratorCommand({
      type: 'command',
      name: 'resume_birth',
      issuedAt: now,
      source: 'user',
    }),
    now,
  })

  assert.equal(comparison.semanticDifference.intentChanged, false)
  assert.equal(comparison.semanticDifference.actionChanged, true)
  assert.equal(comparison.divergenceType, 'semantic-and-authority-drift')
})