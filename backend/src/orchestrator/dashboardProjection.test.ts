import { PublicFlowMindPartialFallbackReason } from '../services/publicFlowMindPartialService.js';
import assert from 'node:assert/strict'
import test from 'node:test'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import { createRuntimeStatePayload, withAuthoritativeFrame } from './contracts.js'
import { buildDashboardSparkStateResponse, buildPublicFlowMindPartialPortfolio } from './dashboardProjection.js'
import { serializeFlowMindServiceSnapshot } from './flowMindComparison.js'
import { buildMinimalOrchestratorFrame, buildOrchestratorRuntimeControl, createInitialOrchestratorState } from './orchestratorState.js'
import { serializePublicFlowMindShadowSnapshot } from '../services/publicFlowMindShadowService.js'
import { serializePublicFlowMindPartialTelemetrySnapshot } from '../services/publicFlowMindPartialService.js'

function serializePreSafeMappingSnapshot(args: {
  summary: Parameters<typeof serializeFlowMindServiceSnapshot>[0]['summary']
  comparison?: Parameters<typeof serializeFlowMindServiceSnapshot>[0]['comparison']
  authority?: Parameters<typeof serializeFlowMindServiceSnapshot>[0]['authority']
}) {
  return `flowmind-service:${JSON.stringify({
    version: 3,
    summary: args.summary,
    comparison: args.comparison,
    authority: args.authority,
  })}`
}

function buildRuntime(entityId: string, now: string) {
  const state = createInitialOrchestratorState({
    entityId,
    now,
  })

  return {
    entityId,
    state: createRuntimeStatePayload(state, buildOrchestratorRuntimeControl(state)),
    frame: withAuthoritativeFrame(buildMinimalOrchestratorFrame(state, now)),
    session: {
      hydratedAt: now,
      source: 'initialized' as const,
      restoredFromEventLog: false,
      eventLogWindowSize: 0,
    },
    pendingUiEffects: [],
    pendingScheduledTasks: [],
  }
}

function buildPublicShadowSnapshot(args: {
  requestId: string
  comparedAt: string
  divergenceScore: number
  responseTextSimilarity: number
  frontendLatencyMs: number
  backendLatencyMs: number
  lowRiskLaneUsed?: boolean
  fallbackUsed?: boolean
  semanticInconsistencies?: string[]
  intentChanged?: boolean
  actionChanged?: boolean
  authorityChanged?: boolean
  responseTextChanged?: boolean
}) {
  return serializePublicFlowMindShadowSnapshot({
    version: 1,
    requestId: args.requestId,
    comparedAt: args.comparedAt,
    frontendDecision: {
      evaluatedAt: args.comparedAt,
      intent: args.intentChanged ? 'assist' : 'support',
      action: args.actionChanged ? 'guide' : 'support',
      responseText: args.responseTextChanged ? 'Aurora reorganiza a presenca para orientar a proxima leitura.' : 'Aurora responde com contencao e clareza sobre presenca publica.',
      authority: {
        decisionSource: args.authorityChanged ? 'heuristic-base' : 'adaptive-core',
        terminalAuthority: args.authorityChanged ? 'heuristic-fallback' : 'adaptive-core',
        semanticFrozen: !args.authorityChanged,
      },
      latencyMs: args.frontendLatencyMs,
    },
    backendDecision: {
      requestId: args.requestId,
      evaluatedAt: args.comparedAt,
      intent: 'support',
      action: 'support',
      confidence: 0.76,
      responseText: 'Aurora responde com contencao e clareza sobre presenca publica.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      lowRiskLaneUsed: args.lowRiskLaneUsed ?? false,
      fallbackUsed: args.fallbackUsed ?? false,
      latencyMs: args.backendLatencyMs,
    },
    comparison: {
      divergenceScore: args.divergenceScore,
      responseTextSimilarity: args.responseTextSimilarity,
      semanticInconsistencies: args.semanticInconsistencies ?? [],
      intentChanged: args.intentChanged ?? false,
      actionChanged: args.actionChanged ?? false,
      authorityChanged: args.authorityChanged ?? false,
      responseTextChanged: args.responseTextChanged ?? false,
    },
    metrics: {
      fallbackRate: args.fallbackUsed ? 1 : 0,
      sampleSize: 1,
      latencyMs: {
        frontend: args.frontendLatencyMs,
        backend: args.backendLatencyMs,
        delta: args.backendLatencyMs - args.frontendLatencyMs,
      },
    },
  })
}

function buildPublicPartialSnapshot(args: {
  requestId: string
  decidedAt: string
  engineUsed: 'frontend' | 'flowmind'
  fallbackOccurred?: boolean
  fallbackReason?: string
  chosenLatencyMs: number
  backendLatencyMs?: number
  divergenceScore?: number
  lowRiskLaneUsed?: boolean
  rolloutPercentage?: number
  killSwitchEnabled?: boolean
}) {
  return serializePublicFlowMindPartialTelemetrySnapshot({
    version: 1,
    requestId: args.requestId,
    decidedAt: args.decidedAt,
    rolloutBucket: 12,
    engineUsed: args.engineUsed,
    fallbackOccurred: args.fallbackOccurred ?? false,
    fallbackReason: args.fallbackReason as PublicFlowMindPartialFallbackReason,
    policy: {
      readinessState: 'ready',
      readinessScore: 98,
      rolloutPercentage: args.rolloutPercentage ?? 25,
      latencyBudgetMs: 700,
      criticalDivergenceThreshold: 0.31,
      killSwitchEnabled: args.killSwitchEnabled ?? false,
      enabled: (args.rolloutPercentage ?? 25) > 0 && (args.killSwitchEnabled ?? false) === false,
      activationReason: 'eligible-for-public-partial',
    },
    frontendDecision: {
      evaluatedAt: args.decidedAt,
      intent: 'assist',
      action: 'support',
      responseText: 'Aurora responde com contencao e clareza.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      latencyMs: 22,
    },
    backendDecision: args.backendLatencyMs
      ? {
        requestId: args.requestId,
        evaluatedAt: args.decidedAt,
        intent: args.divergenceScore && args.divergenceScore > 0.25 ? 'promote' : 'assist',
        action: args.divergenceScore && args.divergenceScore > 0.25 ? 'sell' : 'support',
        confidence: args.divergenceScore && args.divergenceScore > 0.25 ? 0.41 : 0.76,
        responseText: args.divergenceScore && args.divergenceScore > 0.25 ? 'Aurora intensifica a presenca para conversao.' : 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        lowRiskLaneUsed: args.lowRiskLaneUsed ?? false,
        fallbackUsed: false,
        latencyMs: args.backendLatencyMs,
      }
      : undefined,
    comparison: args.divergenceScore !== undefined
      ? {
        divergenceScore: args.divergenceScore,
        responseTextSimilarity: args.divergenceScore > 0.25 ? 0.68 : 0.9,
        intentChanged: args.divergenceScore > 0.25,
        actionChanged: args.divergenceScore > 0.25,
        authorityChanged: false,
        responseTextChanged: args.divergenceScore > 0.12,
        semanticInconsistencies: args.divergenceScore > 0.25 ? ['intent-mismatch', 'action-mismatch'] : ['response-text-drift'],
      }
      : undefined,
    metrics: {
      frontendLatencyMs: 22,
      backendLatencyMs: args.backendLatencyMs,
      chosenLatencyMs: args.chosenLatencyMs,
      divergenceScore: args.divergenceScore,
    },
  })
}

test('buildDashboardSparkStateResponse exposes FlowMind authority observability fields', () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      mode: 'active',
      updatedAt: '2026-04-19T19:00:00.000Z',
    },
  }
  entity.metadata.notes = [serializeFlowMindServiceSnapshot({
    summary: {
      mode: 'active',
      adapterName: 'shadow-test-adapter',
      adapterLoadStatus: 'loaded',
      invokedAt: '2026-04-19T19:01:00.000Z',
      decisionSource: 'adaptive-core',
      terminalAuthority: 'adaptive-core',
      semanticFrozen: true,
      fallbackConditions: [],
      fallbackUsed: false,
      decision: {
        intent: 'encourage_export',
        action: 'sell',
        confidence: 0.72,
      },
      objectiveType: 'convert',
    },
    comparison: {
      legacyDecision: {
        commandId: 'cmd-test',
        commandName: 'trigger_export',
        evaluatedAt: '2026-04-19T19:01:00.000Z',
        authority: 'orchestrator-legacy',
        intent: 'encourage_export',
        action: 'triggerExport',
        confidence: 0.56,
      },
      flowMindDecision: {
        commandId: 'cmd-test',
        commandName: 'trigger_export',
        evaluatedAt: '2026-04-19T19:01:00.000Z',
        intent: 'encourage_export',
        action: 'sell',
        confidence: 0.72,
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
        fallbackUsed: false,
      },
      divergenceType: 'aligned',
      semanticDifference: {
        intentChanged: false,
        actionChanged: false,
        confidenceDelta: 0.16,
        summary: 'Semântica alinhada com variação leve de confiança (0.16).',
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
        divergenceScore: 0.28,
        stabilityScore: 0.81,
        fallbackRate: 0,
        adaptiveSuccessRate: 0.8,
        sampleSize: 5,
      },
    },
    authority: {
      authorityEligible: true,
      authorityGranted: false,
      authorityDeniedReason: 'divergence-too-high',
      authorityZone: 'safe',
      authorityCommand: 'trigger_export',
    },
  })]

  const dashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-19T19:02:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })

  assert.equal(dashboard.sovereignFlowMind?.mode, 'active')
  assert.equal(dashboard.flowMindAuthority?.authorityEligible, true)
  assert.equal(dashboard.flowMindAuthority?.authorityGranted, false)
  assert.equal(dashboard.flowMindAuthority?.authorityDeniedReason, 'divergence-too-high')
  assert.equal(dashboard.flowMindAuthority?.authorityCommand, 'trigger_export')
  assert.equal(dashboard.flowMindAuthorityAggregation?.sampleSize, 1)
  assert.equal(dashboard.flowMindAuthorityAggregation?.deniedReasonCounts[0]?.reason, 'divergence-too-high')
  assert.equal(dashboard.flowMindAuthorityAggregation?.divergenceByConfidenceMargin, 1)
  assert.equal(dashboard.preSafeMappingSampleSize, 0)
  assert.equal(dashboard.postSafeMappingSampleSize, 1)
  assert.equal(dashboard.postSafeMappingAggregation?.sampleSize, 1)
  assert.equal(dashboard.comparisonWindowLabel, 'janela pós-safe-mapping inicial')
  assert.equal(dashboard.postSafeMappingReadiness?.readinessState, 'not-ready')
  assert.equal(dashboard.postSafeMappingReadiness?.rolloutReadinessScore, 20)
})

test('buildDashboardSparkStateResponse aggregates denial patterns by reason, command, and zone', () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      mode: 'active',
      updatedAt: '2026-04-19T20:00:00.000Z',
    },
  }
  entity.metadata.notes = [
    serializeFlowMindServiceSnapshot({
      summary: {
        mode: 'active',
        adapterName: 'shadow-test-adapter',
        adapterLoadStatus: 'loaded',
        invokedAt: '2026-04-19T20:03:00.000Z',
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
        fallbackConditions: [],
        fallbackUsed: false,
        decision: {
          intent: 'encourage_export',
          action: 'sell',
          confidence: 0.72,
        },
      },
      authority: {
        authorityEligible: true,
        authorityGranted: true,
        authorityZone: 'safe',
        authorityCommand: 'trigger_export',
      },
    }),
    serializeFlowMindServiceSnapshot({
      summary: {
        mode: 'active',
        adapterName: 'shadow-test-adapter',
        adapterLoadStatus: 'loaded',
        invokedAt: '2026-04-19T20:02:00.000Z',
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
        fallbackConditions: [],
        fallbackUsed: false,
        decision: {
          intent: 'support',
          action: 'guide',
          confidence: 0.68,
        },
      },
      comparison: {
        legacyDecision: {
          commandId: 'cmd-2',
          commandName: 'trigger_export',
          evaluatedAt: '2026-04-19T20:02:00.000Z',
          authority: 'orchestrator-legacy',
          intent: 'encourage_export',
          action: 'triggerExport',
          confidence: 0.52,
        },
        flowMindDecision: {
          commandId: 'cmd-2',
          commandName: 'trigger_export',
          evaluatedAt: '2026-04-19T20:02:00.000Z',
          intent: 'support',
          action: 'guide',
          confidence: 0.68,
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
          fallbackUsed: false,
        },
        divergenceType: 'aligned',
        semanticDifference: {
          intentChanged: false,
          actionChanged: false,
          confidenceDelta: 0.16,
          summary: 'Semântica alinhada com variação leve de confiança (0.16).',
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
          divergenceScore: 0.28,
          stabilityScore: 0.81,
          fallbackRate: 0,
          adaptiveSuccessRate: 0.8,
          sampleSize: 5,
        },
      },
      authority: {
        authorityEligible: true,
        authorityGranted: false,
        authorityDeniedReason: 'divergence-too-high',
        authorityZone: 'safe',
        authorityCommand: 'trigger_export',
      },
    }),
    serializeFlowMindServiceSnapshot({
      summary: {
        mode: 'active',
        adapterName: 'shadow-test-adapter',
        adapterLoadStatus: 'loaded',
        invokedAt: '2026-04-19T20:01:00.000Z',
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
        fallbackConditions: [],
        fallbackUsed: false,
        decision: {
          intent: 'support',
          action: 'guide',
          confidence: 0.61,
        },
      },
      comparison: {
        legacyDecision: {
          commandId: 'cmd-3',
          commandName: 'apply_control',
          evaluatedAt: '2026-04-19T20:01:00.000Z',
          authority: 'orchestrator-legacy',
          intent: 'convert',
          action: 'triggerExport',
          confidence: 0.61,
        },
        flowMindDecision: {
          commandId: 'cmd-3',
          commandName: 'apply_control',
          evaluatedAt: '2026-04-19T20:01:00.000Z',
          intent: 'support',
          action: 'guide',
          confidence: 0.61,
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
          fallbackUsed: false,
        },
        divergenceType: 'semantic-and-authority-drift',
        semanticDifference: {
          intentChanged: true,
          actionChanged: false,
          confidenceDelta: 0,
          summary: 'Intent divergente: legado convert, FlowMind support.',
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
          divergenceScore: 0.54,
          stabilityScore: 0.55,
          fallbackRate: 0,
          adaptiveSuccessRate: 0.8,
          sampleSize: 5,
        },
      },
      authority: {
        authorityEligible: false,
        authorityGranted: false,
        authorityDeniedReason: 'command-zone-prohibited',
        authorityZone: 'prohibited',
        authorityCommand: 'apply_control',
      },
    }),
    serializeFlowMindServiceSnapshot({
      summary: {
        mode: 'active',
        adapterName: 'shadow-test-adapter',
        adapterLoadStatus: 'loaded',
        invokedAt: '2026-04-19T20:00:00.000Z',
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
        fallbackConditions: [],
        fallbackUsed: false,
        decision: {
          intent: 'support',
          action: 'guide',
          confidence: 0.63,
        },
      },
      comparison: {
        legacyDecision: {
          commandId: 'cmd-4',
          commandName: 'resume_birth',
          evaluatedAt: '2026-04-19T20:00:00.000Z',
          authority: 'orchestrator-legacy',
          intent: 'support',
          action: 'sendMessage',
          confidence: 0.63,
        },
        flowMindDecision: {
          commandId: 'cmd-4',
          commandName: 'resume_birth',
          evaluatedAt: '2026-04-19T20:00:00.000Z',
          intent: 'support',
          action: 'guide',
          confidence: 0.63,
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
          fallbackUsed: false,
        },
        divergenceType: 'action-drift',
        semanticDifference: {
          intentChanged: false,
          actionChanged: true,
          confidenceDelta: 0,
          summary: 'Ação divergente: legado sendMessage, FlowMind guide.',
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
          divergenceScore: 0.44,
          stabilityScore: 0.65,
          fallbackRate: 0,
          adaptiveSuccessRate: 0.8,
          sampleSize: 5,
        },
      },
      authority: {
        authorityEligible: true,
        authorityGranted: false,
        authorityDeniedReason: 'divergence-too-high',
        authorityZone: 'safe',
        authorityCommand: 'resume_birth',
      },
    }),
  ]

  const dashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-19T20:04:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })

  assert.equal(dashboard.flowMindAuthorityAggregation?.sampleSize, 4)
  assert.equal(dashboard.flowMindAuthorityAggregation?.grantedCount, 1)
  assert.equal(dashboard.flowMindAuthorityAggregation?.deniedCount, 3)
  assert.deepEqual(dashboard.flowMindAuthorityAggregation?.deniedReasonCounts[0], {
    reason: 'divergence-too-high',
    count: 2,
  })
  assert.equal(dashboard.flowMindAuthorityAggregation?.deniedByCommand[0]?.command, 'trigger_export')
  assert.equal(dashboard.flowMindAuthorityAggregation?.deniedByCommand[0]?.deniedCount, 1)
  assert.equal(dashboard.flowMindAuthorityAggregation?.deniedByCommand[0]?.grantedCount, 1)
  assert.equal(dashboard.flowMindAuthorityAggregation?.deniedByZone[0]?.zone, 'safe')
  assert.equal(dashboard.flowMindAuthorityAggregation?.deniedByZone[0]?.deniedCount, 2)
  assert.equal(dashboard.flowMindAuthorityAggregation?.divergenceBySemanticDrift, 0)
  assert.equal(dashboard.flowMindAuthorityAggregation?.divergenceByActionDrift, 1)
  assert.equal(dashboard.flowMindAuthorityAggregation?.divergenceByConfidenceMargin, 1)
  assert.equal(dashboard.flowMindAuthorityAggregation?.recentPattern[0]?.outcome, 'granted')
  assert.equal(dashboard.flowMindAuthorityAggregation?.recentPattern[1]?.deniedReason, 'divergence-too-high')
  assert.equal(dashboard.preSafeMappingSampleSize, 0)
  assert.equal(dashboard.postSafeMappingSampleSize, 4)
  assert.equal(dashboard.postSafeMappingAggregation?.sampleSize, 4)
  assert.equal(dashboard.comparisonWindowLabel, 'janela pós-safe-mapping inicial')
  assert.equal(dashboard.postSafeMappingReadiness?.readinessState, 'forming')
})

test('buildDashboardSparkStateResponse separates historical pre-safe-mapping from post-safe-mapping window', () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      mode: 'active',
      updatedAt: '2026-04-20T09:00:00.000Z',
    },
  }
  entity.metadata.notes = [
    serializeFlowMindServiceSnapshot({
      summary: {
        mode: 'active',
        adapterName: 'shadow-test-adapter',
        adapterLoadStatus: 'loaded',
        invokedAt: '2026-04-20T09:03:00.000Z',
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
        fallbackConditions: [],
        fallbackUsed: false,
        decision: {
          intent: 'encourage_export',
          action: 'sell',
          confidence: 0.72,
        },
      },
      comparison: {
        legacyDecision: {
          commandId: 'cmd-post-1',
          commandName: 'trigger_export',
          evaluatedAt: '2026-04-20T09:03:00.000Z',
          authority: 'orchestrator-legacy',
          intent: 'encourage_export',
          action: 'triggerExport',
          confidence: 0.56,
        },
        flowMindDecision: {
          commandId: 'cmd-post-1',
          commandName: 'trigger_export',
          evaluatedAt: '2026-04-20T09:03:00.000Z',
          intent: 'encourage_export',
          action: 'sell',
          confidence: 0.72,
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
          fallbackUsed: false,
        },
        divergenceType: 'aligned',
        semanticDifference: {
          intentChanged: false,
          actionChanged: false,
          confidenceDelta: 0.16,
          summary: 'Semântica alinhada com variação leve de confiança (0.16).',
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
          divergenceScore: 0.28,
          stabilityScore: 0.81,
          fallbackRate: 0,
          adaptiveSuccessRate: 0.8,
          sampleSize: 5,
        },
      },
      authority: {
        authorityEligible: true,
        authorityGranted: false,
        authorityDeniedReason: 'divergence-too-high',
        authorityZone: 'safe',
        authorityCommand: 'trigger_export',
      },
    }),
    serializePreSafeMappingSnapshot({
      summary: {
        mode: 'active',
        adapterName: 'shadow-test-adapter',
        adapterLoadStatus: 'loaded',
        invokedAt: '2026-04-19T20:00:00.000Z',
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
        fallbackConditions: [],
        fallbackUsed: false,
        decision: {
          intent: 'support',
          action: 'guide',
          confidence: 0.63,
        },
      },
      comparison: {
        legacyDecision: {
          commandId: 'cmd-pre-1',
          commandName: 'resume_birth',
          evaluatedAt: '2026-04-19T20:00:00.000Z',
          authority: 'orchestrator-legacy',
          intent: 'support',
          action: 'sendMessage',
          confidence: 0.63,
        },
        flowMindDecision: {
          commandId: 'cmd-pre-1',
          commandName: 'resume_birth',
          evaluatedAt: '2026-04-19T20:00:00.000Z',
          intent: 'support',
          action: 'guide',
          confidence: 0.63,
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
          fallbackUsed: false,
        },
        divergenceType: 'action-drift',
        semanticDifference: {
          intentChanged: false,
          actionChanged: true,
          confidenceDelta: 0,
          summary: 'Ação divergente: legado sendMessage, FlowMind guide.',
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
          divergenceScore: 0.44,
          stabilityScore: 0.65,
          fallbackRate: 0,
          adaptiveSuccessRate: 0.8,
          sampleSize: 5,
        },
      },
      authority: {
        authorityEligible: true,
        authorityGranted: false,
        authorityDeniedReason: 'divergence-too-high',
        authorityZone: 'safe',
        authorityCommand: 'resume_birth',
      },
    }),
  ]

  const dashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-20T09:04:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })

  assert.equal(dashboard.flowMindAuthorityAggregation?.sampleSize, 2)
  assert.equal(dashboard.flowMindAuthorityAggregation?.divergenceByActionDrift, 1)
  assert.equal(dashboard.flowMindAuthorityAggregation?.divergenceByConfidenceMargin, 1)
  assert.equal(dashboard.preSafeMappingSampleSize, 1)
  assert.equal(dashboard.postSafeMappingSampleSize, 1)
  assert.equal(dashboard.postSafeMappingAggregation?.sampleSize, 1)
  assert.equal(dashboard.postSafeMappingAggregation?.divergenceByActionDrift, 0)
  assert.equal(dashboard.postSafeMappingAggregation?.divergenceByConfidenceMargin, 1)
  assert.equal(dashboard.comparisonWindowLabel, 'histórico misto com janela pós-safe-mapping inicial')
  assert.equal(dashboard.postSafeMappingReadiness?.readinessState, 'not-ready')
  assert.equal(dashboard.postSafeMappingReadiness?.confidenceMarginDominant, true)
})

test('buildDashboardSparkStateResponse marks post-safe-mapping window as ready when confidence margin dominates with low oscillation', () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      mode: 'active',
      updatedAt: '2026-04-20T10:00:00.000Z',
    },
  }
  entity.metadata.notes = Array.from({ length: 5 }, (_, index) => serializeFlowMindServiceSnapshot({
    summary: {
      mode: 'active',
      adapterName: 'shadow-test-adapter',
      adapterLoadStatus: 'loaded',
      invokedAt: `2026-04-20T10:0${4 - index}:00.000Z`,
      decisionSource: 'adaptive-core',
      terminalAuthority: 'adaptive-core',
      semanticFrozen: true,
      fallbackConditions: [],
      fallbackUsed: false,
      decision: {
        intent: 'encourage_export',
        action: 'sell',
        confidence: 0.72,
      },
    },
    comparison: {
      legacyDecision: {
        commandId: `cmd-ready-${index}`,
        commandName: 'trigger_export',
        evaluatedAt: `2026-04-20T10:0${4 - index}:00.000Z`,
        authority: 'orchestrator-legacy',
        intent: 'encourage_export',
        action: 'triggerExport',
        confidence: 0.56,
      },
      flowMindDecision: {
        commandId: `cmd-ready-${index}`,
        commandName: 'trigger_export',
        evaluatedAt: `2026-04-20T10:0${4 - index}:00.000Z`,
        intent: 'encourage_export',
        action: 'sell',
        confidence: 0.72,
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
        fallbackUsed: false,
      },
      divergenceType: 'aligned',
      semanticDifference: {
        intentChanged: false,
        actionChanged: false,
        confidenceDelta: 0.16,
        summary: 'Semântica alinhada com variação leve de confiança (0.16).',
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
        divergenceScore: 0.28,
        stabilityScore: 0.81,
        fallbackRate: 0,
        adaptiveSuccessRate: 0.8,
        sampleSize: 5,
      },
    },
    authority: {
      authorityEligible: true,
      authorityGranted: index === 0,
      authorityDeniedReason: index === 0 ? undefined : 'divergence-too-high',
      authorityZone: 'safe',
      authorityCommand: 'trigger_export',
    },
  }))

  const dashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-20T10:05:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })

  assert.equal(dashboard.postSafeMappingReadiness?.readinessState, 'ready')
  assert.equal(dashboard.postSafeMappingReadiness?.confidenceMarginDominant, true)
  assert.equal(dashboard.postSafeMappingReadiness?.divergenceBySemanticDrift, 0)
  assert.equal(dashboard.postSafeMappingReadiness?.oscillationLevel, 'low')
  assert.equal(dashboard.postSafeMappingReadiness?.rolloutReadinessScore, 100)
})

test('buildDashboardSparkStateResponse keeps authority undefined for legacy snapshots', () => {
  const entity = createTestEntity()
  entity.metadata.notes = [serializeFlowMindServiceSnapshot({
    summary: {
      mode: 'shadow',
      adapterName: 'shadow-test-adapter',
      adapterLoadStatus: 'loaded',
      invokedAt: '2026-04-19T19:10:00.000Z',
      decisionSource: 'heuristic-base',
      terminalAuthority: 'heuristic-fallback',
      semanticFrozen: false,
      fallbackConditions: ['shadow-test'],
      fallbackUsed: true,
      fallbackReason: 'shadow-test',
      decision: {
        intent: 'general',
        action: 'guide',
        confidence: 0.51,
      },
      objectiveType: 'engage',
    },
  })]

  const dashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-19T19:11:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })

  assert.equal(dashboard.sovereignFlowMind?.mode, 'shadow')
  assert.equal(dashboard.flowMindAuthority, undefined)
})

test('buildDashboardSparkStateResponse rehydrates public shadow convergence telemetry separately from authority rollout', () => {
  const entity = createTestEntity()
  entity.metadata.notes = [
    buildPublicShadowSnapshot({
      requestId: 'shadow-1',
      comparedAt: '2026-04-20T12:03:00.000Z',
      divergenceScore: 0.18,
      responseTextSimilarity: 0.92,
      frontendLatencyMs: 11,
      backendLatencyMs: 23,
      semanticInconsistencies: ['response-text-drift'],
      responseTextChanged: true,
    }),
    buildPublicShadowSnapshot({
      requestId: 'shadow-2',
      comparedAt: '2026-04-20T12:02:00.000Z',
      divergenceScore: 0.27,
      responseTextSimilarity: 0.84,
      frontendLatencyMs: 12,
      backendLatencyMs: 26,
      semanticInconsistencies: ['action-mismatch', 'response-text-drift'],
      actionChanged: true,
      responseTextChanged: true,
    }),
    buildPublicShadowSnapshot({
      requestId: 'shadow-3',
      comparedAt: '2026-04-20T12:01:00.000Z',
      divergenceScore: 0.54,
      responseTextSimilarity: 0.58,
      frontendLatencyMs: 13,
      backendLatencyMs: 31,
      fallbackUsed: true,
      semanticInconsistencies: ['intent-mismatch', 'decision-source-mismatch', 'response-text-drift'],
      intentChanged: true,
      authorityChanged: true,
      responseTextChanged: true,
    }),
  ]

  const dashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-20T12:04:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })

  assert.equal(dashboard.publicShadowSampleSize, 3)
  assert.equal(dashboard.publicShadowAggregation?.sampleSize, 3)
  assert.equal(dashboard.publicShadowAggregation?.averageDivergenceScore, 0.33)
  assert.equal(dashboard.publicShadowAggregation?.averageFrontendLatencyMs, 12)
  assert.equal(dashboard.publicShadowAggregation?.averageBackendLatencyMs, 27)
  assert.equal(dashboard.publicShadowAggregation?.fallbackRate, 0.333)
  assert.equal(dashboard.publicShadowAggregation?.responseTextChangedCount, 3)
  assert.equal(dashboard.publicShadowAggregation?.topSemanticInconsistencies[0]?.key, 'response-text-drift')
  assert.equal(dashboard.publicShadowAggregation?.recentPattern[0]?.outcome, 'aligned')
  assert.equal(dashboard.publicShadowAggregation?.recentPattern[2]?.outcome, 'diverged')
  assert.equal(dashboard.publicShadowAggregation?.recentTrend, 'forming')
  assert.equal(dashboard.publicShadowReadiness?.publicShadowReadinessState, 'not-ready')
  assert.equal(dashboard.publicShadowReadiness?.publicShadowReadinessScore, 41)
  assert.equal(dashboard.flowMindAuthorityAggregation, undefined)
})

test('buildDashboardSparkStateResponse marks public shadow as forming when convergence is useful but still incomplete', () => {
  const entity = createTestEntity()
  entity.metadata.notes = [
    buildPublicShadowSnapshot({
      requestId: 'shadow-forming-1',
      comparedAt: '2026-04-20T12:13:00.000Z',
      divergenceScore: 0.18,
      responseTextSimilarity: 0.89,
      frontendLatencyMs: 11,
      backendLatencyMs: 24,
      semanticInconsistencies: ['response-text-drift'],
      responseTextChanged: true,
    }),
    buildPublicShadowSnapshot({
      requestId: 'shadow-forming-2',
      comparedAt: '2026-04-20T12:12:00.000Z',
      divergenceScore: 0.2,
      responseTextSimilarity: 0.88,
      frontendLatencyMs: 12,
      backendLatencyMs: 26,
    }),
    buildPublicShadowSnapshot({
      requestId: 'shadow-forming-3',
      comparedAt: '2026-04-20T12:11:00.000Z',
      divergenceScore: 0.24,
      responseTextSimilarity: 0.85,
      frontendLatencyMs: 12,
      backendLatencyMs: 29,
    }),
  ]

  const dashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-20T12:14:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })

  assert.equal(dashboard.publicShadowAggregation?.sampleSize, 3)
  assert.equal(dashboard.publicShadowAggregation?.averageDivergenceScore, 0.207)
  assert.equal(dashboard.publicShadowAggregation?.averageResponseTextSimilarity, 0.873)
  assert.equal(dashboard.publicShadowReadiness?.publicShadowReadinessState, 'forming')
  assert.equal(dashboard.publicShadowReadiness?.publicShadowReadinessScore, 88)
})

test('buildDashboardSparkStateResponse marks public shadow as ready when convergence is stable enough for partial consideration', () => {
  const entity = createTestEntity()
  entity.metadata.notes = Array.from({ length: 5 }, (_, index) => buildPublicShadowSnapshot({
    requestId: `shadow-ready-${index}`,
    comparedAt: `2026-04-20T13:0${4 - index}:00.000Z`,
    divergenceScore: 0.16,
    responseTextSimilarity: 0.9,
    frontendLatencyMs: 12,
    backendLatencyMs: 28,
    semanticInconsistencies: index === 0 ? ['response-text-drift'] : [],
    responseTextChanged: index === 0,
  }))

  const dashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-20T13:05:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })

  assert.equal(dashboard.publicShadowAggregation?.sampleSize, 5)
  assert.equal(dashboard.publicShadowAggregation?.recentTrend, 'stable')
  assert.equal(dashboard.publicShadowReadiness?.publicShadowReadinessState, 'ready')
  assert.equal(dashboard.publicShadowReadiness?.publicShadowReadinessScore, 98)
  assert.equal(dashboard.publicShadowReadiness?.sampleSize, 5)
  assert.equal(dashboard.publicShadowReadiness?.intentChangedRate, 0)
  assert.equal(dashboard.publicShadowReadiness?.actionChangedRate, 0)
})

test('buildDashboardSparkStateResponse projects public partial aggregation separately from shadow and authority rollout', () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      ...entity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 25,
        killSwitchEnabled: false,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
      },
    },
  }
  entity.metadata.notes = [
    buildPublicPartialSnapshot({
      requestId: 'partial-1',
      decidedAt: '2026-04-20T14:03:00.000Z',
      engineUsed: 'flowmind',
      chosenLatencyMs: 94,
      backendLatencyMs: 94,
      divergenceScore: 0.12,
    }),
    buildPublicPartialSnapshot({
      requestId: 'partial-2',
      decidedAt: '2026-04-20T14:02:00.000Z',
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'backend-latency-too-high',
      chosenLatencyMs: 22,
      backendLatencyMs: 820,
      divergenceScore: 0.12,
    }),
    buildPublicShadowSnapshot({
      requestId: 'shadow-1',
      comparedAt: '2026-04-20T14:01:00.000Z',
      divergenceScore: 0.16,
      responseTextSimilarity: 0.91,
      frontendLatencyMs: 18,
      backendLatencyMs: 29,
    }),
  ]

  const dashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-20T14:04:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })

  assert.equal(dashboard.publicPartialAggregation?.totalInteractions, 2)
  assert.equal(dashboard.publicPartialAggregation?.flowMindUsedCount, 1)
  assert.equal(dashboard.publicPartialAggregation?.frontendUsedCount, 1)
  assert.equal(dashboard.publicPartialAggregation?.fallbackCount, 1)
  assert.equal(dashboard.publicPartialAggregation?.fallbackRate, 0.5)
  assert.equal(dashboard.publicPartialAggregation?.rolloutPercentage, 25)
  assert.equal(dashboard.publicPartialAggregation?.automationMode, 'recommendation-only')
  assert.equal(dashboard.publicPartialAggregation?.readinessState, 'not-ready')
  assert.equal(dashboard.publicPartialAggregation?.policyRecommendation.action, 'maintain')
  assert.equal(dashboard.publicPartialAggregation?.policyRecommendation.status, 'blocked')
  assert.equal(dashboard.publicPartialAggregation?.fallbackReasonCounts[0]?.reason, 'backend-latency-too-high')
  assert.equal(dashboard.publicPartialAggregation?.shadowComparison?.shadowSampleSize, 1)
  assert.equal(dashboard.publicShadowAggregation?.sampleSize, 1)
  assert.equal(dashboard.flowMindAuthorityAggregation, undefined)
})

test('buildDashboardSparkStateResponse projects active, stale, and absent partial states without ambiguity', () => {
  const activeEntity = createTestEntity()
  activeEntity.runtime = {
    ...activeEntity.runtime,
    flowMind: {
      ...activeEntity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 25,
        killSwitchEnabled: false,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
      },
    },
  }
  activeEntity.metadata.notes = [
    buildPublicPartialSnapshot({
      requestId: 'partial-active',
      decidedAt: '2026-04-22T10:10:00.000Z',
      engineUsed: 'flowmind',
      chosenLatencyMs: 94,
      backendLatencyMs: 94,
      divergenceScore: 0.12,
    }),
  ]

  const staleEntity = createTestEntity()
  staleEntity.runtime = {
    ...staleEntity.runtime,
    flowMind: {
      ...staleEntity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 25,
        killSwitchEnabled: false,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
      },
    },
  }
  staleEntity.metadata.notes = [
    buildPublicPartialSnapshot({
      requestId: 'partial-stale',
      decidedAt: '2026-04-22T10:10:00.000Z',
      engineUsed: 'flowmind',
      chosenLatencyMs: 94,
      backendLatencyMs: 94,
      divergenceScore: 0.12,
    }),
  ]

  const absentEntity = createTestEntity()
  absentEntity.runtime = {
    ...absentEntity.runtime,
    flowMind: {
      ...absentEntity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 25,
        killSwitchEnabled: false,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
      },
    },
  }

  const activeDashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(activeEntity.id, '2026-04-22T10:20:00.000Z'),
    recentEvents: [],
    entityProfile: activeEntity,
  })
  const staleDashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(staleEntity.id, '2026-04-22T10:40:01.000Z'),
    recentEvents: [],
    entityProfile: staleEntity,
  })
  const absentDashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(absentEntity.id, '2026-04-22T10:40:01.000Z'),
    recentEvents: [],
    entityProfile: absentEntity,
  })

  assert.equal(activeDashboard.publicPartialAggregation?.incidentState, 'watch')
  assert.equal(staleDashboard.publicPartialAggregation?.incidentState, 'stale')
  assert.equal(absentDashboard.publicPartialAggregation?.incidentState, 'absent')
  assert.ok(!['watch', 'degraded', 'critical'].includes(staleDashboard.publicPartialAggregation?.incidentState ?? ''))
  assert.notEqual(absentDashboard.publicPartialAggregation?.incidentState, 'normal')
})

test('buildDashboardSparkStateResponse stops projecting a critical incident as active after telemetry expires', () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      ...entity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 25,
        killSwitchEnabled: false,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
      },
    },
  }
  entity.metadata.notes = [
    buildPublicPartialSnapshot({
      requestId: 'partial-critical-expiring',
      decidedAt: '2026-04-22T10:10:00.000Z',
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'backend-latency-too-high',
      chosenLatencyMs: 22,
      backendLatencyMs: 820,
      divergenceScore: 0.12,
    }),
  ]

  const activeDashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-22T10:12:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })
  const expiredDashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-22T10:30:01.000Z'),
    recentEvents: [],
    entityProfile: entity,
  })

  assert.equal(activeDashboard.publicPartialAggregation?.incidentState, 'critical')
  assert.equal(expiredDashboard.publicPartialAggregation?.incidentState, 'stale')
  assert.ok(!['degraded', 'critical'].includes(expiredDashboard.publicPartialAggregation?.incidentState ?? ''))
})

test('buildDashboardSparkStateResponse exposes filtered FlowMind metrics with endpoint and period separation', () => {
  const entity = createTestEntity()
  entity.metadata.notes = [
    buildPublicShadowSnapshot({
      requestId: 'shadow-1',
      comparedAt: '2026-04-20T11:58:00.000Z',
      divergenceScore: 0.08,
      responseTextSimilarity: 0.96,
      frontendLatencyMs: 14,
      backendLatencyMs: 120,
      lowRiskLaneUsed: true,
    }),
    buildPublicShadowSnapshot({
      requestId: 'shadow-2',
      comparedAt: '2026-04-19T08:00:00.000Z',
      divergenceScore: 0.22,
      responseTextSimilarity: 0.88,
      frontendLatencyMs: 18,
      backendLatencyMs: 260,
      fallbackUsed: true,
    }),
    buildPublicPartialSnapshot({
      requestId: 'partial-1',
      decidedAt: '2026-04-20T11:57:00.000Z',
      engineUsed: 'flowmind',
      chosenLatencyMs: 180,
      backendLatencyMs: 180,
      lowRiskLaneUsed: true,
      divergenceScore: 0.1,
    }),
    buildPublicPartialSnapshot({
      requestId: 'partial-2',
      decidedAt: '2026-04-20T11:56:00.000Z',
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'backend-unavailable',
      chosenLatencyMs: 510,
    }),
  ]

  const allDashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-20T12:00:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
    metricsFilters: {
      endpoint: 'all',
      period: '24h',
    },
  })

  assert.equal(allDashboard.flowMindMetrics?.sampleSize, 3)
  assert.equal(allDashboard.flowMindMetrics?.decisionServed.sampleSize, 3)
  assert.equal(allDashboard.flowMindMetrics?.decisionServed.backendSuccessRate, 0.667)
  assert.equal(allDashboard.flowMindMetrics?.decisionServed.degradedModeRate, 0.333)
  assert.equal(allDashboard.flowMindMetrics?.decisionServed.adaptiveCoreRate, 1)
  assert.equal(allDashboard.flowMindMetrics?.decisionServed.heuristicFallbackRate, 0)
  assert.equal(allDashboard.flowMindMetrics?.decisionServed.lowRiskLaneUsageRate, 0.667)
  assert.equal(allDashboard.flowMindMetrics?.decisionServed.latency.p50Ms, 180)
  assert.equal(allDashboard.flowMindMetrics?.decisionServed.latency.p95Ms, 510)
  assert.equal(allDashboard.flowMindMetrics?.decisionEvaluated.sampleSize, 2)
  assert.equal(allDashboard.flowMindMetrics?.decisionEvaluated.backendSuccessRate, 1)
  assert.equal(allDashboard.flowMindMetrics?.decisionEvaluated.degradedModeRate, 0)
  assert.equal(allDashboard.flowMindMetrics?.decisionEvaluated.adaptiveCoreRate, 1)
  assert.equal(allDashboard.flowMindMetrics?.decisionEvaluated.heuristicFallbackRate, 0)
  assert.equal(allDashboard.flowMindMetrics?.decisionEvaluated.lowRiskLaneUsageRate, 1)
  assert.equal(allDashboard.flowMindMetrics?.decisionEvaluated.latency.p50Ms, 120)
  assert.equal(allDashboard.flowMindMetrics?.decisionEvaluated.latency.p95Ms, 180)
  assert.deepEqual(allDashboard.flowMindMetrics?.errorTypeCounts[0], {
    type: 'backend-unavailable',
    count: 1,
  })

  const partialDashboard = buildDashboardSparkStateResponse({
    runtime: buildRuntime(entity.id, '2026-04-20T12:00:00.000Z'),
    recentEvents: [],
    entityProfile: entity,
    metricsFilters: {
      endpoint: 'public-partial',
      period: '24h',
    },
  })

  assert.equal(partialDashboard.flowMindMetrics?.sampleSize, 2)
  assert.equal(partialDashboard.flowMindMetrics?.endpointCounts[0]?.endpoint, 'public-partial')
  assert.equal(partialDashboard.flowMindMetrics?.decisionServed.sampleSize, 2)
  assert.equal(partialDashboard.flowMindMetrics?.decisionServed.backendSuccessRate, 0.5)
  assert.equal(partialDashboard.flowMindMetrics?.decisionServed.degradedModeRate, 0.5)
  assert.equal(partialDashboard.flowMindMetrics?.decisionServed.lowRiskLaneUsageRate, 0.5)
  assert.equal(partialDashboard.flowMindMetrics?.decisionEvaluated.sampleSize, 1)
  assert.equal(partialDashboard.flowMindMetrics?.decisionEvaluated.backendSuccessRate, 1)
  assert.equal(partialDashboard.flowMindMetrics?.decisionEvaluated.degradedModeRate, 0)
  assert.equal(partialDashboard.flowMindMetrics?.decisionEvaluated.lowRiskLaneUsageRate, 1)
})

test('buildPublicFlowMindPartialPortfolio ranks multiple entities by performance and risk', () => {
  const healthyEntity = createTestEntity()
  healthyEntity.id = 'entity-healthy'
  healthyEntity.social.publicName = 'Aurora'
  healthyEntity.runtime = {
    ...healthyEntity.runtime,
    flowMind: {
      ...healthyEntity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 20,
        killSwitchEnabled: false,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
      },
    },
  }
  healthyEntity.metadata.notes = [
    buildPublicPartialSnapshot({
      requestId: 'healthy-1',
      decidedAt: '2026-04-20T11:58:00.000Z',
      engineUsed: 'flowmind',
      chosenLatencyMs: 150,
      backendLatencyMs: 150,
      divergenceScore: 0.08,
    }),
    buildPublicPartialSnapshot({
      requestId: 'healthy-2',
      decidedAt: '2026-04-20T11:56:00.000Z',
      engineUsed: 'flowmind',
      chosenLatencyMs: 170,
      backendLatencyMs: 170,
      divergenceScore: 0.1,
    }),
  ]

  const riskyEntity = createTestEntity()
  riskyEntity.id = 'entity-risky'
  riskyEntity.social.publicName = 'Nebula'
  riskyEntity.runtime = {
    ...riskyEntity.runtime,
    flowMind: {
      ...riskyEntity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 30,
        killSwitchEnabled: false,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
      },
    },
  }
  riskyEntity.metadata.notes = [
    buildPublicPartialSnapshot({
      requestId: 'risky-1',
      decidedAt: '2026-04-20T11:59:00.000Z',
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'backend-unavailable',
      chosenLatencyMs: 520,
      divergenceScore: 0.32,
      backendLatencyMs: 520,
    }),
    buildPublicPartialSnapshot({
      requestId: 'risky-2',
      decidedAt: '2026-04-20T11:57:00.000Z',
      engineUsed: 'frontend',
      fallbackOccurred: true,
      fallbackReason: 'critical-inconsistency',
      chosenLatencyMs: 610,
      divergenceScore: 0.38,
      backendLatencyMs: 610,
    }),
  ]

  const portfolio = buildPublicFlowMindPartialPortfolio({
    entities: [
      {
        id: healthyEntity.id,
        createdAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T12:00:00.000Z',
        entityProfile: healthyEntity,
      },
      {
        id: riskyEntity.id,
        createdAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T12:00:00.000Z',
        entityProfile: riskyEntity,
      },
    ],
    now: '2026-04-20T12:00:00.000Z',
  })

  assert.ok(portfolio)
  assert.equal(portfolio.filters.operationalRisk, 'all')
  assert.equal(portfolio.entitiesWithPartial, 2)
  assert.equal(portfolio.topPerformers[0]?.entityId, 'entity-healthy')
  assert.equal(portfolio.highestRisk[0]?.entityId, 'entity-risky')
  assert.equal(portfolio.highestFallbackRate[0]?.entityId, 'entity-risky')
  assert.equal(portfolio.highestDivergence[0]?.entityId, 'entity-risky')
  assert.equal(portfolio.orderedEntities[0]?.entityId, 'entity-risky')
  assert.equal(portfolio.orderedEntities[0]?.automationMode, 'recommendation-only')
})
