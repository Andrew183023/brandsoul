import type { EntityProfile } from '../brain/domain/entity/contracts/EntityProfile.js'
import type { EntityEventLogRecord } from '../domain/entityEventLog.js'
import type { EntityExportRecord } from '../domain/entityExport.js'
import type { EntityPublicProfile } from '../domain/entityPublicProfile.js'
import type { OrchestratorSnapshotRecord } from '../domain/orchestratorSnapshot.js'
import type { EntityRelationalTraceRecord } from '../domain/entityRelationalTrace.js'
import {
  createRuntimeStatePayload,
  type DashboardDeprecatedFallback,
  type DashboardSparkStateResponse,
} from '../orchestrator/contracts.js'
import { buildDashboardSparkStateResponse } from '../orchestrator/dashboardProjection.js'
import { withAuthoritativeFrame } from '../orchestrator/contracts.js'
import type { PublicFlowMindPartialConfig } from './publicFlowMindPartialService.js'
import {
  buildMinimalOrchestratorFrame,
  buildOrchestratorRuntimeControl,
  restoreOrchestratorState,
} from '../orchestrator/orchestratorState.js'
import { buildRuntimeSceneProjection } from '../orchestrator/runtimeSceneProjection.js'
import { resolvePublicFlowMindPartialConfig } from './publicFlowMindPartialService.js'

export type PublicCTA = {
  type: 'explore' | 'follow' | 'interact' | 'share' | 'return'
  label: string
}

export type PublicPresenceResponse = {
  entity: {
    id: string
    name: string
    tagline?: string
    avatarExportRef?: string
    species?: string
  }
  visual: {
    frameRenderSpec?: DashboardSparkStateResponse['runtime']['frame']['renderSpec']
    intensity: number
    presenceHealth: DashboardSparkStateResponse['presenceHealth']
  }
  relational: {
    relationshipLabel: string
    tier?: string
    relationalProjection?: DashboardSparkStateResponse['relationalState']
  }
  trajectory: Array<{
    summary: string
    occurredAt: string
  }>
  exports: Array<{
    id: string
    summary?: string
    origin?: string
    impact?: string
    fileUrl?: string
    occurredAt: string
  }>
  cta: PublicCTA
  deprecatedFallbacks: DashboardDeprecatedFallback[]
  publicFlowMindPartial?: PublicFlowMindPartialConfig
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function parseTimestamp(value?: string) {
  if (!value) {
    return 0
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readFiniteNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function resolveVisualIntensity(dashboard: DashboardSparkStateResponse) {
  const base = dashboard.presenceHealth.intensity === 'high'
    ? 0.88
    : dashboard.presenceHealth.intensity === 'medium'
      ? 0.64
      : 0.38
  const continuity = readFiniteNumber(dashboard.relationalState?.continuityConfidence, 0)
  const trendAdjustment = dashboard.presenceHealth.trend === 'expanding'
    ? 0.08
    : dashboard.presenceHealth.trend === 'returning'
      ? 0.04
      : dashboard.presenceHealth.trend === 'cooling'
        ? -0.14
        : dashboard.presenceHealth.trend === 'stable'
          ? 0.02
          : -0.04

  return clamp(base * 0.72 + continuity * 0.28 + trendAdjustment, 0.18, 1)
}

function resolveRelationshipLabel(dashboard: DashboardSparkStateResponse) {
  const continuity = readFiniteNumber(dashboard.relationalState?.continuityConfidence, 0)
  const tier = dashboard.relationalState?.relationshipTier

  if (continuity < 0.28) {
    return 'continuidade baixa'
  }

  if (tier === 'bonded' || tier === 'engaged') {
    return 'vínculo consistente'
  }

  if (dashboard.presenceHealth.trend === 'expanding') {
    return 'presença em expansão'
  }

  return 'afinidade crescente'
}

function resolvePublicCTA(dashboard: DashboardSparkStateResponse): PublicCTA {
  const continuity = readFiniteNumber(dashboard.relationalState?.continuityConfidence, 0)
  const tier = dashboard.relationalState?.relationshipTier

  if (dashboard.presenceHealth.trend === 'forming') {
    return { type: 'explore', label: 'Explorar' }
  }
  if (continuity >= 0.68 || tier === 'bonded' || tier === 'engaged') {
    return { type: 'return', label: 'Retornar' }
  }
  if (dashboard.presenceHealth.trend === 'expanding') {
    return { type: 'follow', label: 'Seguir' }
  }
  if (tier === 'growing') {
    return { type: 'interact', label: 'Interagir' }
  }
  return { type: 'share', label: 'Compartilhar' }
}

function buildTraceTrajectory(trace: EntityRelationalTraceRecord) {
  const metadata = isObject(trace.metadataJson) ? trace.metadataJson : {}
  const guardrails = isObject(metadata.guardrails) ? metadata.guardrails : {}
  const tags = Array.isArray(guardrails.tags)
    ? guardrails.tags.filter((item): item is string => typeof item === 'string')
    : []
  const explicitSummary = readString(metadata.summary)

  if (explicitSummary) {
    return {
      summary: explicitSummary,
      occurredAt: trace.occurredAt,
    }
  }

  if (tags.includes('inactivity-decay')) {
    return {
      summary: 'Período de baixa atividade reduziu a intensidade da presença.',
      occurredAt: trace.occurredAt,
    }
  }

  if (trace.eventType === 'share.registered') {
    return {
      summary: 'Compartilhamento recente ampliou a presença.',
      occurredAt: trace.occurredAt,
    }
  }

  if (trace.eventType === 'return.visit.registered' || trace.eventType === 'return_visit.registered') {
    return {
      summary: 'Retornos consecutivos reforçaram o vínculo.',
      occurredAt: trace.occurredAt,
    }
  }

  if (trace.deltaBindingStrength > 0.06) {
    return {
      summary: 'Uma interação importante fortaleceu a percepção de vínculo.',
      occurredAt: trace.occurredAt,
    }
  }

  return {
    summary: 'A entidade recebeu um novo sinal e ajustou sua presença.',
    occurredAt: trace.occurredAt,
  }
}

function buildEventTrajectory(event: EntityEventLogRecord) {
  if (event.type === 'export.triggered') {
    return {
      summary: 'Um novo export colocou a entidade novamente em circulação.',
      occurredAt: event.timestamp,
    }
  }

  return undefined
}

function buildTrajectory(args: {
  traces: EntityRelationalTraceRecord[]
  events: EntityEventLogRecord[]
  exports: EntityExportRecord[]
}) {
  const traceItems = args.traces.slice(0, 4).map(buildTraceTrajectory)
  const eventItems = args.events.slice(0, 3).map(buildEventTrajectory).filter((item): item is { summary: string; occurredAt: string } => Boolean(item))
  const exportItems = args.exports.slice(0, 2).map((record) => ({
    summary: `Export ${record.format} manteve a entidade disponível para descoberta.`,
    occurredAt: record.createdAt,
  }))

  return [...traceItems, ...eventItems, ...exportItems]
    .sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt))
    .slice(0, 6)
}

function resolveExportOrigin(record: EntityExportRecord) {
  const metadata = isObject(record.metadata) ? record.metadata : {}
  const source = readString(metadata.source)
  if (!source) {
    return undefined
  }

  if (source.includes('share')) return 'share'
  if (source.includes('interaction')) return 'interaction'
  if (source.includes('discover')) return 'discovery'
  if (source.includes('evolution') || source.includes('flowmind')) return 'evolution'
  return source
}

function resolveExportImpact(origin?: string) {
  if (origin === 'share') {
    return 'ampliou a circulação da entidade'
  }
  if (origin === 'interaction') {
    return 'nasceu de uma interação relevante'
  }
  if (origin === 'evolution') {
    return 'expressa a fase atual da entidade'
  }
  if (origin === 'discovery') {
    return 'aproximou a presença de novos contextos'
  }
  return undefined
}

function buildExports(records: EntityExportRecord[]) {
  return records.slice(0, 4).map((record) => {
    const metadata = isObject(record.metadata) ? record.metadata : {}
    const origin = resolveExportOrigin(record)
    const summary = readString(metadata.summary) ?? `Export ${record.format} conectado ao estado atual da entidade.`

    return {
      id: record.id,
      summary,
      origin,
      impact: resolveExportImpact(origin),
      fileUrl: record.fileUrl,
      occurredAt: record.createdAt,
    }
  })
}

function resolveFallbackStage(entityProfile?: EntityProfile) {
  const playback = entityProfile?.runtime?.control?.playback
  return typeof playback?.activeStage === 'string' ? playback.activeStage : undefined
}

export function buildPublicPresenceResponse(args: {
  entityId: string
  entityProfile: EntityProfile
  publicProfile: EntityPublicProfile
  latestSnapshot?: OrchestratorSnapshotRecord | null
  recentEvents: EntityEventLogRecord[]
  relationalTrace: EntityRelationalTraceRecord[]
  exports: EntityExportRecord[]
}): PublicPresenceResponse {
  const restoredAt = args.recentEvents[0]?.timestamp ?? args.latestSnapshot?.updatedAt ?? args.entityProfile.metadata.updatedAt ?? new Date().toISOString()
  const restoredState = restoreOrchestratorState({
    entityId: args.entityId,
    entityProfile: args.entityProfile,
    snapshot: args.latestSnapshot,
    fallbackStage: resolveFallbackStage(args.entityProfile),
    now: restoredAt,
  })
  const baseFrame = buildMinimalOrchestratorFrame(restoredState, restoredAt)
  const runtimeControl = buildOrchestratorRuntimeControl(restoredState)
  const runtime = {
    entityId: args.entityId,
    state: createRuntimeStatePayload(restoredState, runtimeControl),
    frame: withAuthoritativeFrame({
      ...baseFrame,
      renderSpec: buildRuntimeSceneProjection({
        entityProfile: args.entityProfile,
        runtimeControl,
        stage: restoredState.currentStage,
      }),
    }),
    session: {
      hydratedAt: restoredAt,
      source: args.latestSnapshot?.id ? 'snapshot' as const : 'initialized' as const,
      snapshotId: args.latestSnapshot?.id,
      restoredFromEventLog: args.recentEvents.length > 0,
      eventLogWindowSize: args.recentEvents.length,
    },
    lastEvent: args.recentEvents[0],
    pendingUiEffects: [],
    pendingScheduledTasks: [],
  }
  const dashboard = buildDashboardSparkStateResponse({
    runtime,
    recentEvents: args.recentEvents,
    relationalTrace: args.relationalTrace,
    entityProfile: args.entityProfile,
  })

  return {
    entity: {
      id: args.entityId,
      name: args.publicProfile.name,
      tagline: args.publicProfile.tagline,
      avatarExportRef: args.publicProfile.avatarExportRef,
      species: args.publicProfile.species,
    },
    visual: {
      frameRenderSpec: dashboard.runtime.frame.renderSpec,
      intensity: resolveVisualIntensity(dashboard),
      presenceHealth: dashboard.presenceHealth,
    },
    relational: {
      relationshipLabel: resolveRelationshipLabel(dashboard),
      tier: dashboard.relationalState?.relationshipTier,
      relationalProjection: dashboard.relationalState,
    },
    trajectory: buildTrajectory({
      traces: args.relationalTrace,
      events: args.recentEvents,
      exports: args.exports,
    }),
    exports: buildExports(args.exports),
    cta: resolvePublicCTA(dashboard),
    deprecatedFallbacks: dashboard.deprecatedFallbacks,
    publicFlowMindPartial: resolvePublicFlowMindPartialConfig({
      entityProfile: args.entityProfile,
      readiness: dashboard.publicShadowReadiness,
    }),
  }
}
