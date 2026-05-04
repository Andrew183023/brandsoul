import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultEntityCognitiveMemory } from '../memory/entityCognitiveMemory.js'
import { InMemoryEntityCognitiveMemoryStore } from '../memory/inMemoryEntityCognitiveMemoryStore.js'
import { runWithMutationAuthority } from '../../sovereignty/authorityBoundary.js'
import type { FlowMindInput } from '../types/flowMindContracts.js'
import { resolveFlowMindDecision } from './resolveFlowMindDecision.js'

test('resolveFlowMindDecision preserves adaptive semantics and returns a pure memory write plan', async () => {
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
  assert.equal((await memoryStore.get('entity-1'))?.historicalSignals.totalInteractions, undefined)
  assert.equal(result.decision.memoryWritePlan.length, 1)
  assert.equal(result.decision.expectedStateChanges.length, 1)
  assert.equal(result.decision.memoryReadSet.length, 1)
  assert.equal(typeof result.decision.decisionHash, 'string')
  assert.equal(result.decision.metadata?.objectiveAlignment, 'aligned')
})

test('resolveFlowMindDecision returns the same decision for the same semantic input twice', async () => {
  function buildInput(order: 'alpha' | 'reverse') {
    const nestedContext = order === 'alpha'
      ? {
          alpha: 'first',
          engagementScore: undefined,
          zeta: 'last',
        }
      : {
          zeta: 'last',
          engagementScore: undefined,
          alpha: 'first',
        }

    return {
      entityId: 'entity-deterministic',
      input: 'preciso de orientacao contextual',
      context: {
        route: 'public',
        nested: nestedContext,
      },
      objective: {
        type: 'engage' as const,
        priority: 0.6,
        constraints: ['stable-order'],
      },
      interaction: {
        outcome: {
          result: 'continued',
          engagementScore: undefined,
          details: order === 'alpha'
            ? { alpha: 1, beta: 2 }
            : { beta: 2, alpha: 1 },
        },
      },
    }
  }

  const adapter = {
    name: 'determinism-adapter',
    resolveBaseDecision(input: FlowMindInput) {
      const nested = input.context.nested as Record<string, unknown>

      return {
        intent: 'general',
        action: 'guide',
        confidence: 0.64,
        responsePlan: {
          kind: 'general',
          topic: Object.keys(nested).join(','),
          intentGoal: 'stay-deterministic',
          requiredData: ['contact', 'city'],
          constraints: ['stable-order', 'same-input'],
          optionalCloseStyle: 'clear',
        },
        metadata: {
          nestedKeys: Object.keys(nested),
          normalizedEngagementScore: nested.engagementScore,
        },
      }
    },
  }

  const first = await resolveFlowMindDecision(buildInput('alpha'), {
    adapter,
  })
  const second = await resolveFlowMindDecision(buildInput('reverse'), {
    adapter,
  })

  assert.deepEqual(first, second)
  assert.equal(first.decision.metadata?.normalizedEngagementScore, 0)
})

test('resolveFlowMindDecision retrieves decay-weighted episodic memory and injects it into decision input', async () => {
  const memoryStore = new InMemoryEntityCognitiveMemoryStore()

  await runWithMutationAuthority({
    source: 'backend/src/flowmind/decision/resolveFlowMindDecision.test.ts#seedMemory',
    viaExecutor: true,
  }, async () => {
    await memoryStore.set('entity-memory', createDefaultEntityCognitiveMemory())
    await memoryStore.set('entity-memory', {
      ...createDefaultEntityCognitiveMemory(),
      episodicMemory: {
        entries: [
          {
            id: 'episode-old',
            summary: 'export strategy for legal catalog launch',
            tags: ['export', 'catalog', 'launch'],
            relevanceScore: 0.95,
            recordedAt: '2026-03-01T10:00:00.000Z',
            context: {
              channel: 'public-page',
            },
          },
          {
            id: 'episode-new',
            summary: 'recent export preparation for legal catalog conversion',
            tags: ['export', 'catalog', 'conversion'],
            relevanceScore: 0.78,
            recordedAt: '2026-04-18T10:00:00.000Z',
            context: {
              channel: 'public-page',
            },
          },
        ],
      },
    })
  })

  const result = await resolveFlowMindDecision({
    entityId: 'entity-memory',
    input: 'preciso preparar export para catalogo legal',
    requestedAt: '2026-04-20T10:00:00.000Z',
    context: {
      channel: 'public-page',
    },
    objective: {
      type: 'convert',
      priority: 0.7,
    },
    memory: await memoryStore.get('entity-memory'),
  }, {
    adapter: {
      name: 'episodic-memory-adapter',
      resolveBaseDecision(input) {
        const retrieved = input.episodicMemory?.retrieved ?? []
        const topEpisode = retrieved[0]

        return {
          intent: 'memory-led',
          action: topEpisode?.id === 'episode-new' ? 'prioritize-recent' : 'prioritize-old',
          confidence: 0.71,
          responsePlan: {
            kind: 'general',
            topic: topEpisode?.summary ?? 'missing-memory',
            intentGoal: 'use-relevant-memory',
            requiredData: [],
            constraints: [],
          },
          metadata: {
            topEpisodeId: topEpisode?.id,
            queryTerms: input.episodicMemory?.queryTerms,
          },
        }
      },
    },
  })

  assert.equal(result.decision.action, 'prioritize-recent')
  assert.equal((result.decision.memoryInfluence as { episodicMemory: { retrieved: Array<{ id: string }> } }).episodicMemory.retrieved[0]?.id, 'episode-new')
  assert.ok(((result.decision.memoryInfluence as { episodicMemory: { retrieved: Array<{ id: string, ageDecayWeight: number, retrievalWeight: number }> } }).episodicMemory.retrieved[0]?.ageDecayWeight ?? 0) > 0.9)
  assert.ok(((result.decision.memoryInfluence as { episodicMemory: { retrieved: Array<{ id: string, ageDecayWeight: number, retrievalWeight: number }> } }).episodicMemory.retrieved[1]?.ageDecayWeight ?? 1) < 0.2)
  assert.equal(result.updatedMemory.episodicMemory.entries[0]?.recordedAt, '2026-04-20T10:00:00.000Z')
  assert.equal((await memoryStore.get('entity-memory'))?.episodicMemory.entries.length, 2)
})
