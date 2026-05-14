import assert from 'node:assert/strict'
import test from 'node:test'

import { createRuntimeGovernanceService } from './runtimeGovernanceService.js'

test('runtime governance fails startup for critical subsystem failures', () => {
  const governance = createRuntimeGovernanceService()

  const decision = governance.registerStartupFailure({
    subsystem: 'market-signal-runtime',
    criticality: 'critical',
    message: 'provider unavailable',
    observedAt: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(decision.action, 'fail-startup')
  const status = governance.getStatus()
  assert.equal(status.runtimeMode, 'normal')
  assert.equal(status.hardReadinessFailure?.subsystem, 'market-signal-runtime')
  assert.equal(status.hardReadinessFailure?.criticality, 'critical')
})

test('runtime governance enters degraded mode for degraded-allowed subsystem failures', () => {
  const governance = createRuntimeGovernanceService()

  const decision = governance.registerStartupFailure({
    subsystem: 'negative-attribution-runtime',
    criticality: 'degraded-allowed',
    message: 'snapshot lag',
    observedAt: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(decision.action, 'enter-degraded-mode')

  const status = governance.getStatus()
  assert.equal(status.runtimeMode, 'degraded')
  assert.ok(status.degradedReason?.includes('negative-attribution-runtime'))
  assert.ok(status.blockedCapabilities.includes('orchestrator.command.execute'))
  assert.ok(status.blockedCapabilities.includes('public.interaction.action.execute'))
})

test('runtime governance blocks high-risk capability in degraded mode', () => {
  const governance = createRuntimeGovernanceService()
  governance.registerStartupFailure({
    subsystem: 'adaptive-weight-snapshot-runtime',
    criticality: 'degraded-allowed',
    message: 'missing weights',
  })

  const decision = governance.evaluateCapability({
    capability: 'orchestrator.command.execute',
    riskLevel: 'high',
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(decision.runtimeMode, 'degraded')
  assert.equal(decision.governanceDecision.allowed, false)
  assert.equal(decision.governanceDecision.reason, 'degraded-high-risk-blocked')
})

test('runtime governance keeps low-risk capability available with metadata', () => {
  const governance = createRuntimeGovernanceService()
  governance.registerStartupFailure({
    subsystem: 'terminal-failure-detection-runtime',
    criticality: 'degraded-allowed',
    message: 'cannot refresh',
  })

  const decision = governance.evaluateCapability({
    capability: 'public.interaction.respond',
    riskLevel: 'low',
    now: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(decision.runtimeMode, 'degraded')
  assert.equal(decision.governanceDecision.allowed, true)
  assert.equal(decision.governanceDecision.reason, 'normal-mode')
  assert.ok(Array.isArray(decision.blockedCapabilities))
})

test('runtime governance keeps startup running for optional subsystem failures', () => {
  const governance = createRuntimeGovernanceService()

  const decision = governance.registerStartupFailure({
    subsystem: 'shadow-proposal-confidence-runtime',
    criticality: 'optional',
    message: 'snapshot unavailable',
    observedAt: '2026-01-01T00:00:00.000Z',
  })

  assert.equal(decision.action, 'continue-optional')
  const status = governance.getStatus()
  assert.equal(status.runtimeMode, 'normal')
  assert.equal(status.hardReadinessFailure, undefined)
})
