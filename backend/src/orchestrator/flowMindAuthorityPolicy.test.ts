import assert from 'node:assert/strict'
import test from 'node:test'

import { createContext, createIntent, createTestEntity } from '../brain/flowmind/testUtils.js'
import type { EntityAction } from '../brain/domain/entity/contracts/EntityAction.js'
import type { FlowMindDecisionOutput } from '../brain/domain/entity/contracts/FlowMindState.js'
import type { FlowMindDecisionComparison, FlowMindServiceResult } from '../services/flowMindPort.js'
import { serializeFlowMindServiceSnapshot } from './flowMindComparison.js'
import { evaluateFlowMindPartialAuthorityPolicy } from './flowMindAuthorityPolicy.js'
import { createOrchestratorCommand } from './orchestratorCore.js'

function buildLegacyDecision(now: string): FlowMindDecisionOutput {
  const action: EntityAction = {
    schemaVersion: 1,
    entityId: 'entity-test',
    type: 'triggerExport',
    payload: {
      message: 'Export legado',
    },
    priority: 'medium',
    confidence: 0.74,
    source: {
      intent: 'convert',
      userIntent: 'export',
      journeyMoment: 'export',
    },
    createdAt: now,
  }

  return {
    state: {
      schemaVersion: 1,
      entityId: 'entity-test',
      awarenessLevel: 0.6,
      contextConfidence: 0.7,
      decisionConfidence: 0.74,
      activeIntent: 'encourage_export',
      state: 'acting',
      lastDecisionAt: now,
    },
    context: createContext({
      entityId: 'entity-test',
      userIntent: 'export',
      journeyMoment: 'export',
      interactionType: 'export',
      observedAt: now,
    }),
    entityIntent: createIntent({
      entityId: 'entity-test',
      type: 'convert',
      confidence: 0.74,
      createdAt: now,
      context: {
        userIntent: 'export',
        journeyMoment: 'export',
        urgencyLevel: 'low',
        interactionType: 'export',
      },
    }),
    entityAction: action,
    intent: 'encourage_export',
    confidence: 0.74,
    reason: 'Teste de policy',
    trace: {
      contextSnapshot: createContext({
        entityId: 'entity-test',
        userIntent: 'export',
        journeyMoment: 'export',
        interactionType: 'export',
        observedAt: now,
      }),
      resolvedIntent: createIntent({
        entityId: 'entity-test',
        type: 'convert',
        confidence: 0.74,
        createdAt: now,
        context: {
          userIntent: 'export',
          journeyMoment: 'export',
          urgencyLevel: 'low',
          interactionType: 'export',
        },
      }),
      chosenAction: action,
      guardrailResult: {
        action,
        allowed: true,
      },
      confidence: 0.74,
      reason: 'Teste de policy',
      createdAt: now,
    },
  }
}

function buildSovereignFlowMindResult(now: string, overrides?: {
  intent?: string
  action?: string
  confidence?: number
  objectiveType?: string
}): FlowMindServiceResult {
  return {
    mode: 'active',
    summary: {
      mode: 'active',
      adapterName: 'shadow-test-adapter',
      adapterLoadStatus: 'loaded',
      invokedAt: now,
      decisionSource: 'adaptive-core',
      terminalAuthority: 'adaptive-core',
      semanticFrozen: true,
      lowRiskLaneUsed: false,
      fallbackConditions: [],
      fallbackUsed: false,
      decision: {
        intent: overrides?.intent ?? 'encourage_export',
        action: overrides?.action ?? 'sell',
        confidence: overrides?.confidence ?? 0.76,
      },
      objectiveType: overrides?.objectiveType ?? 'convert',
    },
    output: {
      decision: {
        intent: overrides?.intent ?? 'encourage_export',
        action: overrides?.action ?? 'sell',
        confidence: overrides?.confidence ?? 0.76,
        decisionHash: '',
        responsePlan: {
          kind: overrides?.action === 'guide' ? 'general' : 'promotion',
          topic: 'export controlado',
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
      updatedMemory: {} as FlowMindServiceResult['output']['updatedMemory'],
      updatedProfiles: {} as FlowMindServiceResult['output']['updatedProfiles'],
    },
  }
}

function buildComparison(args: {
  now: string
  divergenceScore: number
  stabilityScore?: number
  intentChanged: boolean
  actionChanged: boolean
}): FlowMindDecisionComparison {
  return {
    legacyDecision: {
      commandId: 'cmd-test',
      commandName: 'trigger_export',
      evaluatedAt: args.now,
      authority: 'orchestrator-legacy',
      intent: args.intentChanged ? 'convert' : 'encourage_export',
      action: args.actionChanged ? 'sendMessage' : 'triggerExport',
      confidence: 0.74,
    },
    flowMindDecision: {
      commandId: 'cmd-test',
      commandName: 'trigger_export',
      evaluatedAt: args.now,
      intent: 'encourage_export',
      action: 'sell',
      confidence: 0.76,
      decisionSource: 'adaptive-core',
      terminalAuthority: 'adaptive-core',
      semanticFrozen: true,
      lowRiskLaneUsed: false,
      fallbackUsed: false,
    },
    divergenceType: args.intentChanged || args.actionChanged ? 'semantic-and-authority-drift' : 'aligned',
    semanticDifference: {
      intentChanged: args.intentChanged,
      actionChanged: args.actionChanged,
      confidenceDelta: 0.16,
      summary: 'Teste de comparação.',
    },
    authorityDifference: {
      authorityChanged: true,
      legacyAuthority: 'orchestrator-legacy',
      flowMindDecisionSource: 'adaptive-core',
      flowMindTerminalAuthority: 'adaptive-core',
      semanticFrozen: true,
      summary: 'Adaptive core assumiu a decisão e congelou a semântica terminal.',
    },
    metrics: {
      divergenceScore: args.divergenceScore,
      stabilityScore: args.stabilityScore ?? 0.82,
      fallbackRate: 0,
      adaptiveSuccessRate: 0.8,
      sampleSize: 5,
    },
  }
}

test('evaluateFlowMindPartialAuthorityPolicy allows marginal divergence when semantics stay aligned in safe zone', () => {
  const now = '2026-04-19T21:00:00.000Z'
  const entity = createTestEntity()
  entity.metadata.notes = Array.from({ length: 4 }, (_, index) => serializeFlowMindServiceSnapshot({
    summary: buildSovereignFlowMindResult(now).summary,
    comparison: buildComparison({
      now: `2026-04-19T20:5${index}:00.000Z`,
      divergenceScore: 0.11,
      intentChanged: false,
      actionChanged: false,
    }),
    authority: {
      authorityEligible: true,
      authorityGranted: false,
      authorityZone: 'safe',
      authorityCommand: 'trigger_export',
      autonomyLevel: 'supervised',
      promotionEligible: true,
      rollbackTriggered: false,
      autonomyMetrics: {
        averageErrorRate: 0.08,
        decisionStability: 1,
        averageDivergenceScore: 0.11,
        sampleSize: 4,
      },
    },
  }))

  const result = evaluateFlowMindPartialAuthorityPolicy({
    entityProfile: entity,
    legacyDecision: buildLegacyDecision(now),
    sovereignFlowMind: buildSovereignFlowMindResult(now),
    comparison: buildComparison({
      now,
      divergenceScore: 0.27,
      intentChanged: false,
      actionChanged: false,
    }),
    command: createOrchestratorCommand({
      type: 'command',
      name: 'trigger_export',
      issuedAt: now,
      source: 'user',
      payload: {
        exportFormat: 'post',
      },
    }),
    now,
  })

  assert.equal(result.applied, true)
  assert.equal(result.reason, 'eligible-for-partial-authority')
  assert.equal(result.autonomyLevel, 'partial')
  assert.equal(result.promotionEligible, true)
  assert.equal(result.rollbackTrigger.active, false)
})

test('evaluateFlowMindPartialAuthorityPolicy still denies semantic drift under divergence-too-high', () => {
  const now = '2026-04-19T21:10:00.000Z'
  const result = evaluateFlowMindPartialAuthorityPolicy({
    entityProfile: createTestEntity(),
    legacyDecision: buildLegacyDecision(now),
    sovereignFlowMind: buildSovereignFlowMindResult(now),
    comparison: buildComparison({
      now,
      divergenceScore: 0.27,
      intentChanged: true,
      actionChanged: false,
    }),
    command: createOrchestratorCommand({
      type: 'command',
      name: 'trigger_export',
      issuedAt: now,
      source: 'user',
      payload: {
        exportFormat: 'post',
      },
    }),
    now,
  })

  assert.equal(result.applied, false)
  assert.equal(result.reason, 'divergence-too-high')
  assert.equal(result.autonomyLevel, 'manual')
})

test('evaluateFlowMindPartialAuthorityPolicy maps safe guide action to sendMessage execution', () => {
  const now = '2026-04-19T21:30:00.000Z'
  const legacyDecision = buildLegacyDecision(now)
  const result = evaluateFlowMindPartialAuthorityPolicy({
    entityProfile: createTestEntity(),
    legacyDecision: {
      ...legacyDecision,
      entityAction: {
        ...legacyDecision.entityAction,
        type: 'sendMessage',
        payload: {
          message: 'Retomar com continuidade contextual.',
        },
        source: {
          ...legacyDecision.entityAction.source,
          intent: 'engage',
          journeyMoment: 'birth',
        },
      },
      entityIntent: {
        ...legacyDecision.entityIntent,
        type: 'engage',
        context: {
          ...legacyDecision.entityIntent.context,
          journeyMoment: 'birth',
        },
      },
    },
    sovereignFlowMind: buildSovereignFlowMindResult(now, {
      intent: 'support',
      action: 'guide',
      confidence: 0.63,
      objectiveType: 'assist',
    }),
    comparison: {
      ...buildComparison({
        now,
        divergenceScore: 0.12,
        intentChanged: false,
        actionChanged: false,
      }),
      legacyDecision: {
        commandId: 'cmd-test',
        commandName: 'resume_birth',
        evaluatedAt: now,
        authority: 'orchestrator-legacy',
        intent: 'support',
        action: 'sendMessage',
        confidence: 0.63,
      },
      flowMindDecision: {
        commandId: 'cmd-test',
        commandName: 'resume_birth',
        evaluatedAt: now,
        intent: 'support',
        action: 'guide',
        confidence: 0.63,
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
        fallbackUsed: false,
      },
      divergenceType: 'authority-shift',
      semanticDifference: {
        intentChanged: false,
        actionChanged: false,
        confidenceDelta: 0,
        summary: 'Legado e FlowMind ficaram semanticamente alinhados.',
      },
      metrics: {
        divergenceScore: 0.12,
        stabilityScore: 0.88,
        fallbackRate: 0,
        adaptiveSuccessRate: 0.8,
        sampleSize: 5,
      },
    },
    command: createOrchestratorCommand({
      type: 'command',
      name: 'resume_birth',
      issuedAt: now,
      source: 'user',
    }),
    now,
  })

  assert.equal(result.applied, true)
  assert.equal(result.action?.type, 'sendMessage')
  assert.equal(result.autonomyLevel, 'partial')
})

test('evaluateFlowMindPartialAuthorityPolicy still denies action drift under divergence-too-high', () => {
  const now = '2026-04-19T21:20:00.000Z'
  const result = evaluateFlowMindPartialAuthorityPolicy({
    entityProfile: createTestEntity(),
    legacyDecision: buildLegacyDecision(now),
    sovereignFlowMind: buildSovereignFlowMindResult(now),
    comparison: buildComparison({
      now,
      divergenceScore: 0.27,
      intentChanged: false,
      actionChanged: true,
    }),
    command: createOrchestratorCommand({
      type: 'command',
      name: 'trigger_export',
      issuedAt: now,
      source: 'user',
      payload: {
        exportFormat: 'post',
      },
    }),
    now,
  })

  assert.equal(result.applied, false)
  assert.equal(result.reason, 'divergence-too-high')
})

test('evaluateFlowMindPartialAuthorityPolicy denies promotion when recent error rate is too high', () => {
  const now = '2026-04-19T21:40:00.000Z'
  const entity = createTestEntity()
  entity.metadata.notes = Array.from({ length: 4 }, (_, index) => serializeFlowMindServiceSnapshot({
    summary: buildSovereignFlowMindResult(now).summary,
    comparison: {
      ...buildComparison({
        now: `2026-04-19T21:3${index}:00.000Z`,
        divergenceScore: 0.12,
        intentChanged: false,
        actionChanged: false,
      }),
      metrics: {
        divergenceScore: 0.12,
        stabilityScore: 0.9,
        fallbackRate: 0,
        adaptiveSuccessRate: 0.4,
        sampleSize: 5,
      },
    },
    authority: {
      authorityEligible: true,
      authorityGranted: false,
      authorityZone: 'safe',
      authorityCommand: 'trigger_export',
    },
  }))

  const result = evaluateFlowMindPartialAuthorityPolicy({
    entityProfile: entity,
    legacyDecision: buildLegacyDecision(now),
    sovereignFlowMind: buildSovereignFlowMindResult(now),
    comparison: buildComparison({
      now,
      divergenceScore: 0.12,
      intentChanged: false,
      actionChanged: false,
    }),
    command: createOrchestratorCommand({
      type: 'command',
      name: 'trigger_export',
      issuedAt: now,
      source: 'user',
      payload: {
        exportFormat: 'post',
      },
    }),
    now,
  })

  assert.equal(result.applied, false)
  assert.equal(result.reason, 'error-rate-too-high')
  assert.equal(result.autonomyLevel, 'manual')
  assert.ok(result.autonomyMetrics.averageErrorRate > result.thresholds.maxErrorRate)
})

test('evaluateFlowMindPartialAuthorityPolicy triggers rollback when recent granted autonomy becomes unstable', () => {
  const now = '2026-04-19T21:50:00.000Z'
  const entity = createTestEntity()
  entity.metadata.notes = Array.from({ length: 4 }, (_, index) => serializeFlowMindServiceSnapshot({
    summary: buildSovereignFlowMindResult(now).summary,
    comparison: buildComparison({
      now: `2026-04-19T21:4${index}:00.000Z`,
      divergenceScore: 0.1,
      intentChanged: false,
      actionChanged: false,
    }),
    authority: {
      authorityEligible: true,
      authorityGranted: true,
      authorityZone: 'safe',
      authorityCommand: 'trigger_export',
      autonomyLevel: 'partial',
      promotionEligible: true,
      rollbackTriggered: false,
      autonomyMetrics: {
        averageErrorRate: 0.05,
        decisionStability: 1,
        averageDivergenceScore: 0.1,
        sampleSize: 4,
      },
    },
  }))

  const result = evaluateFlowMindPartialAuthorityPolicy({
    entityProfile: entity,
    legacyDecision: buildLegacyDecision(now),
    sovereignFlowMind: buildSovereignFlowMindResult(now),
    comparison: buildComparison({
      now,
      divergenceScore: 0.34,
      intentChanged: true,
      actionChanged: true,
    }),
    command: createOrchestratorCommand({
      type: 'command',
      name: 'trigger_export',
      issuedAt: now,
      source: 'user',
      payload: {
        exportFormat: 'post',
      },
    }),
    now,
  })

  assert.equal(result.applied, false)
  assert.equal(result.rollbackTrigger.active, true)
  assert.equal(result.rollbackTrigger.reason, 'rollback-divergence-too-high')
  assert.equal(result.reason, 'rollback-divergence-too-high')
  assert.equal(result.autonomyLevel, 'manual')
})
