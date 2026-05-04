import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FastifyInstance } from 'fastify'
import { SignJWT, importPKCS8 } from 'jose'

import { createTestEntity } from '../brain/flowmind/testUtils.js'
import type { BackendDatabase } from '../db/index.js'
import type { JobWorker } from '../jobs/index.js'
import type { FlowMindApprovalQueue } from '../orchestrator/approvalQueue.js'
import type { MultiEntityRegistry } from '../orchestrator/multiEntityRegistry.js'
import type { PortfolioProposalLifecycleService } from '../orchestrator/portfolioProposalLifecycleService.js'
import type { SovereignMutationCommandService } from '../orchestrator/sovereignMutationCommandService.js'
import { PortfolioLeadRepository } from '../repositories/portfolioLeadRepository.js'
import { createDefaultEntityCognitiveMemory } from '../flowmind/index.js'
import { buildServer } from '../server.js'
import { runWithMutationAuthority } from '../sovereignty/authorityBoundary.js'

type AppWithContext = FastifyInstance & {
  backendContext: {
    connection: BackendDatabase
    multiEntityRegistry: MultiEntityRegistry
    flowMindApprovalQueue: FlowMindApprovalQueue
    portfolioProposalLifecycleService: PortfolioProposalLifecycleService
    sovereignMutationCommandService: SovereignMutationCommandService
    socialSignalRepository: {
      registerSignal(input: {
        entityId: string
        type: 'viewed' | 'followed' | 'shared' | 'interacted' | 'exported'
        timestamp?: string
        source?: string
        weight?: number
        metadata?: Record<string, unknown>
      }): Promise<unknown>
    }
    jobQueue: {
      getJob(id: string): Promise<{ id: string; type: string; status: string; payload: Record<string, unknown> } | null>
    }
    entityRepository: {
      createEntity(input: {
        id: string
        entityProfile: unknown
        ownerId?: string
        ownerUserId?: number
        ownerTenantId?: number
      }): Promise<unknown>
      getEntityById(id: string): Promise<{ entityProfile: { metadata: { notes?: string[] } } } | null>
    }
    entityCognitiveMemoryStore: {
      get(entityId: string): Promise<{ episodicMemory: { entries: Array<{ id: string; context?: Record<string, unknown> }> } } | null>
    }
    socialSignalRepositoryFull?: {
      registerSignal(input: {
        entityId: string
        type: 'viewed' | 'followed' | 'shared' | 'interacted' | 'exported'
        timestamp?: string
        source?: string
        weight?: number
        metadata?: Record<string, unknown>
      }): Promise<unknown>
    }
    connectionRun?: BackendDatabase
    jobWorker: JobWorker
  }
}

async function logRevenueConfirmationEvent(app: AppWithContext, args: {
  eventId: string
  entityId: string
  amount: number
  invoiceId?: string
  paymentId?: string
  contractId?: string
  timestamp: string
}) {
  await app.backendContext.connection.run(
    `
      INSERT INTO entity_event_log (id, entity_id, type, payload, timestamp, caused_by_command_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    args.eventId,
    args.entityId,
    'billing.payment.confirmed',
    JSON.stringify({
      amount: args.amount,
      invoiceId: args.invoiceId,
      paymentId: args.paymentId,
      contractId: args.contractId,
    }),
    args.timestamp,
    null,
  )
}

async function createAccessToken(args: {
  userId: number
  tenantId: number
  roles: string[]
  privateKeyPem: string
  kid: string
}) {
  const privateKey = await importPKCS8(args.privateKeyPem, 'RS256')
  return new SignJWT({
    sub: String(args.userId),
    tenant_id: String(args.tenantId),
    roles: args.roles,
    ver: 1,
    jti: `portfolio-admin-${args.userId}-${args.tenantId}-${args.roles.join('-')}`,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: args.kid })
    .setIssuer('brandsoul-auth-portfolio-admin')
    .setAudience('brandsoul-api-portfolio-admin')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

async function createTestApp() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'brandsoul-portfolio-admin-'))
  const privateKeyFile = path.join(workspace, 'auth-private.pem')
  const publicKeyFile = path.join(workspace, 'auth-public.pem')
  const configuredKid = 'portfolio-admin-test-kid'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const previousEnv = {
    jwtSecret: process.env.JWT_SECRET,
    sqliteFile: process.env.SQLITE_FILE,
    assetStorageDir: process.env.ASSET_STORAGE_DIR,
    authIssuer: process.env.AUTH_ISSUER,
    authAudience: process.env.AUTH_AUDIENCE,
    authKid: process.env.AUTH_ACTIVE_KID,
    authPrivateKeyRef: process.env.AUTH_PRIVATE_KEY_REF,
    authPublicKeyPath: process.env.AUTH_PUBLIC_KEY_PATH,
  }

  process.env.JWT_SECRET = 'portfolio-admin-test-secret'
  process.env.SQLITE_FILE = path.join(workspace, 'portfolio-admin.sqlite')
  process.env.ASSET_STORAGE_DIR = path.join(workspace, 'assets')
  process.env.AUTH_ISSUER = 'brandsoul-auth-portfolio-admin'
  process.env.AUTH_AUDIENCE = 'brandsoul-api-portfolio-admin'
  process.env.AUTH_ACTIVE_KID = configuredKid
  process.env.AUTH_PRIVATE_KEY_REF = privateKeyFile
  process.env.AUTH_PUBLIC_KEY_PATH = publicKeyFile

  await writeFile(privateKeyFile, privateKey, 'utf-8')
  await writeFile(publicKeyFile, publicKey, 'utf-8')

  const app = await buildServer() as AppWithContext
  await app.backendContext.jobWorker.stop()

  return {
    app,
    privateKeyPem: privateKey,
    configuredKid,
    async close() {
      await app.close()
      await rm(workspace, { recursive: true, force: true })

      if (typeof previousEnv.jwtSecret === 'undefined') delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = previousEnv.jwtSecret
      if (typeof previousEnv.sqliteFile === 'undefined') delete process.env.SQLITE_FILE
      else process.env.SQLITE_FILE = previousEnv.sqliteFile
      if (typeof previousEnv.assetStorageDir === 'undefined') delete process.env.ASSET_STORAGE_DIR
      else process.env.ASSET_STORAGE_DIR = previousEnv.assetStorageDir
      if (typeof previousEnv.authIssuer === 'undefined') delete process.env.AUTH_ISSUER
      else process.env.AUTH_ISSUER = previousEnv.authIssuer
      if (typeof previousEnv.authAudience === 'undefined') delete process.env.AUTH_AUDIENCE
      else process.env.AUTH_AUDIENCE = previousEnv.authAudience
      if (typeof previousEnv.authKid === 'undefined') delete process.env.AUTH_ACTIVE_KID
      else process.env.AUTH_ACTIVE_KID = previousEnv.authKid
      if (typeof previousEnv.authPrivateKeyRef === 'undefined') delete process.env.AUTH_PRIVATE_KEY_REF
      else process.env.AUTH_PRIVATE_KEY_REF = previousEnv.authPrivateKeyRef
      if (typeof previousEnv.authPublicKeyPath === 'undefined') delete process.env.AUTH_PUBLIC_KEY_PATH
      else process.env.AUTH_PUBLIC_KEY_PATH = previousEnv.authPublicKeyPath
    },
  }
}

async function seedPortfolioEntity(app: AppWithContext, entityId = 'entity-portfolio-1') {
  const entity = createTestEntity()
  entity.id = entityId
  entity.metadata.confidence = 0.74
  entity.social = { ...entity.social, publicName: entityId === 'entity-portfolio-1' ? 'Portfolio Entity One' : `Portfolio ${entityId}` }
  entity.export = { ...entity.export, formatsEnabled: [] }

  await runWithMutationAuthority({
    source: 'backend/src/api/portfolioAdminRoutes.test.ts#seedPortfolioEntity',
    viaExecutor: true,
  }, async () => {
    await app.backendContext.entityRepository.createEntity({
      id: entity.id,
      ownerId: 'user:1:tenant:1',
      ownerUserId: 1,
      ownerTenantId: 1,
      entityProfile: entity,
    })
    await app.backendContext.multiEntityRegistry.registerEntity({
      entityId: entity.id,
      entityType: 'legal-brand',
      market: 'legal',
      lifecycleState: 'sandbox',
      autonomyLevel: 'partial',
      riskLevel: 'medium',
      memoryStatus: 'stable',
      activeGoals: [],
      operatingConstraints: {},
      healthScore: 0.72,
      leadGenerationScore: 0.31,
      memoryConfidence: 0.68,
      autonomyReadiness: 0.66,
      riskScore: 0.28,
      actionQueue: [],
      rollbackState: { active: false },
      createdAt: '2026-05-03T12:00:00.000Z',
      updatedAt: '2026-05-03T12:00:00.000Z',
    })
  })

  await app.backendContext.socialSignalRepository.registerSignal({
    entityId: entity.id,
    type: 'interacted',
    timestamp: '2026-05-03T12:10:00.000Z',
    source: 'public-chat',
  })

  return entity.id
}

async function runPortfolioScan(app: AppWithContext, now = '2026-05-03T12:15:00.000Z') {
  await app.backendContext.sovereignMutationCommandService.submitCommand({
    type: 'portfolio.scan',
    commandId: `portfolio-scan:test:${now}`,
    now,
  })
}

test('portfolio admin reads are pure and proposals come from portfolio scan command', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedPortfolioEntity(harness.app)
    await runPortfolioScan(harness.app)
    const leadRepository = new PortfolioLeadRepository(harness.app.backendContext.connection)
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const [signals, metrics, funnel, proposals] = await Promise.all([
      harness.app.inject({ method: 'GET', url: '/admin/portfolio/lead-signals', headers: { authorization: `Bearer ${token}` } }),
      harness.app.inject({ method: 'GET', url: '/admin/portfolio/metrics', headers: { authorization: `Bearer ${token}` } }),
      harness.app.inject({ method: 'GET', url: '/admin/portfolio/lead-funnel', headers: { authorization: `Bearer ${token}` } }),
      harness.app.inject({ method: 'GET', url: '/admin/portfolio/proposals', headers: { authorization: `Bearer ${token}` } }),
    ])

    assert.equal(signals.statusCode, 200)
    assert.equal(metrics.statusCode, 200)
    assert.equal(funnel.statusCode, 200)
    assert.equal(proposals.statusCode, 200)

    const signalsBody = signals.json()
    const metricsBody = metrics.json()
    const funnelBody = funnel.json()
    const proposalsBody = proposals.json()
    const leads = await leadRepository.list()

    assert.equal(signalsBody.leadSignals.some((signal: { entityId: string }) => signal.entityId === entityId), true)
    assert.equal(metricsBody.metrics.portfolio.entityCount, 1)
    assert.equal(metricsBody.metrics.entities[0].entityId, entityId)
    assert.equal(typeof metricsBody.metrics.entities[0].opportunityScore, 'number')
    assert.equal(funnelBody.leadFunnel.rawSignals >= 1, true)
    assert.equal(funnelBody.leadFunnel.routedLeads >= 1, true)
    assert.equal(leads.some((lead) => lead.entityId === entityId), true)
    assert.equal(proposalsBody.proposals.some((proposal: { entityId: string }) => proposal.entityId === entityId), true)
    assert.equal(proposalsBody.proposals.some((proposal: { type: string }) => proposal.type === 'route_lead'), false)
    assert.deepEqual(proposalsBody.safeMode, {
      executionBlocked: true,
      moneyMovementEnabled: false,
      campaignExecutionEnabled: false,
      pricingChangeEnabled: false,
    })

    const approvals = await harness.app.backendContext.flowMindApprovalQueue.list()
    assert.equal(approvals.length >= 1, true)
  } finally {
    await harness.close()
  }
})

test('portfolio lead routing executes once, stores attribution, and replays idempotently', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedPortfolioEntity(harness.app)
    await runPortfolioScan(harness.app, '2026-05-03T12:15:00.000Z')
    const leadRepository = new PortfolioLeadRepository(harness.app.backendContext.connection)
    const [lead] = await leadRepository.list()

    assert.equal(lead?.entityId, entityId)
    assert.equal(typeof lead?.signalId, 'string')
    assert.equal(lead?.routingStatus, 'intake_requested')
    assert.equal(lead?.status, 'routed')
    assert.equal(lead?.attribution.signalId, lead?.signalId)
    assert.equal(lead?.attribution.action, 'trigger_intake')
    assert.equal((lead?.payload.externalExecution as { externalReferenceId?: string } | undefined)?.externalReferenceId?.startsWith('intake-'), true)

    const storedIntakeCount = await harness.app.backendContext.connection.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM entity_portfolio_lead_intake WHERE lead_id = ?`,
      lead?.leadId,
    )
    assert.equal(storedIntakeCount?.count, 1)

    const replay = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'portfolio.lead.route',
      commandId: String(lead?.attributedCommandId),
      entityId,
      signalId: String(lead?.signalId),
      source: String(lead?.source),
      timestamp: String(lead?.timestamp),
      action: 'trigger_intake',
    }) as { changed: boolean; externalReferenceId?: string; executionResult?: { referenceType: string } }

    assert.equal(replay.changed, false)
    assert.equal(replay.executionResult?.referenceType, 'lead_intake')
    assert.equal(replay.externalReferenceId?.startsWith('intake-'), true)

    const storedLeadCount = await harness.app.backendContext.connection.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM entity_portfolio_lead WHERE signal_id = ?`,
      lead?.signalId,
    )
    const routedEventCount = await harness.app.backendContext.connection.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM entity_event_log WHERE caused_by_command_id = ?`,
      lead?.attributedCommandId,
    )

    assert.equal(storedLeadCount?.count, 1)
    assert.equal(routedEventCount?.count, 2)
  } finally {
    await harness.close()
  }
})

test('trigger_outreach enqueues a real outbound job with external reference id', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedPortfolioEntity(harness.app, 'entity-portfolio-outreach')
    await harness.app.backendContext.connection.run(
      `
        INSERT INTO entity_portfolio_lead_signal (
          signal_id,
          entity_id,
          market,
          source,
          intent,
          urgency,
          estimated_value,
          confidence,
          recommended_action,
          payload_json,
          detected_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'signal-outreach-1',
      entityId,
      'legal',
      'manual-test',
      'follow_up',
      'medium',
      0.6,
      0.7,
      'route_lead',
      JSON.stringify({ source: 'test' }),
      '2026-05-03T12:00:00.000Z',
      '2026-05-03T12:00:00.000Z',
      '2026-05-03T12:00:00.000Z',
    )

    const result = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'portfolio.lead.route',
      commandId: 'portfolio-lead-route:signal-outreach-1',
      entityId,
      signalId: 'signal-outreach-1',
      source: 'manual-test',
      timestamp: '2026-05-03T12:05:00.000Z',
      action: 'trigger_outreach',
      metadata: {
        channel: 'email',
        targetIdentifier: 'prospect@example.com',
      },
    }) as { changed: boolean; externalReferenceId?: string; executionResult?: { channel?: string; targetIdentifier?: string; referenceType: string } }

    assert.equal(result.changed, true)
    assert.equal(result.executionResult?.referenceType, 'job')
    assert.equal(result.executionResult?.channel, 'email')
    assert.equal(result.executionResult?.targetIdentifier, 'prospect@example.com')
    assert.equal(result.externalReferenceId?.startsWith('lead-outreach-'), true)

    const job = await harness.app.backendContext.jobQueue.getJob(String(result.externalReferenceId))
    assert.equal(job?.type, 'LEAD_OUTREACH_DISPATCH')
    assert.equal(job?.status, 'pending')
    assert.equal(job?.payload.channel, 'email')
    assert.equal(job?.payload.targetIdentifier, 'prospect@example.com')
    assert.equal(job?.payload.entityId, entityId)

    const replay = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'portfolio.lead.route',
      commandId: 'portfolio-lead-route:signal-outreach-1',
      entityId,
      signalId: 'signal-outreach-1',
      source: 'manual-test',
      timestamp: '2026-05-03T12:05:00.000Z',
      action: 'trigger_outreach',
      metadata: {
        channel: 'email',
        targetIdentifier: 'prospect@example.com',
      },
    }) as { changed: boolean; externalReferenceId?: string }

    assert.equal(replay.changed, false)
    assert.equal(replay.externalReferenceId, result.externalReferenceId)
  } finally {
    await harness.close()
  }
})

test('autonomous lifecycle progresses routed lead through qualify, contact, and convert from strong signals and memory patterns', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedPortfolioEntity(harness.app, 'entity-autonomous-convert')
    await runWithMutationAuthority({
      source: 'backend/src/api/portfolioAdminRoutes.test.ts#autonomousMemorySeed',
      viaExecutor: true,
    }, async () => {
      await harness.app.backendContext.connection.run(
        `
          INSERT INTO entity_cognitive_memory (entity_id, memory_json, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(entity_id) DO UPDATE SET memory_json = excluded.memory_json, updated_at = excluded.updated_at
        `,
        entityId,
        JSON.stringify({
          ...createDefaultEntityCognitiveMemory(),
          historicalSignals: {
            ...createDefaultEntityCognitiveMemory().historicalSignals,
            rollingSuccessRate: 0.82,
            reliableEvidenceCount: 3,
          },
        }),
        '2026-05-03T12:00:00.000Z',
        '2026-05-03T12:00:00.000Z',
      )
    })

    await harness.app.backendContext.connection.run(
      `
        INSERT INTO entity_portfolio_lead_signal (
          signal_id, entity_id, market, source, intent, urgency, estimated_value, confidence, recommended_action, payload_json, detected_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'signal-autonomous-convert-1',
      entityId,
      'legal',
      'manual-test',
      'high-intent',
      'high',
      0.88,
      0.91,
      'route_lead',
      JSON.stringify({
        channelFeedback: {
          sentiment: 'positive',
          replyReceived: true,
        },
        revenueCandidate: {
          amount: 3200,
          currency: 'USD',
          invoiceId: 'inv-auto-1',
          paymentId: 'pay-auto-1',
          confirmedByEvent: {
            eventId: 'evt-auto-revenue-1',
          },
        },
      }),
      '2026-05-03T12:00:00.000Z',
      '2026-05-03T12:00:00.000Z',
      '2026-05-03T12:00:00.000Z',
    )

    await logRevenueConfirmationEvent(harness.app, {
      eventId: 'evt-auto-revenue-1',
      entityId,
      amount: 3200,
      invoiceId: 'inv-auto-1',
      paymentId: 'pay-auto-1',
      timestamp: '2026-05-03T12:18:00.000Z',
    })

    await harness.app.backendContext.socialSignalRepository.registerSignal({
      entityId,
      type: 'interacted',
      timestamp: '2026-05-03T12:12:00.000Z',
      source: 'public-chat',
      weight: 0.9,
    })
    await harness.app.backendContext.socialSignalRepository.registerSignal({
      entityId,
      type: 'shared',
      timestamp: '2026-05-03T12:13:00.000Z',
      source: 'public-chat',
      weight: 0.8,
    })

    const result = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'portfolio.lead.route',
      commandId: 'portfolio-lead-route:signal-autonomous-convert-1',
      entityId,
      signalId: 'signal-autonomous-convert-1',
      source: 'manual-test',
      timestamp: '2026-05-03T12:20:00.000Z',
      action: 'trigger_intake',
    }) as { lead: { status: string; qualifiedAt: string | null; contactedAt: string | null; convertedAt: string | null; payload: { reconciledRevenue?: { amount?: number; invoiceId?: string; paymentId?: string } } } | null }

    assert.equal(result.lead?.status, 'converted')
    assert.equal(result.lead?.qualifiedAt, '2026-05-03T12:20:00.000Z')
    assert.equal(result.lead?.contactedAt, '2026-05-03T12:20:00.000Z')
    assert.equal(result.lead?.convertedAt, '2026-05-03T12:20:00.000Z')
    assert.equal(result.lead?.payload.reconciledRevenue?.amount, 3200)
    assert.equal(result.lead?.payload.reconciledRevenue?.invoiceId, 'inv-auto-1')
    assert.equal(result.lead?.payload.reconciledRevenue?.paymentId, 'pay-auto-1')

    const eventCounts = await Promise.all([
      harness.app.backendContext.connection.get<{ count: number }>(`SELECT COUNT(*) as count FROM entity_event_log WHERE entity_id = ? AND type = 'portfolio.lead.qualified'`, entityId),
      harness.app.backendContext.connection.get<{ count: number }>(`SELECT COUNT(*) as count FROM entity_event_log WHERE entity_id = ? AND type = 'portfolio.lead.contacted'`, entityId),
      harness.app.backendContext.connection.get<{ count: number }>(`SELECT COUNT(*) as count FROM entity_event_log WHERE entity_id = ? AND type = 'portfolio.lead.converted'`, entityId),
    ])
    assert.equal(eventCounts[0]?.count, 1)
    assert.equal(eventCounts[1]?.count, 1)
    assert.equal(eventCounts[2]?.count, 1)
  } finally {
    await harness.close()
  }
})

test('autonomous lifecycle marks contacted lead lost on timeout or failure feedback during scan', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedPortfolioEntity(harness.app, 'entity-autonomous-lost')
    await harness.app.backendContext.connection.run(
      `
        INSERT INTO entity_portfolio_lead_signal (
          signal_id, entity_id, market, source, intent, urgency, estimated_value, confidence, recommended_action, payload_json, detected_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'signal-autonomous-lost-1',
      entityId,
      'legal',
      'manual-test',
      'stalled-follow-up',
      'medium',
      0.45,
      0.51,
      'route_lead',
      JSON.stringify({
        channelFeedback: {
          failed: true,
          sentiment: 'negative',
        },
      }),
      '2026-05-03T10:00:00.000Z',
      '2026-05-03T10:00:00.000Z',
      '2026-05-03T10:00:00.000Z',
    )

    await harness.app.backendContext.connection.run(
      `
        INSERT INTO entity_portfolio_lead (
          lead_id, entity_id, signal_id, source, timestamp, routing_status, status, qualified_at, contacted_at, converted_at, lost_at, revenue_amount, lost_reason, attributed_command_id, attribution_json, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      'lead-autonomous-lost-1',
      entityId,
      'signal-autonomous-lost-1',
      'manual-test',
      '2026-05-03T10:00:00.000Z',
      'outreach_requested',
      'contacted',
      '2026-05-03T10:05:00.000Z',
      '2026-05-03T10:10:00.000Z',
      null,
      null,
      null,
      null,
      'seed-contacted-lead',
      JSON.stringify({ signalId: 'signal-autonomous-lost-1', lifecycle: { lastTransition: 'contacted' } }),
      JSON.stringify({ confidence: 0.51, estimatedValue: 0.45 }),
      '2026-05-03T10:00:00.000Z',
      '2026-05-03T10:10:00.000Z',
    )

    const scanResult = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'portfolio.scan',
      commandId: 'portfolio-scan:autonomous-loss:2026-05-03T13:30:00.000Z',
      now: '2026-05-03T13:30:00.000Z',
    }) as { createdLeads: number }

    assert.equal(scanResult.createdLeads >= 0, true)

    const leadRepository = new PortfolioLeadRepository(harness.app.backendContext.connection)
    const storedLead = await leadRepository.getById('lead-autonomous-lost-1')
    assert.equal(storedLead?.status, 'lost')
    assert.equal(storedLead?.lostReason, 'autonomous_failure_signal')
    assert.equal(storedLead?.lostAt, '2026-05-03T13:30:00.000Z')

    const replay = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'portfolio.scan',
      commandId: 'portfolio-scan:autonomous-loss:2026-05-03T13:30:00.000Z',
      now: '2026-05-03T13:30:00.000Z',
    }) as { createdLeads: number }

    assert.equal(replay.createdLeads, 0)
    const lostEventCount = await harness.app.backendContext.connection.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM entity_event_log WHERE entity_id = ? AND type = 'portfolio.lead.lost'`,
      entityId,
    )
    assert.equal(lostEventCount?.count, 1)
  } finally {
    await harness.close()
  }
})

test('routed lead can be qualified, contacted, and converted while revenue and funnel metrics update', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedPortfolioEntity(harness.app)
    const siblingEntityId = await seedPortfolioEntity(harness.app, 'entity-portfolio-2')
    await runPortfolioScan(harness.app, '2026-05-03T12:15:00.000Z')
    const leadRepository = new PortfolioLeadRepository(harness.app.backendContext.connection)
    const lead = (await leadRepository.list()).find((record) => record.entityId === entityId)

    assert.ok(lead)
    const registryBefore = await harness.app.backendContext.multiEntityRegistry.getEntityById(entityId)
    const generateLeadsGoalBefore = registryBefore?.activeGoals.find((goal) => goal.type === 'generate_leads') as { historicalSuccess?: number } | undefined

    const qualified = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'lead.qualify',
      commandId: `lead-qualify:${lead.leadId}`,
      entityId,
      leadId: lead.leadId,
      occurredAt: '2026-05-03T12:20:00.000Z',
    }) as { lead: { status: string; qualifiedAt: string | null } | null; changed: boolean }
    assert.equal(qualified.changed, true)
    assert.equal(qualified.lead?.status, 'contacted')
    assert.equal(qualified.lead?.qualifiedAt, '2026-05-03T12:20:00.000Z')

    const contacted = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'lead.contact',
      commandId: `lead-contact:${lead.leadId}`,
      entityId,
      leadId: lead.leadId,
      occurredAt: '2026-05-03T12:25:00.000Z',
    }) as { lead: { status: string; contactedAt: string | null } | null; changed: boolean }
    assert.equal(contacted.changed, false)
    assert.equal(contacted.lead?.status, 'contacted')
    assert.equal(contacted.lead?.contactedAt, '2026-05-03T12:20:00.000Z')

    const converted = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'lead.convert',
      commandId: `lead-convert:${lead.leadId}`,
      entityId,
      leadId: lead.leadId,
      occurredAt: '2026-05-03T12:30:00.000Z',
      reconciledRevenue: {
        amount: 2400,
        currency: 'USD',
        invoiceId: 'inv-portfolio-1',
        paymentId: 'pay-portfolio-1',
        contractId: 'contract-portfolio-1',
        externalValidation: {
          system: 'billing-core',
          validatedAt: '2026-05-03T12:29:30.000Z',
          referenceId: 'billing-validation-1',
        },
      },
    }) as { lead: { status: string; convertedAt: string | null; payload: { reconciledRevenue?: { amount?: number; revenueEventId?: string; invoiceId?: string; paymentId?: string; contractId?: string; validationMethod?: string } }; attribution: { lifecycle?: { commandIds?: Record<string, string> } } } | null; changed: boolean }
    assert.equal(converted.changed, true)
    assert.equal(converted.lead?.status, 'converted')
    assert.equal(converted.lead?.convertedAt, '2026-05-03T12:30:00.000Z')
    assert.equal(converted.lead?.payload.reconciledRevenue?.amount, 2400)
    assert.equal(converted.lead?.payload.reconciledRevenue?.invoiceId, 'inv-portfolio-1')
    assert.equal(converted.lead?.payload.reconciledRevenue?.paymentId, 'pay-portfolio-1')
    assert.equal(converted.lead?.payload.reconciledRevenue?.contractId, 'contract-portfolio-1')
    assert.equal(converted.lead?.payload.reconciledRevenue?.validationMethod, 'external_system')
    assert.equal(converted.lead?.attribution.lifecycle?.commandIds?.converted, `lead-convert:${lead.leadId}`)

    const reconciledRevenueCount = await harness.app.backendContext.connection.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM entity_portfolio_lead_revenue_event WHERE lead_id = ?`,
      lead.leadId,
    )
    assert.equal(reconciledRevenueCount?.count, 1)

    const registryAfter = await harness.app.backendContext.multiEntityRegistry.getEntityById(entityId)
    const generateLeadsGoalAfter = registryAfter?.activeGoals.find((goal) => goal.type === 'generate_leads') as { historicalSuccess?: number } | undefined
    assert.equal((registryAfter?.leadGenerationScore ?? 0) > (registryBefore?.leadGenerationScore ?? 0), true)
    assert.equal((generateLeadsGoalAfter?.historicalSuccess ?? 0) > (generateLeadsGoalBefore?.historicalSuccess ?? 0), true)

    const memory = await harness.app.backendContext.entityCognitiveMemoryStore.get(entityId)
    const siblingMemory = await harness.app.backendContext.entityCognitiveMemoryStore.get(siblingEntityId)
    const outcomeEpisodes = (memory?.episodicMemory.entries ?? []).filter((entry) => entry.id === `portfolio-lead-outcome:${lead.leadId}:converted`)
    assert.equal(outcomeEpisodes.length, 1)
    assert.deepEqual((outcomeEpisodes[0]?.context?.lifecyclePath as string[] | undefined) ?? [], ['routed', 'qualified', 'contacted', 'converted'])
    assert.equal(outcomeEpisodes[0]?.context?.signalId, lead.signalId)
    assert.equal(outcomeEpisodes[0]?.context?.leadId, lead.leadId)
    assert.equal(outcomeEpisodes[0]?.context?.sourceCommandId, lead.attributedCommandId)
    assert.equal(outcomeEpisodes[0]?.context?.revenueAmount, 2400)
    assert.equal((siblingMemory?.episodicMemory.entries ?? []).some((entry) => entry.id === `portfolio-lead-outcome:${lead.leadId}:converted`), false)

    const replay = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'lead.convert',
      commandId: `lead-convert:${lead.leadId}`,
      entityId,
      leadId: lead.leadId,
      occurredAt: '2026-05-03T12:30:00.000Z',
      reconciledRevenue: {
        amount: 2400,
        currency: 'USD',
        invoiceId: 'inv-portfolio-1',
        paymentId: 'pay-portfolio-1',
        contractId: 'contract-portfolio-1',
        externalValidation: {
          system: 'billing-core',
          validatedAt: '2026-05-03T12:29:30.000Z',
          referenceId: 'billing-validation-1',
        },
      },
    }) as { lead: { payload: { reconciledRevenue?: { amount?: number } } } | null; changed: boolean }
    assert.equal(replay.changed, false)
    assert.equal(replay.lead?.payload.reconciledRevenue?.amount, 2400)

    const memoryAfterReplay = await harness.app.backendContext.entityCognitiveMemoryStore.get(entityId)
    assert.equal((memoryAfterReplay?.episodicMemory.entries ?? []).filter((entry) => entry.id === `portfolio-lead-outcome:${lead.leadId}:converted`).length, 1)

    const convertedEventCount = await harness.app.backendContext.connection.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM entity_event_log WHERE caused_by_command_id = ?`,
      `lead-convert:${lead.leadId}`,
    )
    assert.equal(convertedEventCount?.count, 1)

    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const funnel = await harness.app.inject({ method: 'GET', url: '/admin/portfolio/lead-funnel', headers: { authorization: `Bearer ${token}` } })
    const metrics = await harness.app.inject({ method: 'GET', url: '/admin/portfolio/metrics', headers: { authorization: `Bearer ${token}` } })
    assert.equal(funnel.statusCode, 200)
    assert.equal(metrics.statusCode, 200)
    const funnelBody = funnel.json()
    const metricsBody = metrics.json()
    const entityMetrics = metricsBody.metrics.entities.find((entry: { entityId: string }) => entry.entityId === entityId)
    assert.equal(funnelBody.leadFunnel.routedLeads, 2)
    assert.equal(funnelBody.leadFunnel.convertedLeads, 1)
    assert.equal(funnelBody.leadFunnel.conversionRate, 0.5)
    assert.equal(funnelBody.leadFunnel.revenueFromConvertedLeads, 2400)
    assert.deepEqual(funnelBody.leadFunnel.routedLeadsByEntity, [
      { entityId, leadCount: 1 },
      { entityId: siblingEntityId, leadCount: 1 },
    ])
    assert.equal(entityMetrics?.convertedRevenue, 2400)
    assert.equal(entityMetrics?.leadConversionRate, 1)
    assert.equal((entityMetrics?.opportunityScore ?? 0) > 0, true)
  } finally {
    await harness.close()
  }
})

test('lost lead cannot convert later and replay does not duplicate state transition', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedPortfolioEntity(harness.app)
    await runPortfolioScan(harness.app, '2026-05-03T12:15:00.000Z')
    const leadRepository = new PortfolioLeadRepository(harness.app.backendContext.connection)
    const [lead] = await leadRepository.list()

    assert.ok(lead)
    const registryBefore = await harness.app.backendContext.multiEntityRegistry.getEntityById(entityId)
    const generateLeadsGoalBefore = registryBefore?.activeGoals.find((goal) => goal.type === 'generate_leads') as { historicalSuccess?: number } | undefined

    const lost = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'lead.mark_lost',
      commandId: `lead-lost:${lead.leadId}`,
      entityId,
      leadId: lead.leadId,
      occurredAt: '2026-05-03T12:22:00.000Z',
      lostReason: 'no_response',
    }) as { lead: { status: string; lostAt: string | null; lostReason: string | null } | null; changed: boolean }
    assert.equal(lost.changed, true)
    assert.equal(lost.lead?.status, 'lost')
    assert.equal(lost.lead?.lostAt, '2026-05-03T12:22:00.000Z')
    assert.equal(lost.lead?.lostReason, 'no_response')

    const registryAfter = await harness.app.backendContext.multiEntityRegistry.getEntityById(entityId)
    const generateLeadsGoalAfter = registryAfter?.activeGoals.find((goal) => goal.type === 'generate_leads') as { historicalSuccess?: number } | undefined
    assert.equal((registryAfter?.leadGenerationScore ?? 1) < (registryBefore?.leadGenerationScore ?? 1), true)
    assert.equal((generateLeadsGoalAfter?.historicalSuccess ?? 1) < (generateLeadsGoalBefore?.historicalSuccess ?? 1), true)

    const lostMemory = await harness.app.backendContext.entityCognitiveMemoryStore.get(entityId)
    const lostEpisodes = (lostMemory?.episodicMemory.entries ?? []).filter((entry) => entry.id === `portfolio-lead-outcome:${lead.leadId}:lost`)
    assert.equal(lostEpisodes.length, 1)
    assert.equal(lostEpisodes[0]?.context?.lostReason, 'no_response')
    assert.equal(lostEpisodes[0]?.context?.sourceCommandId, lead.attributedCommandId)

    const lostReplay = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'lead.mark_lost',
      commandId: `lead-lost:${lead.leadId}`,
      entityId,
      leadId: lead.leadId,
      occurredAt: '2026-05-03T12:22:00.000Z',
      lostReason: 'no_response',
    }) as { changed: boolean }
    assert.equal(lostReplay.changed, false)

    const lostMemoryAfterReplay = await harness.app.backendContext.entityCognitiveMemoryStore.get(entityId)
    assert.equal((lostMemoryAfterReplay?.episodicMemory.entries ?? []).filter((entry) => entry.id === `portfolio-lead-outcome:${lead.leadId}:lost`).length, 1)

    const invalidConvert = await harness.app.backendContext.sovereignMutationCommandService.submitCommand({
      type: 'lead.convert',
      commandId: `lead-convert-after-lost:${lead.leadId}`,
      entityId,
      leadId: lead.leadId,
      occurredAt: '2026-05-03T12:40:00.000Z',
      reconciledRevenue: {
        amount: 999,
        currency: 'USD',
        paymentId: 'pay-after-lost',
        externalValidation: {
          system: 'billing-core',
          validatedAt: '2026-05-03T12:39:00.000Z',
        },
      },
    }) as { lead: { status: string; payload: { reconciledRevenue?: { amount?: number } } } | null; changed: boolean; blockedReason?: string }
    assert.equal(invalidConvert.changed, false)
    assert.equal(invalidConvert.blockedReason, 'invalid_transition')
    assert.equal(invalidConvert.lead?.status, 'lost')
    assert.equal(invalidConvert.lead?.payload.reconciledRevenue?.amount, undefined)

    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })
    const funnel = await harness.app.inject({ method: 'GET', url: '/admin/portfolio/lead-funnel', headers: { authorization: `Bearer ${token}` } })
    const metrics = await harness.app.inject({ method: 'GET', url: '/admin/portfolio/metrics', headers: { authorization: `Bearer ${token}` } })
    assert.equal(funnel.statusCode, 200)
    assert.equal(metrics.statusCode, 200)
    assert.deepEqual(funnel.json().leadFunnel.lostReasonsDistribution, [{ reason: 'no_response', count: 1 }])
    assert.equal(metrics.json().metrics.entities[0].leadConversionRate, 0)
  } finally {
    await harness.close()
  }
})

test('portfolio proposal admin endpoints move a proposal through acknowledge and approve while linked approval follows', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    await seedPortfolioEntity(harness.app)
    await runPortfolioScan(harness.app)
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const proposals = await harness.app.inject({ method: 'GET', url: '/admin/portfolio/proposals', headers: { authorization: `Bearer ${token}` } })
    const proposalId = proposals.json().proposals[0].id as string

    const acknowledged = await harness.app.inject({
      method: 'POST',
      url: `/admin/portfolio/proposals/${proposalId}/acknowledge`,
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(acknowledged.statusCode, 200)
    assert.equal(acknowledged.json().proposal.status, 'acknowledged')
    assert.equal(acknowledged.json().approval.proposalId, proposalId)

    const approved = await harness.app.inject({
      method: 'POST',
      url: `/admin/portfolio/proposals/${proposalId}/approve`,
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(approved.statusCode, 200)
    assert.equal(approved.json().proposal.status, 'approved')
    assert.equal(approved.json().approval.status, 'approved')
  } finally {
    await harness.close()
  }
})

test('portfolio proposal lifecycle rejects execution from rejected proposals, allows evaluation from approved proposals, updates memory, and replays deterministically', { concurrency: false }, async () => {
  const harness = await createTestApp()

  try {
    const entityId = await seedPortfolioEntity(harness.app)
    await runPortfolioScan(harness.app, '2026-05-03T12:15:00.000Z')
    await runPortfolioScan(harness.app, '2026-05-03T13:15:00.000Z')
    const token = await createAccessToken({
      userId: 1,
      tenantId: 1,
      roles: ['admin'],
      privateKeyPem: harness.privateKeyPem,
      kid: harness.configuredKid,
    })

    const proposalsResponse = await harness.app.inject({ method: 'GET', url: '/admin/portfolio/proposals', headers: { authorization: `Bearer ${token}` } })
    const [firstProposal, secondProposal] = proposalsResponse.json().proposals as Array<{ id: string }>
    const rejectedId = firstProposal.id
    const approvedId = secondProposal?.id ?? firstProposal.id

    const rejected = await harness.app.inject({
      method: 'POST',
      url: `/admin/portfolio/proposals/${rejectedId}/reject`,
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(rejected.statusCode, 200)
    const rejectedExecution = await harness.app.backendContext.portfolioProposalLifecycleService.execute(
      rejectedId,
      '2026-05-03T13:00:00.000Z',
      'user:1',
    )
    assert.equal(rejectedExecution.blockedReason, 'invalid_transition')

    const approved = await harness.app.backendContext.portfolioProposalLifecycleService.approve(
      approvedId,
      '2026-05-03T13:05:00.000Z',
      'user:1',
    )
    assert.equal(approved.proposal?.status, 'approved')

    const evaluation = await harness.app.backendContext.portfolioProposalLifecycleService.evaluate({
      proposalId: approvedId,
      leadsGenerated: 12,
      conversions: 3,
      revenue: 1800,
      roiObserved: 0.64,
      success: true,
      evaluatedAt: '2026-05-03T13:10:00.000Z',
      actorId: 'user:1',
    })
    assert.equal(evaluation.proposal?.status, 'evaluated')
    assert.equal(evaluation.outcome?.success, true)

    const memory = await harness.app.backendContext.entityCognitiveMemoryStore.get(entityId)
    assert.equal(memory?.episodicMemory.entries.some((entry) => entry.id === `portfolio-proposal-evaluation:${approvedId}`), true)

    const entity = await harness.app.backendContext.entityRepository.getEntityById(entityId)
    assert.equal(entity?.entityProfile.metadata.notes?.some((note) => note.startsWith(`portfolio-learning:${approvedId}:success:`)), true)

    const replay = await harness.app.backendContext.portfolioProposalLifecycleService.evaluate({
      proposalId: approvedId,
      leadsGenerated: 99,
      conversions: 99,
      revenue: 9999,
      roiObserved: 0.01,
      success: false,
      evaluatedAt: '2026-05-03T14:10:00.000Z',
      actorId: 'user:1',
    })
    assert.deepEqual(replay.outcome, evaluation.outcome)
    assert.equal(replay.changed, false)
  } finally {
    await harness.close()
  }
})
