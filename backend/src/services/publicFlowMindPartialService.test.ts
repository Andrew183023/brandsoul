import assert from 'node:assert/strict'
import test from 'node:test'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import {
  applyPublicFlowMindPartialOperationalSettingsUpdate,
  applyPublicFlowMindPartialIncidentState,
  applyPublicFlowMindPartialPolicyAdjustment,
  appendPublicFlowMindPartialTelemetrySnapshot,
  buildPublicFlowMindPartialSampledRequestRecord,
  buildPublicFlowMindPartialAggregation,
  buildPublicFlowMindPartialTelemetrySnapshot,
  listPublicFlowMindPartialSampledRequestRecords,
  listPublicFlowMindPartialTelemetrySnapshots,
  resolvePublicFlowMindPartialConfig,
  resolvePublicFlowMindPartialOperationalSettings,
  normalizePublicFlowMindPartialOperationalSettingsUpdate,
  reconcilePublicFlowMindPartialTelemetry,
  registerPublicFlowMindPartialSampledRequest,
  syncPublicFlowMindPartialSampledRequestRecords,
} from './publicFlowMindPartialService.js'

test('resolvePublicFlowMindPartialConfig only enables partial when readiness is ready and rollout is configured', () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      ...entity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 25,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
      },
    },
  }

  const config = resolvePublicFlowMindPartialConfig({
    entityProfile: entity,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 5,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.91,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 17,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
  })

  assert.equal(config.enabled, true)
  assert.equal(config.rolloutPercentage, 25)
  assert.equal(config.latencyBudgetMs, 700)
  assert.equal(config.criticalDivergenceThreshold, 0.31)
  assert.equal(config.activationReason, 'eligible-for-public-partial')
})

test('resolvePublicFlowMindPartialOperationalSettings normalizes thresholds and webhook settings for admin operations', () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      ...entity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 27,
        killSwitchEnabled: true,
        automationMode: 'auto-apply',
        latencyBudgetMs: 640,
        criticalDivergenceThreshold: 0.27,
        alertWebhook: {
          enabled: true,
          url: ' https://ops.example.com/partial-alerts ',
          timeoutMs: 2200,
          retryCount: 3,
        },
      },
    },
  }

  const settings = resolvePublicFlowMindPartialOperationalSettings(entity)

  assert.equal(settings.rolloutPercentage, 27)
  assert.equal(settings.killSwitchEnabled, true)
  assert.equal(settings.automationMode, 'auto-apply')
  assert.equal(settings.latencyBudgetMs, 640)
  assert.equal(settings.criticalDivergenceThreshold, 0.27)
  assert.deepEqual(settings.alertWebhook, {
    enabled: true,
    url: 'https://ops.example.com/partial-alerts',
    timeoutMs: 2200,
    retryCount: 3,
  })
})

test('applyPublicFlowMindPartialOperationalSettingsUpdate persists dedicated admin operations with manual audit', () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      ...entity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 10,
        killSwitchEnabled: false,
        automationMode: 'recommendation-only',
      },
    },
  }

  const nextSettings = normalizePublicFlowMindPartialOperationalSettingsUpdate({
    rolloutPercentage: 35,
    killSwitchEnabled: true,
    automationMode: 'auto-apply',
    latencyBudgetMs: 780,
    criticalDivergenceThreshold: 0.26,
    alertWebhook: {
      enabled: true,
      url: 'https://ops.example.com/flowmind/public-partial',
      timeoutMs: 2600,
      retryCount: 1,
    },
  }, entity)

  const updated = applyPublicFlowMindPartialOperationalSettingsUpdate({
    entityProfile: entity,
    settings: nextSettings,
    changedAt: '2026-04-21T19:00:00.000Z',
  })

  assert.equal(updated.runtime?.flowMind?.publicPartial?.rolloutPercentage, 35)
  assert.equal(updated.runtime?.flowMind?.publicPartial?.killSwitchEnabled, true)
  assert.equal(updated.runtime?.flowMind?.publicPartial?.automationMode, 'auto-apply')
  assert.equal(updated.runtime?.flowMind?.publicPartial?.latencyBudgetMs, 780)
  assert.equal(updated.runtime?.flowMind?.publicPartial?.criticalDivergenceThreshold, 0.26)
  assert.deepEqual(updated.runtime?.flowMind?.publicPartial?.alertWebhook, {
    enabled: true,
    url: 'https://ops.example.com/flowmind/public-partial',
    timeoutMs: 2600,
    retryCount: 1,
  })
  assert.equal(updated.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.lastAdjustment?.action, 'manual-update')
  assert.equal(updated.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.lastAdjustment?.reason, 'manual-admin-control:auto-apply')
})

test('buildPublicFlowMindPartialTelemetrySnapshot records chosen engine and divergence when backend is present', () => {
  const snapshot = buildPublicFlowMindPartialTelemetrySnapshot({
    requestId: 'partial-1',
    policy: {
      readinessState: 'ready',
      readinessScore: 98,
      rolloutPercentage: 25,
      latencyBudgetMs: 700,
      criticalDivergenceThreshold: 0.31,
      killSwitchEnabled: false,
      enabled: true,
      activationReason: 'eligible-for-public-partial',
    },
    frontendDecision: {
      evaluatedAt: '2026-04-20T12:00:00.000Z',
      intent: 'assist',
      action: 'support',
      responseText: 'Aurora responde com contencao e clareza.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      latencyMs: 18,
    },
    backendDecision: {
      requestId: 'partial-1',
      evaluatedAt: '2026-04-20T12:00:00.000Z',
      intent: 'promote',
      action: 'sell',
      confidence: 0.81,
      responseText: 'Aurora intensifica a presenca para conversao.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      fallbackUsed: false,
      latencyMs: 42,
    },
  })

  assert.equal(snapshot.engineUsed, 'frontend')
  assert.equal(snapshot.fallbackOccurred, true)
  assert.equal(snapshot.fallbackReason, 'critical-inconsistency')
  assert.ok((snapshot.comparison?.divergenceScore ?? 0) > 0.5)
  assert.equal(snapshot.metrics.chosenLatencyMs, 18)
})

test('buildPublicFlowMindPartialAggregation summarizes real usage, fallback reasons, and shadow comparison', () => {
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

  const withFirstSnapshot = appendPublicFlowMindPartialTelemetrySnapshot(entity, buildPublicFlowMindPartialTelemetrySnapshot({
    requestId: 'partial-1',
    policy: {
      readinessState: 'ready',
      readinessScore: 98,
      rolloutPercentage: 25,
      latencyBudgetMs: 700,
      criticalDivergenceThreshold: 0.31,
      killSwitchEnabled: false,
      enabled: true,
      activationReason: 'eligible-for-public-partial',
    },
    frontendDecision: {
      evaluatedAt: '2026-04-20T12:00:00.000Z',
      intent: 'assist',
      action: 'support',
      responseText: 'Aurora responde com contencao e clareza.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      latencyMs: 18,
    },
    backendDecision: {
      requestId: 'partial-1',
      evaluatedAt: '2026-04-20T12:00:00.000Z',
      intent: 'assist',
      action: 'support',
      confidence: 0.74,
      responseText: 'Aurora responde com contencao e clareza com contexto.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      fallbackUsed: false,
      latencyMs: 92,
    },
    decidedAt: '2026-04-20T12:00:00.000Z',
  }))
  const withSecondSnapshot = appendPublicFlowMindPartialTelemetrySnapshot(withFirstSnapshot, buildPublicFlowMindPartialTelemetrySnapshot({
    requestId: 'partial-2',
    policy: {
      readinessState: 'ready',
      readinessScore: 98,
      rolloutPercentage: 25,
      latencyBudgetMs: 700,
      criticalDivergenceThreshold: 0.31,
      killSwitchEnabled: false,
      enabled: true,
      activationReason: 'eligible-for-public-partial',
    },
    frontendDecision: {
      evaluatedAt: '2026-04-20T12:01:00.000Z',
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
    backendDecision: {
      requestId: 'partial-2',
      evaluatedAt: '2026-04-20T12:01:00.000Z',
      intent: 'assist',
      action: 'support',
      confidence: 0.73,
      responseText: 'Aurora responde com contencao e clareza.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      fallbackUsed: false,
      latencyMs: 820,
    },
    decidedAt: '2026-04-20T12:01:00.000Z',
  }))

  const aggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: withSecondSnapshot,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 5,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.91,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 17,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
    shadowAggregation: {
      sampleSize: 5,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.91,
      averageFrontendLatencyMs: 18,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 10,
      fallbackRate: 0.1,
      intentChangedCount: 0,
      actionChangedCount: 0,
      authorityChangedCount: 0,
      responseTextChangedCount: 1,
      topSemanticInconsistencies: [],
      recentPattern: [],
      recentTrend: 'stable',
    },
    now: '2026-04-20T12:10:00.000Z',
  })

  assert.ok(aggregation)
  assert.equal(aggregation.totalInteractions, 2)
  assert.equal(aggregation.flowMindUsedCount, 1)
  assert.equal(aggregation.frontendUsedCount, 1)
  assert.equal(aggregation.fallbackCount, 1)
  assert.equal(aggregation.fallbackRate, 0.5)
  assert.equal(aggregation.avgLatencyFlowMind, 92)
  assert.equal(aggregation.avgLatencyFrontend, 22)
  assert.equal(aggregation.latencyDelta, 70)
  assert.equal(aggregation.recentTrend, 'forming')
  assert.equal(aggregation.operationalRisk, 'critical')
  assert.equal(aggregation.incidentState, 'critical')
  assert.equal(aggregation.alerts[0]?.severity, 'critical')
  assert.equal(aggregation.automationGuard.autoApplyAllowed, false)
  assert.equal(aggregation.automationGuard.blockedReason, 'insufficient-sample-size')
  assert.equal(aggregation.fallbackReasonCounts[0]?.reason, 'backend-latency-too-high')
  assert.equal(aggregation.shadowComparison?.shadowAverageDivergenceScore, 0.16)
})

test('buildPublicFlowMindPartialAggregation recommends a small increase only after a healthy stable window', () => {
  let entity = createTestEntity()
  const now = Date.now()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      ...entity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 20,
        killSwitchEnabled: false,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
      },
    },
  }

  for (let index = 0; index < 6; index += 1) {
    const decidedAt = new Date(now - ((5 - index) * 60 * 60 * 1000)).toISOString()
    entity = appendPublicFlowMindPartialTelemetrySnapshot(entity, buildPublicFlowMindPartialTelemetrySnapshot({
      requestId: `healthy-${index}`,
      policy: {
        readinessState: 'ready',
        readinessScore: 98,
        rolloutPercentage: 20,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
        killSwitchEnabled: false,
        enabled: true,
        activationReason: 'eligible-for-public-partial',
      },
      frontendDecision: {
        evaluatedAt: decidedAt,
        intent: 'assist',
        action: 'support',
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        latencyMs: 24,
      },
      backendDecision: {
        requestId: `healthy-${index}`,
        evaluatedAt: decidedAt,
        intent: 'assist',
        action: 'support',
        confidence: 0.76,
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        fallbackUsed: false,
        latencyMs: 140,
      },
      decidedAt,
    }))
  }

  const aggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: entity,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 6,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.1,
      averageResponseTextSimilarity: 0.93,
      averageBackendLatencyMs: 42,
      averageLatencyDeltaMs: 18,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
  })

  assert.ok(aggregation)
  assert.equal(aggregation.operationalRisk, 'normal')
  assert.equal(aggregation.incidentState, 'normal')
  assert.equal(aggregation.alerts.length, 0)
  assert.equal(aggregation.automationGuard.autoApplyAllowed, true)
  assert.equal(aggregation.policyRecommendation.action, 'increase')
  assert.equal(aggregation.policyRecommendation.status, 'recommended')
  assert.equal(aggregation.policyRecommendation.targetRolloutPercentage, 25)
})

test('buildPublicFlowMindPartialAggregation blocks increase during cooldown even when metrics are healthy', () => {
  let entity = createTestEntity()
  const now = Date.now()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      ...entity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 20,
        killSwitchEnabled: false,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
        autoRolloutPolicy: {
          cooldownUntil: new Date(now + (60 * 60 * 1000)).toISOString(),
        },
      },
    },
  }

  for (let index = 0; index < 6; index += 1) {
    const decidedAt = new Date(now - ((5 - index) * 60 * 60 * 1000)).toISOString()
    entity = appendPublicFlowMindPartialTelemetrySnapshot(entity, buildPublicFlowMindPartialTelemetrySnapshot({
      requestId: `cooldown-${index}`,
      policy: {
        readinessState: 'ready',
        readinessScore: 98,
        rolloutPercentage: 20,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
        killSwitchEnabled: false,
        enabled: true,
        activationReason: 'eligible-for-public-partial',
      },
      frontendDecision: {
        evaluatedAt: decidedAt,
        intent: 'assist',
        action: 'support',
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        latencyMs: 22,
      },
      backendDecision: {
        requestId: `cooldown-${index}`,
        evaluatedAt: decidedAt,
        intent: 'assist',
        action: 'support',
        confidence: 0.75,
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        fallbackUsed: false,
        latencyMs: 130,
      },
      decidedAt,
    }))
  }

  const aggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: entity,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 6,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.1,
      averageResponseTextSimilarity: 0.93,
      averageBackendLatencyMs: 42,
      averageLatencyDeltaMs: 18,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
  })

  assert.ok(aggregation)
  assert.equal(aggregation.automationGuard.autoApplyAllowed, true)
  assert.equal(aggregation.policyRecommendation.status, 'blocked')
  assert.equal(aggregation.policyRecommendation.blockedReason, 'cooldown-active')
})

test('applyPublicFlowMindPartialIncidentState preserves enteredAt while state is stable and resets on transition', () => {
  const entity = createTestEntity()
  const first = applyPublicFlowMindPartialIncidentState({
    entityProfile: entity,
    incidentState: 'watch',
    observedAt: '2026-04-21T18:00:00.000Z',
  })
  const second = applyPublicFlowMindPartialIncidentState({
    entityProfile: first,
    incidentState: 'watch',
    observedAt: '2026-04-21T18:05:00.000Z',
  })
  const third = applyPublicFlowMindPartialIncidentState({
    entityProfile: second,
    incidentState: 'critical',
    observedAt: '2026-04-21T18:10:00.000Z',
  })

  assert.equal(first.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.incidentState?.enteredAt, '2026-04-21T18:00:00.000Z')
  assert.equal(second.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.incidentState?.enteredAt, '2026-04-21T18:00:00.000Z')
  assert.equal(second.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.incidentState?.updatedAt, '2026-04-21T18:05:00.000Z')
  assert.equal(third.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.incidentState?.state, 'critical')
  assert.equal(third.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.incidentState?.enteredAt, '2026-04-21T18:10:00.000Z')
})

test('buildPublicFlowMindPartialAggregation keeps a recent snapshot as an active incident state when metrics still signal risk', () => {
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

  const aggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: appendPublicFlowMindPartialTelemetrySnapshot(entity, buildPublicFlowMindPartialTelemetrySnapshot({
      requestId: 'recent-watch',
      decidedAt: '2026-04-22T10:10:00.000Z',
      policy: {
        readinessState: 'ready',
        readinessScore: 98,
        rolloutPercentage: 25,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
        killSwitchEnabled: false,
        enabled: true,
        activationReason: 'eligible-for-public-partial',
      },
      frontendDecision: {
        evaluatedAt: '2026-04-22T10:10:00.000Z',
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
      backendDecision: {
        requestId: 'recent-watch',
        evaluatedAt: '2026-04-22T10:10:00.000Z',
        intent: 'assist',
        action: 'support',
        confidence: 0.72,
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        fallbackUsed: false,
        latencyMs: 120,
      },
    })),
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 5,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.91,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 17,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
    now: '2026-04-22T10:20:00.000Z',
  })

  assert.ok(aggregation)
  assert.equal(aggregation.incidentState, 'watch')
  assert.notEqual(aggregation.incidentState, 'stale')
  assert.notEqual(aggregation.incidentState, 'absent')
})

test('buildPublicFlowMindPartialAggregation marks an expired snapshot explicitly as stale instead of an active incident', () => {
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

  const aggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: appendPublicFlowMindPartialTelemetrySnapshot(entity, buildPublicFlowMindPartialTelemetrySnapshot({
      requestId: 'stale-watch',
      decidedAt: '2026-04-22T10:10:00.000Z',
      policy: {
        readinessState: 'ready',
        readinessScore: 98,
        rolloutPercentage: 25,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
        killSwitchEnabled: false,
        enabled: true,
        activationReason: 'eligible-for-public-partial',
      },
      frontendDecision: {
        evaluatedAt: '2026-04-22T10:10:00.000Z',
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
      backendDecision: {
        requestId: 'stale-watch',
        evaluatedAt: '2026-04-22T10:10:00.000Z',
        intent: 'assist',
        action: 'support',
        confidence: 0.72,
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        fallbackUsed: false,
        latencyMs: 120,
      },
    })),
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 5,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.91,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 17,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
    now: '2026-04-22T10:40:01.000Z',
  })

  assert.ok(aggregation)
  assert.equal(aggregation.incidentState, 'stale')
  assert.equal(aggregation.operationalRisk, 'warning')
  assert.ok(!['normal', 'watch', 'degraded', 'critical'].includes(aggregation.incidentState))
})

test('applyPublicFlowMindPartialIncidentState does not keep a critical incident frozen after telemetry expires', () => {
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

  const entityWithTelemetry = appendPublicFlowMindPartialTelemetrySnapshot(entity, buildPublicFlowMindPartialTelemetrySnapshot({
    requestId: 'critical-freeze-check',
    decidedAt: '2026-04-22T10:10:00.000Z',
    policy: {
      readinessState: 'ready',
      readinessScore: 98,
      rolloutPercentage: 25,
      latencyBudgetMs: 700,
      criticalDivergenceThreshold: 0.31,
      killSwitchEnabled: false,
      enabled: true,
      activationReason: 'eligible-for-public-partial',
    },
    frontendDecision: {
      evaluatedAt: '2026-04-22T10:10:00.000Z',
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
    backendDecision: {
      requestId: 'critical-freeze-check',
      evaluatedAt: '2026-04-22T10:10:00.000Z',
      intent: 'assist',
      action: 'support',
      confidence: 0.72,
      responseText: 'Aurora responde com contencao e clareza com contexto.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      fallbackUsed: false,
      latencyMs: 820,
    },
  }))

  const activeAggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: entityWithTelemetry,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 5,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.91,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 17,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
    now: '2026-04-22T10:12:00.000Z',
  })

  assert.ok(activeAggregation)
  assert.equal(activeAggregation.incidentState, 'critical')

  const entityWithActiveIncident = applyPublicFlowMindPartialIncidentState({
    entityProfile: entityWithTelemetry,
    incidentState: activeAggregation.incidentState,
    observedAt: '2026-04-22T10:12:00.000Z',
  })

  assert.equal(entityWithActiveIncident.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.incidentState?.state, 'critical')

  const expiredAggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: entityWithActiveIncident,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 5,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.91,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 17,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
    now: '2026-04-22T10:30:01.000Z',
  })

  assert.ok(expiredAggregation)
  assert.equal(expiredAggregation.incidentState, 'stale')
  assert.ok(!['degraded', 'critical'].includes(expiredAggregation.incidentState))

  const entityWithExpiredIncident = applyPublicFlowMindPartialIncidentState({
    entityProfile: entityWithActiveIncident,
    incidentState: expiredAggregation.incidentState,
    observedAt: '2026-04-22T10:30:01.000Z',
  })

  assert.equal(entityWithExpiredIncident.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.incidentState?.state, 'stale')
  assert.notEqual(entityWithExpiredIncident.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.incidentState?.state, 'critical')
  assert.notEqual(entityWithExpiredIncident.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.incidentState?.state, 'degraded')
})

test('buildPublicFlowMindPartialAggregation signals absent telemetry instead of treating the partial as normal', () => {
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

  const aggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: entity,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 5,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.91,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 17,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
    now: '2026-04-22T10:40:01.000Z',
  })

  assert.ok(aggregation)
  assert.equal(aggregation.incidentState, 'absent')
  assert.equal(aggregation.operationalRisk, 'warning')
  assert.notEqual(aggregation.incidentState, 'normal')
})

test('reconcilePublicFlowMindPartialTelemetry consolidates a sampled request exactly once', () => {
  const entity = createTestEntity()
  const policy = {
    readinessState: 'ready' as const,
    readinessScore: 98,
    rolloutPercentage: 25,
    latencyBudgetMs: 700,
    criticalDivergenceThreshold: 0.31,
    killSwitchEnabled: false,
    enabled: true,
    activationReason: 'eligible-for-public-partial',
  }

  const registered = registerPublicFlowMindPartialSampledRequest({
    entityProfile: entity,
    requestId: 'sampled-consolidated',
    policy,
    sampledAt: '2026-04-22T10:00:00.000Z',
  })

  const reconciliation = reconcilePublicFlowMindPartialTelemetry({
    entityProfile: registered.entityProfile,
    snapshot: buildPublicFlowMindPartialTelemetrySnapshot({
      requestId: 'sampled-consolidated',
      decidedAt: '2026-04-22T10:00:20.000Z',
      policy,
      frontendDecision: {
        evaluatedAt: '2026-04-22T10:00:20.000Z',
        intent: 'assist',
        action: 'support',
        responseText: 'Aurora responde com contencao e clareza.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        latencyMs: 18,
      },
      backendDecision: {
        requestId: 'sampled-consolidated',
        evaluatedAt: '2026-04-22T10:00:20.000Z',
        intent: 'assist',
        action: 'support',
        confidence: 0.74,
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        fallbackUsed: false,
        latencyMs: 92,
      },
    }),
    now: '2026-04-22T10:00:20.000Z',
  })

  const sampledRecords = listPublicFlowMindPartialSampledRequestRecords({
    entityProfile: reconciliation.entityProfile,
  })
  const telemetrySnapshots = listPublicFlowMindPartialTelemetrySnapshots(reconciliation.entityProfile)

  assert.equal(reconciliation.status, 'consolidated')
  assert.equal(reconciliation.duplicateTelemetry, false)
  assert.equal(telemetrySnapshots.length, 1)
  assert.equal(sampledRecords[0]?.requestId, 'sampled-consolidated')
  assert.equal(sampledRecords[0]?.state, 'consolidated')

  const aggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: reconciliation.entityProfile,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 5,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.91,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 17,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
    now: '2026-04-22T10:01:00.000Z',
  })

  assert.ok(aggregation)
  assert.equal(aggregation.totalInteractions, 1)
})

test('syncPublicFlowMindPartialSampledRequestRecords expires a sampled request without telemetry and keeps aggregation uncontaminated', () => {
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

  const registered = registerPublicFlowMindPartialSampledRequest({
    entityProfile: entity,
    requestId: 'sampled-expired',
    policy: {
      readinessState: 'ready',
      readinessScore: 98,
      rolloutPercentage: 25,
      latencyBudgetMs: 700,
      criticalDivergenceThreshold: 0.31,
      killSwitchEnabled: false,
      enabled: true,
      activationReason: 'eligible-for-public-partial',
    },
    sampledAt: '2026-04-22T10:00:00.000Z',
  })

  const syncedEntity = syncPublicFlowMindPartialSampledRequestRecords({
    entityProfile: registered.entityProfile,
    now: '2026-04-22T10:05:01.000Z',
  })
  const sampledRecords = listPublicFlowMindPartialSampledRequestRecords({
    entityProfile: syncedEntity,
  })

  assert.equal(sampledRecords[0]?.state, 'expired')

  const aggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: syncedEntity,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 5,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.16,
      averageResponseTextSimilarity: 0.91,
      averageBackendLatencyMs: 28,
      averageLatencyDeltaMs: 17,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
    now: '2026-04-22T10:05:01.000Z',
  })

  assert.ok(aggregation)
  assert.equal(aggregation.incidentState, 'absent')
  assert.equal(aggregation.totalInteractions, 0)
})

test('reconcilePublicFlowMindPartialTelemetry treats repeated telemetry as idempotent', () => {
  const entity = createTestEntity()
  const policy = {
    readinessState: 'ready' as const,
    readinessScore: 98,
    rolloutPercentage: 25,
    latencyBudgetMs: 700,
    criticalDivergenceThreshold: 0.31,
    killSwitchEnabled: false,
    enabled: true,
    activationReason: 'eligible-for-public-partial',
  }
  const snapshot = buildPublicFlowMindPartialTelemetrySnapshot({
    requestId: 'sampled-idempotent',
    decidedAt: '2026-04-22T10:00:20.000Z',
    policy,
    frontendDecision: {
      evaluatedAt: '2026-04-22T10:00:20.000Z',
      intent: 'assist',
      action: 'support',
      responseText: 'Aurora responde com contencao e clareza.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      latencyMs: 18,
    },
    backendDecision: {
      requestId: 'sampled-idempotent',
      evaluatedAt: '2026-04-22T10:00:20.000Z',
      intent: 'assist',
      action: 'support',
      confidence: 0.74,
      responseText: 'Aurora responde com contencao e clareza com contexto.',
      authority: {
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
      },
      fallbackUsed: false,
      latencyMs: 92,
    },
  })

  const registered = registerPublicFlowMindPartialSampledRequest({
    entityProfile: entity,
    requestId: 'sampled-idempotent',
    policy,
    sampledAt: '2026-04-22T10:00:00.000Z',
  })
  const firstReconciliation = reconcilePublicFlowMindPartialTelemetry({
    entityProfile: registered.entityProfile,
    snapshot,
    now: '2026-04-22T10:00:20.000Z',
  })
  const secondReconciliation = reconcilePublicFlowMindPartialTelemetry({
    entityProfile: firstReconciliation.entityProfile,
    snapshot,
    now: '2026-04-22T10:00:21.000Z',
  })

  const sampledRecords = listPublicFlowMindPartialSampledRequestRecords({
    entityProfile: secondReconciliation.entityProfile,
  })
  const telemetrySnapshots = listPublicFlowMindPartialTelemetrySnapshots(secondReconciliation.entityProfile)

  assert.equal(secondReconciliation.status, 'reconciled')
  assert.equal(secondReconciliation.duplicateTelemetry, true)
  assert.equal(telemetrySnapshots.length, 1)
  assert.equal(sampledRecords[0]?.state, 'reconciled')
})

test('listPublicFlowMindPartialSampledRequestRecords surfaces missing telemetry before expiration', () => {
  const entity = createTestEntity()
  const record = buildPublicFlowMindPartialSampledRequestRecord({
    requestId: 'sampled-missing-telemetry',
    policy: {
      readinessState: 'ready',
      readinessScore: 98,
      rolloutPercentage: 25,
      latencyBudgetMs: 700,
      criticalDivergenceThreshold: 0.31,
      killSwitchEnabled: false,
      enabled: true,
      activationReason: 'eligible-for-public-partial',
    },
    sampledAt: '2026-04-22T10:00:00.000Z',
  })
  const registered = registerPublicFlowMindPartialSampledRequest({
    entityProfile: entity,
    requestId: record.requestId,
    policy: record.policy,
    sampledAt: record.sampledAt,
  })

  const sampledRecords = listPublicFlowMindPartialSampledRequestRecords({
    entityProfile: registered.entityProfile,
    now: '2026-04-22T10:01:01.000Z',
  })

  assert.equal(sampledRecords[0]?.requestId, 'sampled-missing-telemetry')
  assert.equal(sampledRecords[0]?.state, 'missing_telemetry')
})

test('buildPublicFlowMindPartialAggregation blocks increase after a recent rollout reduction by hysteresis', () => {
  let entity = createTestEntity()
  const now = Date.now()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      ...entity.runtime?.flowMind,
      publicPartial: {
        rolloutPercentage: 10,
        killSwitchEnabled: false,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
        autoRolloutPolicy: {
          lastAdjustment: {
            action: 'reduce',
            source: 'policy-auto-apply',
            fromRolloutPercentage: 20,
            toRolloutPercentage: 10,
            reason: 'guardrail de redução acionado',
            changedAt: new Date(now - (2 * 60 * 60 * 1000)).toISOString(),
          },
        },
      },
    },
  }

  for (let index = 0; index < 6; index += 1) {
    const decidedAt = new Date(now - ((5 - index) * 50 * 60 * 1000)).toISOString()
    entity = appendPublicFlowMindPartialTelemetrySnapshot(entity, buildPublicFlowMindPartialTelemetrySnapshot({
      requestId: `hysteresis-${index}`,
      policy: {
        readinessState: 'ready',
        readinessScore: 98,
        rolloutPercentage: 10,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
        killSwitchEnabled: false,
        enabled: true,
        activationReason: 'eligible-for-public-partial',
      },
      frontendDecision: {
        evaluatedAt: decidedAt,
        intent: 'assist',
        action: 'support',
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        latencyMs: 22,
      },
      backendDecision: {
        requestId: `hysteresis-${index}`,
        evaluatedAt: decidedAt,
        intent: 'assist',
        action: 'support',
        confidence: 0.75,
        responseText: 'Aurora responde com contencao e clareza com contexto.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        fallbackUsed: false,
        latencyMs: 120,
      },
      decidedAt,
    }))
  }

  const aggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: entity,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 6,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.1,
      averageResponseTextSimilarity: 0.93,
      averageBackendLatencyMs: 42,
      averageLatencyDeltaMs: 18,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
  })

  assert.ok(aggregation)
  assert.equal(aggregation.policyRecommendation.status, 'blocked')
  assert.equal(aggregation.policyRecommendation.blockedReason, 'hysteresis-recovery-active')
})

test('buildPublicFlowMindPartialAggregation arms automatic rollback when divergence becomes critically high', () => {
  let entity = createTestEntity()
  const now = Date.now()
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

  for (let index = 0; index < 3; index += 1) {
    const decidedAt = new Date(now - ((2 - index) * 10 * 60 * 1000)).toISOString()
    entity = appendPublicFlowMindPartialTelemetrySnapshot(entity, buildPublicFlowMindPartialTelemetrySnapshot({
      requestId: `rollback-divergence-${index}`,
      policy: {
        readinessState: 'ready',
        readinessScore: 98,
        rolloutPercentage: 25,
        latencyBudgetMs: 700,
        criticalDivergenceThreshold: 0.31,
        killSwitchEnabled: false,
        enabled: true,
        activationReason: 'eligible-for-public-partial',
      },
      frontendDecision: {
        evaluatedAt: decidedAt,
        intent: 'assist',
        action: 'support',
        responseText: 'Aurora responde com contencao e clareza.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        latencyMs: 18,
      },
      backendDecision: {
        requestId: `rollback-divergence-${index}`,
        evaluatedAt: decidedAt,
        intent: 'promote',
        action: 'sell',
        confidence: 0.74,
        responseText: 'Aurora intensifica a presenca para conversao imediata e proxima acao comercial.',
        authority: {
          decisionSource: 'adaptive-core',
          terminalAuthority: 'adaptive-core',
          semanticFrozen: true,
        },
        fallbackUsed: false,
        latencyMs: 130,
      },
      decidedAt,
    }))
  }

  const aggregation = buildPublicFlowMindPartialAggregation({
    entityProfile: entity,
    readiness: {
      publicShadowReadinessScore: 98,
      publicShadowReadinessState: 'ready',
      summary: 'ready',
      sampleSize: 6,
      minSampleSize: 5,
      maxAverageDivergenceScore: 0.22,
      minAverageResponseTextSimilarity: 0.82,
      maxAverageBackendLatencyMs: 450,
      maxAverageLatencyDeltaMs: 250,
      maxIntentChangedRate: 0.2,
      maxActionChangedRate: 0.2,
      maxFallbackRate: 0.15,
      averageDivergenceScore: 0.1,
      averageResponseTextSimilarity: 0.93,
      averageBackendLatencyMs: 42,
      averageLatencyDeltaMs: 18,
      intentChangedRate: 0,
      actionChangedRate: 0,
      fallbackRate: 0,
      recentTrend: 'stable',
    },
    shadowAggregation: {
      sampleSize: 6,
      averageDivergenceScore: 0.12,
      averageResponseTextSimilarity: 0.92,
      averageFrontendLatencyMs: 20,
      averageBackendLatencyMs: 120,
      averageLatencyDeltaMs: 100,
      fallbackRate: 0,
      intentChangedCount: 0,
      actionChangedCount: 0,
      authorityChangedCount: 0,
      responseTextChangedCount: 2,
      topSemanticInconsistencies: [],
      recentPattern: [],
      recentTrend: 'stable',
    },
  })

  assert.ok(aggregation)
  assert.equal(aggregation.policyRecommendation.action, 'rollback')
  assert.equal(aggregation.policyRecommendation.rollbackArmed, true)
  assert.equal(aggregation.policyRecommendation.targetRolloutPercentage, 0)
})

test('applyPublicFlowMindPartialPolicyAdjustment records rollback audit and zeros rollout safely', () => {
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
        automationMode: 'auto-apply',
      },
    },
  }

  const result = applyPublicFlowMindPartialPolicyAdjustment({
    entityProfile: entity,
    recommendation: {
      automationMode: 'auto-apply',
      action: 'rollback',
      status: 'recommended',
      currentRolloutPercentage: 25,
      targetRolloutPercentage: 0,
      stepPercentage: 25,
      sampleSize: 3,
      minSampleSize: 2,
      evaluatedAt: '2026-04-20T18:00:00.000Z',
      minimumWindowMinutes: 15,
      summary: 'Executar rollback conservador do partial.',
      reasons: ['fallback 40%', 'gatilho crítico de rollback armado'],
      hysteresisActive: true,
      rollbackArmed: true,
    },
    source: 'policy-auto-apply',
  })

  assert.equal(result.entityProfile.runtime?.flowMind?.publicPartial?.rolloutPercentage, 0)
  assert.ok(result.entityProfile.runtime?.flowMind?.publicPartial?.autoRolloutPolicy?.cooldownUntil)
  assert.equal(result.adjustment?.action, 'rollback')
  assert.equal(result.adjustment?.source, 'policy-auto-apply')
  assert.equal(result.adjustment?.fromRolloutPercentage, 25)
  assert.equal(result.adjustment?.toRolloutPercentage, 0)
})
