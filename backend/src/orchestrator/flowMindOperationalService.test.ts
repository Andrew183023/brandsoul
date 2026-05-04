import assert from 'node:assert/strict'
import test from 'node:test'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import { createOrchestratorCommand } from './orchestratorCore.js'
import { serializeFlowMindServiceSnapshot } from './flowMindComparison.js'
import { resolveFlowMindOperationalEffect } from './flowMindOperationalService.js'
import { createInitialOrchestratorState } from './orchestratorState.js'

test('resolveFlowMindOperationalEffect invokes sovereign FlowMind in shadow mode without replacing legacy flow', async () => {
  const entity = createTestEntity()
  const state = createInitialOrchestratorState({
    entityId: entity.id,
    entityProfile: entity,
    now: '2026-04-19T16:10:00.000Z',
  })
  const command = createOrchestratorCommand({
    type: 'command',
    name: 'trigger_export',
    payload: {
      exportFormat: 'post',
      summary: 'Disparar export publico',
    },
    issuedAt: '2026-04-19T16:11:00.000Z',
    source: 'user',
  })

  const result = await resolveFlowMindOperationalEffect({
    entityProfile: entity,
    state,
    command,
    now: command.issuedAt,
    flowMindService: {
      mode: 'shadow',
      async evaluateOrchestratorCommand() {
        return {
          mode: 'shadow',
          summary: {
            mode: 'shadow',
            adapterName: 'shadow-test-adapter',
            adapterLoadStatus: 'loaded',
            invokedAt: command.issuedAt,
            decisionSource: 'heuristic-base',
            terminalAuthority: 'heuristic-fallback',
            semanticFrozen: false,
            lowRiskLaneUsed: false,
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
          output: {
            decision: {
              intent: 'general',
              action: 'guide',
              confidence: 0.51,
              decisionHash: '',
              responsePlan: {
                kind: 'general',
                topic: 'shadow',
              },
              actionPayload: {},
              memoryReadSet: [],
              memoryWritePlan: [],
              expectedStateChanges: [],
            },
            decisionSource: 'heuristic-base',
            terminalAuthority: 'heuristic-fallback',
            semanticFrozen: false,
            lowRiskLaneUsed: false,
            fallbackConditions: ['shadow-test'],
            updatedMemory: {
              cognitiveState: {
                stability: 0.5,
                adaptationMomentum: 0.3,
                engagement: 0.4,
              },
              strategyProfile: {
                dominantStrategy: 'balanced-guidance',
                adaptationConfidence: 0.34,
                strategyBias: {
                  supportBias: 0.5,
                  explorationBias: 0.4,
                  conversionBias: 0.36,
                  cautionBias: 0.48,
                },
              },
              policyProfile: {
                policyMode: 'balanced',
                policyStability: 0.62,
                policyDrift: 0.08,
                confidenceAdjustmentProfile: {
                  evidenceThreshold: 2,
                },
              },
              adaptiveDecisionProfile: {
                adaptationConfidence: 0.28,
                decisionDrift: 0.06,
                safetyProfile: {
                  criticalConfidenceThreshold: 0.84,
                  minimumEvidence: 2,
                  killSwitchEnabled: false,
                },
                explorationVsExploitationBalance: {
                  explorationBias: 0.5,
                  exploitationBias: 0.5,
                },
              },
              historicalSignals: {
                totalInteractions: 0,
                reliableEvidenceCount: 0,
                rollingSuccessRate: 0.5,
                rollingContinuationRate: 0.5,
                rollingEngagementDelta: 0,
              },
              episodicMemory: {
                entries: [],
              },
            },
            updatedProfiles: {
              cognitiveState: {
                stability: 0.5,
                adaptationMomentum: 0.3,
                engagement: 0.4,
              },
              strategyProfile: {
                dominantStrategy: 'balanced-guidance',
                adaptationConfidence: 0.34,
                strategyBias: {
                  supportBias: 0.5,
                  explorationBias: 0.4,
                  conversionBias: 0.36,
                  cautionBias: 0.48,
                },
              },
              policyProfile: {
                policyMode: 'balanced',
                policyStability: 0.62,
                policyDrift: 0.08,
                confidenceAdjustmentProfile: {
                  evidenceThreshold: 2,
                },
              },
              adaptiveDecisionProfile: {
                adaptationConfidence: 0.28,
                decisionDrift: 0.06,
                safetyProfile: {
                  criticalConfidenceThreshold: 0.84,
                  minimumEvidence: 2,
                  killSwitchEnabled: false,
                },
                explorationVsExploitationBalance: {
                  explorationBias: 0.5,
                  exploitationBias: 0.5,
                },
              },
              historicalSignals: {
                totalInteractions: 0,
                reliableEvidenceCount: 0,
                rollingSuccessRate: 0.5,
                rollingContinuationRate: 0.5,
                rollingEngagementDelta: 0,
              },
            },
          },
        }
      },
    },
  })

  assert.ok(result.flowMind)
  assert.ok(result.sovereignFlowMind)
  assert.ok(result.flowMindComparison)
  assert.equal(result.sovereignFlowMind?.summary.mode, 'shadow')
  assert.equal(result.sovereignFlowMind?.summary.objectiveType, 'engage')
  assert.equal(result.flowMindComparison?.legacyDecision.commandId, command.commandId)
  assert.equal(result.flowMindComparison?.flowMindDecision.commandName, command.name)
  assert.equal(result.flowMindComparison?.metrics.sampleSize, 1)
  assert.match(result.entityProfile.metadata.notes?.[0] ?? '', /^flowmind-service:/)
  const persistedSnapshot = JSON.parse((result.entityProfile.metadata.notes?.[0] ?? '').slice('flowmind-service:'.length)) as {
    summary: { adapterName: string }
    comparison: { divergenceType: string }
    authority?: { authorityGranted: boolean }
  }
  assert.equal(persistedSnapshot.summary.adapterName, 'shadow-test-adapter')
  assert.equal(typeof persistedSnapshot.comparison.divergenceType, 'string')
  assert.equal(persistedSnapshot.authority?.authorityGranted, true)
  assert.equal(Array.isArray(result.domainCommands), true)
})

test('resolveFlowMindOperationalEffect can grant partial authority for eligible active entities in safe zones', async () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      mode: 'active',
      updatedAt: '2026-04-19T18:00:00.000Z',
    },
  }
  entity.metadata.notes = Array.from({ length: 4 }, (_, index) => serializeFlowMindServiceSnapshot({
    summary: {
      mode: 'active',
      adapterName: 'shadow-test-adapter',
      adapterLoadStatus: 'loaded',
      invokedAt: `2026-04-19T17:0${index}:00.000Z`,
      decisionSource: 'adaptive-core',
      terminalAuthority: 'adaptive-core',
      semanticFrozen: true,
      fallbackConditions: [],
      fallbackUsed: false,
      decision: {
        intent: 'encourage_export',
        action: 'sell',
        confidence: 0.71,
      },
      objectiveType: 'convert',
    },
    comparison: {
      legacyDecision: {
        commandId: `cmd-prev-${index}`,
        commandName: 'trigger_export',
        evaluatedAt: `2026-04-19T17:0${index}:00.000Z`,
        authority: 'orchestrator-legacy',
        intent: 'encourage_export',
        action: 'triggerExport',
        confidence: 0.79,
      },
      flowMindDecision: {
        commandId: `cmd-prev-${index}`,
        commandName: 'trigger_export',
        evaluatedAt: `2026-04-19T17:0${index}:00.000Z`,
        intent: 'encourage_export',
        action: 'sell',
        confidence: 0.71,
        decisionSource: 'adaptive-core',
        terminalAuthority: 'adaptive-core',
        semanticFrozen: true,
        fallbackUsed: false,
      },
      divergenceType: 'aligned',
      semanticDifference: {
        intentChanged: false,
        actionChanged: false,
        confidenceDelta: 0.03,
        summary: 'Legado e FlowMind ficaram semanticamente alinhados.',
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
        divergenceScore: 0.12,
        stabilityScore: 0.88,
        fallbackRate: 0,
        adaptiveSuccessRate: 1,
        sampleSize: 4,
      },
    },
  }))

  const state = createInitialOrchestratorState({
    entityId: entity.id,
    entityProfile: entity,
    now: '2026-04-19T18:10:00.000Z',
  })
  const command = createOrchestratorCommand({
    type: 'command',
    name: 'trigger_export',
    payload: {
      exportFormat: 'post',
      summary: 'Disparar export publico controlado',
    },
    issuedAt: '2026-04-19T18:11:00.000Z',
    source: 'user',
  })

  const result = await resolveFlowMindOperationalEffect({
    entityProfile: entity,
    state,
    command,
    now: command.issuedAt,
    flowMindService: {
      mode: 'shadow',
      async evaluateOrchestratorCommand() {
        return {
          mode: 'active',
          summary: {
            mode: 'active',
            adapterName: 'shadow-test-adapter',
            adapterLoadStatus: 'loaded',
            invokedAt: command.issuedAt,
            decisionSource: 'adaptive-core',
            terminalAuthority: 'adaptive-core',
            semanticFrozen: true,
            lowRiskLaneUsed: false,
            fallbackConditions: [],
            fallbackUsed: false,
            decision: {
              intent: 'encourage_export',
              action: 'sell',
              confidence: 0.72,
            },
            objectiveType: 'convert',
          },
          output: {
            decision: {
              intent: 'encourage_export',
              action: 'sell',
              confidence: 0.72,
              decisionHash: '',
              responsePlan: {
                kind: 'promotion',
                topic: 'export controlado',
                intentGoal: 'release-export-authority',
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
            updatedMemory: {
              cognitiveState: {
                stability: 0.68,
                adaptationMomentum: 0.42,
                engagement: 0.51,
              },
              strategyProfile: {
                dominantStrategy: 'conversion-pressure',
                adaptationConfidence: 0.61,
                strategyBias: {
                  supportBias: 0.38,
                  explorationBias: 0.26,
                  conversionBias: 0.72,
                  cautionBias: 0.32,
                },
              },
              policyProfile: {
                policyMode: 'balanced',
                policyStability: 0.72,
                policyDrift: 0.04,
                confidenceAdjustmentProfile: {
                  evidenceThreshold: 2,
                },
              },
              adaptiveDecisionProfile: {
                adaptationConfidence: 0.64,
                decisionDrift: 0.08,
                safetyProfile: {
                  criticalConfidenceThreshold: 0.84,
                  minimumEvidence: 2,
                  killSwitchEnabled: false,
                },
                explorationVsExploitationBalance: {
                  explorationBias: 0.38,
                  exploitationBias: 0.62,
                },
              },
              historicalSignals: {
                totalInteractions: 9,
                reliableEvidenceCount: 8,
                rollingSuccessRate: 0.82,
                rollingContinuationRate: 0.76,
                rollingEngagementDelta: 0.22,
              },
              episodicMemory: {
                entries: [],
              },
            },
            updatedProfiles: {
              cognitiveState: {
                stability: 0.68,
                adaptationMomentum: 0.42,
                engagement: 0.51,
              },
              strategyProfile: {
                dominantStrategy: 'conversion-pressure',
                adaptationConfidence: 0.61,
                strategyBias: {
                  supportBias: 0.38,
                  explorationBias: 0.26,
                  conversionBias: 0.72,
                  cautionBias: 0.32,
                },
              },
              policyProfile: {
                policyMode: 'balanced',
                policyStability: 0.72,
                policyDrift: 0.04,
                confidenceAdjustmentProfile: {
                  evidenceThreshold: 2,
                },
              },
              adaptiveDecisionProfile: {
                adaptationConfidence: 0.64,
                decisionDrift: 0.08,
                safetyProfile: {
                  criticalConfidenceThreshold: 0.84,
                  minimumEvidence: 2,
                  killSwitchEnabled: false,
                },
                explorationVsExploitationBalance: {
                  explorationBias: 0.38,
                  exploitationBias: 0.62,
                },
              },
              historicalSignals: {
                totalInteractions: 9,
                reliableEvidenceCount: 8,
                rollingSuccessRate: 0.82,
                rollingContinuationRate: 0.76,
                rollingEngagementDelta: 0.22,
              },
            },
          },
        }
      },
    },
  })

  assert.equal(result.partialAuthority?.applied, true)
  assert.equal(result.partialAuthority?.zone, 'safe')
  assert.equal(result.partialAuthority?.reason, 'eligible-for-partial-authority')
  assert.equal(result.flowMindAuthority?.authorityEligible, true)
  assert.equal(result.flowMindAuthority?.authorityGranted, true)
  assert.equal(result.flowMindAuthority?.authorityCommand, 'trigger_export')
  assert.equal(result.flowMind.lineage.entityAction.type, 'triggerExport')
  assert.equal(result.flowMindComparison?.metrics.sampleSize, 5)
  })

  test('resolveFlowMindOperationalEffect propagates rolled-back action transactions without side effects', async () => {
    const entity = createTestEntity()
    entity.metadata.updatedAt = '2026-04-19T16:11:00.000Z'
    entity.metadata.notes = [
      'flowmind:decision:2026-04-19T16:11:00.000Z:encourage_export:triggerExport:0.700',
    ]

    const state = createInitialOrchestratorState({
      entityId: entity.id,
      entityProfile: entity,
      now: '2026-04-19T16:10:00.000Z',
    })
    const command = createOrchestratorCommand({
      type: 'command',
      name: 'trigger_export',
      payload: {
        exportFormat: 'post',
        summary: 'Disparar export publico',
      },
      commandId: 'idem-rolled-back',
      issuedAt: '2026-04-19T16:11:00.000Z',
      source: 'user',
    })

    const result = await resolveFlowMindOperationalEffect({
      entityProfile: entity,
      state,
      command,
      now: command.issuedAt,
    })

    assert.equal(result.actionTransaction.rolledBack, false)
    assert.equal(result.actionTransaction.failure, undefined)
    assert.equal(result.flowMind.decision.intent, 'observe')
    assert.deepEqual(result.domainCommands, [])
    assert.deepEqual(result.uiEffects, [])
    assert.deepEqual(result.scheduledTasks, [])
  })

test('resolveFlowMindOperationalEffect keeps fallback safe when sovereign authority is unstable', async () => {
  const entity = createTestEntity()
  entity.runtime = {
    ...entity.runtime,
    flowMind: {
      mode: 'active',
      updatedAt: '2026-04-19T19:30:00.000Z',
    },
  }

  const state = createInitialOrchestratorState({
    entityId: entity.id,
    entityProfile: entity,
    now: '2026-04-19T19:31:00.000Z',
  })
  const command = createOrchestratorCommand({
    type: 'command',
    name: 'resume_birth',
    issuedAt: '2026-04-19T19:32:00.000Z',
    source: 'user',
  })

  const result = await resolveFlowMindOperationalEffect({
    entityProfile: entity,
    state,
    command,
    now: command.issuedAt,
    flowMindService: {
      mode: 'active',
      async evaluateOrchestratorCommand() {
        return {
          mode: 'active',
          summary: {
            mode: 'active',
            adapterName: 'shadow-test-adapter',
            adapterLoadStatus: 'loaded',
            invokedAt: command.issuedAt,
            decisionSource: 'heuristic-base',
            terminalAuthority: 'heuristic-fallback',
            semanticFrozen: false,
            lowRiskLaneUsed: false,
            fallbackConditions: ['stability-guard'],
            fallbackUsed: true,
            fallbackReason: 'stability-guard',
            decision: {
              intent: 'general',
              action: 'guide',
              confidence: 0.51,
            },
            objectiveType: 'engage',
          },
          output: {
            decision: {
              intent: 'general',
              action: 'guide',
              confidence: 0.51,
              decisionHash: '',
              responsePlan: {
                kind: 'general',
                topic: 'fallback seguro',
              },
              actionPayload: {},
              memoryReadSet: [],
              memoryWritePlan: [],
              expectedStateChanges: [],
            },
            decisionSource: 'heuristic-base',
            terminalAuthority: 'heuristic-fallback',
            semanticFrozen: false,
            lowRiskLaneUsed: false,
            fallbackConditions: ['stability-guard'],
            updatedMemory: {
              cognitiveState: {
                stability: 0.5,
                adaptationMomentum: 0.2,
                engagement: 0.4,
              },
              strategyProfile: {
                dominantStrategy: 'balanced-guidance',
                adaptationConfidence: 0.3,
                strategyBias: {
                  supportBias: 0.5,
                  explorationBias: 0.4,
                  conversionBias: 0.3,
                  cautionBias: 0.5,
                },
              },
              policyProfile: {
                policyMode: 'balanced',
                policyStability: 0.61,
                policyDrift: 0.09,
                confidenceAdjustmentProfile: {
                  evidenceThreshold: 2,
                },
              },
              adaptiveDecisionProfile: {
                adaptationConfidence: 0.28,
                decisionDrift: 0.06,
                safetyProfile: {
                  criticalConfidenceThreshold: 0.84,
                  minimumEvidence: 2,
                  killSwitchEnabled: false,
                },
                explorationVsExploitationBalance: {
                  explorationBias: 0.5,
                  exploitationBias: 0.5,
                },
              },
              historicalSignals: {
                totalInteractions: 0,
                reliableEvidenceCount: 0,
                rollingSuccessRate: 0.5,
                rollingContinuationRate: 0.5,
                rollingEngagementDelta: 0,
              },
              episodicMemory: {
                entries: [],
              },
            },
            updatedProfiles: {
              cognitiveState: {
                stability: 0.5,
                adaptationMomentum: 0.2,
                engagement: 0.4,
              },
              strategyProfile: {
                dominantStrategy: 'balanced-guidance',
                adaptationConfidence: 0.3,
                strategyBias: {
                  supportBias: 0.5,
                  explorationBias: 0.4,
                  conversionBias: 0.3,
                  cautionBias: 0.5,
                },
              },
              policyProfile: {
                policyMode: 'balanced',
                policyStability: 0.61,
                policyDrift: 0.09,
                confidenceAdjustmentProfile: {
                  evidenceThreshold: 2,
                },
              },
              adaptiveDecisionProfile: {
                adaptationConfidence: 0.28,
                decisionDrift: 0.06,
                safetyProfile: {
                  criticalConfidenceThreshold: 0.84,
                  minimumEvidence: 2,
                  killSwitchEnabled: false,
                },
                explorationVsExploitationBalance: {
                  explorationBias: 0.5,
                  exploitationBias: 0.5,
                },
              },
              historicalSignals: {
                totalInteractions: 0,
                reliableEvidenceCount: 0,
                rollingSuccessRate: 0.5,
                rollingContinuationRate: 0.5,
                rollingEngagementDelta: 0,
              },
            },
          },
        }
      },
    },
  })

  assert.equal(result.partialAuthority?.applied, false)
  assert.equal(result.partialAuthority?.reason, 'adaptive-authority-not-stable')
  assert.equal(result.flowMindAuthority?.authorityGranted, true)
  assert.equal(result.flowMindComparison?.flowMindDecision.fallbackUsed, true)
})
