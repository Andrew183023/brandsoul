import assert from 'node:assert/strict'
import test from 'node:test'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import {
  appendPublicFlowMindShadowSnapshot,
  buildPublicFlowMindShadowSnapshot,
  evaluatePublicFlowMindShadow,
  listPublicFlowMindShadowSnapshots,
} from './publicFlowMindShadowService.js'

test('evaluatePublicFlowMindShadow summarizes backend decision for public interaction shadow', async () => {
  const entity = createTestEntity()

  const result = await evaluatePublicFlowMindShadow({
    entityProfile: entity,
    requestId: 'shadow-1',
    userMessage: 'Quero entender melhor essa presença pública',
    now: '2026-04-20T10:00:00.000Z',
    flowMindService: {
      mode: 'shadow',
      async evaluateOrchestratorCommand() {
        return {
          mode: 'shadow',
          summary: {
            mode: 'shadow',
            adapterName: 'shadow-test-adapter',
            adapterLoadStatus: 'loaded',
            invokedAt: '2026-04-20T10:00:00.000Z',
            decisionSource: 'adaptive-core',
            terminalAuthority: 'adaptive-core',
            semanticFrozen: true,
            lowRiskLaneUsed: false,
            fallbackConditions: [],
            fallbackUsed: false,
            decision: {
              intent: 'assist',
              action: 'support',
              confidence: 0.77,
            },
            objectiveType: 'engage',
          },
          output: {
            decision: {
              intent: 'assist',
              action: 'support',
              confidence: 0.77,
              decisionHash: '',
              responsePlan: {
                kind: 'support',
                topic: 'presenca publica',
                requiredData: ['clareza de contexto'],
                optionalCloseStyle: 'contextual-clarity',
              },
              actionPayload: {},
              memoryReadSet: [],
              memoryWritePlan: [],
              expectedStateChanges: [],
            },
            decisionSource: 'adaptive-core',
            terminalAuthority: 'adaptive-core',
            semanticFrozen: true,
            lowRiskLaneUsed: false,
            fallbackConditions: [],
            updatedMemory: {} as never,
            updatedProfiles: {} as never,
          },
        }
      },
    },
  })

  assert.ok(result)
  assert.equal(result.requestId, 'shadow-1')
  assert.equal(result.intent, 'assist')
  assert.equal(result.action, 'support')
  assert.equal(result.confidence, 0.77)
  assert.equal(result.authority.terminalAuthority, 'adaptive-core')
  assert.equal(result.authority.semanticFrozen, true)
  assert.equal(result.fallbackUsed, false)
  assert.match(result.responseText, /presenca publica/i)
})

test('buildPublicFlowMindShadowSnapshot calculates divergence and fallback history', () => {
  const entity = createTestEntity()
  const firstSnapshot = buildPublicFlowMindShadowSnapshot({
    entityProfile: entity,
    requestId: 'shadow-1',
    frontendDecision: {
      evaluatedAt: '2026-04-20T10:00:00.000Z',
      intent: 'assist',
      action: 'support',
      responseText: 'Aurora responde com contencao e clareza sobre presenca publica.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      latencyMs: 12,
    },
    backendDecision: {
      requestId: 'shadow-1',
      evaluatedAt: '2026-04-20T10:00:00.000Z',
      intent: 'assist',
      action: 'support',
      confidence: 0.77,
      responseText: 'Aurora responde com contencao e clareza sobre presenca publica.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      fallbackUsed: true,
      fallbackReason: 'shadow-fallback',
      latencyMs: 18,
    },
  })
  const updatedEntity = appendPublicFlowMindShadowSnapshot(entity, firstSnapshot)
  const secondSnapshot = buildPublicFlowMindShadowSnapshot({
    entityProfile: updatedEntity,
    requestId: 'shadow-2',
    frontendDecision: {
      evaluatedAt: '2026-04-20T10:01:00.000Z',
      intent: 'engage',
      action: 'guide',
      responseText: 'Aurora reorganiza a presenca para orientar a proxima leitura.',
      authority: {
        decisionSource: 'heuristic-base',
        terminalAuthority: 'heuristic-fallback',
        semanticFrozen: false,
      },
      latencyMs: 10,
    },
    backendDecision: {
      requestId: 'shadow-2',
      evaluatedAt: '2026-04-20T10:01:00.000Z',
      intent: 'amplify_social',
      action: 'sell',
      confidence: 0.84,
      responseText: 'Aurora intensifica a presenca para conversao em torno de export.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      fallbackUsed: false,
      latencyMs: 22,
    },
  })

  assert.equal(firstSnapshot.metrics.fallbackRate, 1)
  assert.equal(secondSnapshot.metrics.sampleSize, 2)
  assert.equal(secondSnapshot.metrics.fallbackRate, 0.5)
  assert.ok(secondSnapshot.comparison.divergenceScore > 0.5)
  assert.deepEqual(listPublicFlowMindShadowSnapshots(updatedEntity).map((snapshot) => snapshot.requestId), ['shadow-1'])
  assert.ok(secondSnapshot.comparison.semanticInconsistencies.includes('intent-mismatch'))
  assert.ok(secondSnapshot.comparison.semanticInconsistencies.includes('response-text-drift'))
})
