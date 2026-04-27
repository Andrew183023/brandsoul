import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultEntityCognitiveMemory } from '../memory/entityCognitiveMemory.js'
import { InMemoryEntityCognitiveMemoryStore } from '../memory/inMemoryEntityCognitiveMemoryStore.js'
import { resolveFlowMindDecision } from './resolveFlowMindDecision.js'

test('resolveFlowMindDecision preserves adaptive semantics and persists updated memory', async () => {
  const memoryStore = new InMemoryEntityCognitiveMemoryStore()
  const initialMemory = createDefaultEntityCognitiveMemory()

  const result = await resolveFlowMindDecision({
    entityId: 'entity-1',
    input: 'quero comprar agora',
    context: {
      channel: 'public-page',
    },
    memory: initialMemory,
    objective: {
      type: 'convert',
      priority: 0.9,
    },
    interaction: {
      outcome: {
        interactionSuccess: 0.8,
        userContinuation: true,
        engagementDelta: 0.2,
      },
    },
  }, {
    memoryStore,
    adapter: {
      name: 'test-adapter',
      resolveBaseDecision() {
        return {
          intent: 'general',
          action: 'guide',
          confidence: 0.52,
          responsePlan: {
            kind: 'general',
            topic: 'produto',
            intentGoal: 'continue-contextual-guidance',
            requiredData: [],
            constraints: [],
            optionalCloseStyle: 'contextual-clarity',
          },
        }
      },
      resolveAdaptiveCore({ baseDecision }) {
        return {
          decision: {
            ...baseDecision,
            intent: 'promotion',
            action: 'sell',
            confidence: 0.76,
            responsePlan: {
              ...baseDecision.responsePlan,
              kind: 'promotion',
              intentGoal: 'highlight-active-promotion',
              optionalCloseStyle: 'explore-promotion',
            },
          },
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          fallbackConditions: [],
          semanticFrozen: true,
        }
      },
      applyPolicy({ decision }) {
        return {
          ...decision,
          intent: 'policy-rewrite-should-not-win',
          action: 'support',
        }
      },
      applyCognitiveState({ decision, memory }) {
        return {
          decision: {
            ...decision,
            confidence: 0.8,
          },
          nextCognitiveState: {
            ...memory.cognitiveState,
            adaptationMomentum: 0.48,
          },
        }
      },
      applyStrategy({ decision, memory }) {
        return {
          decision: {
            ...decision,
            action: 'guide',
          },
          updatedStrategyProfile: {
            ...memory.strategyProfile,
            dominantStrategy: 'conversion-pressure',
          },
        }
      },
    },
  })

  assert.equal(result.decision.intent, 'promotion')
  assert.equal(result.decision.action, 'sell')
  assert.equal(result.decisionSource, 'adaptive-core')
  assert.equal(result.terminalAuthority, 'adaptive-core')
  assert.equal(result.semanticFrozen, true)
  assert.equal(result.updatedProfiles.strategyProfile.dominantStrategy, 'conversion-pressure')
  assert.equal(result.updatedMemory.historicalSignals.totalInteractions, 1)
  assert.equal((await memoryStore.get('entity-1'))?.historicalSignals.totalInteractions, 1)
  assert.equal(result.decision.metadata?.objectiveAlignment, 'aligned')
})