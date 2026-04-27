import type { OrchestratorEvent } from '../../domain/orchestration/contracts/OrchestratorEvent'
import type { OrchestratorCommand } from '../../domain/orchestration/contracts/OrchestratorCommand'
import type { CommandRequest } from '../contracts/CommandRequest'
import type { CommandResponse } from '../contracts/CommandResponse'
import type {
  DashboardFlowMindMetricsFilters,
  DashboardPublicFlowMindPartialAutomationMode,
  DashboardSparkStateResponse,
} from '../contracts/DashboardSparkStateResponse'
import type { HydrateRuntimeResponse } from '../contracts/HydrateRuntimeResponse'
import type { RelationalTraceDetailedResponse } from '../contracts/RelationalTraceDetailedResponse'
import type { OrchestratorEventLogRecord } from '../contracts/OrchestratorEventLogRecord'
import type { OrchestratorFrame } from '../contracts/OrchestratorFrame'
import type { OrchestratorSnapshot } from '../contracts/OrchestratorSnapshot'
import type { PublicFlowMindPartialConfig } from '../../domain/entity/contracts/PublicPresenceResponse'
import { buildRequiredBackendAuthHeaders } from './authHeaders'
import { readBackendBridgeBaseUrl } from '../../lib/api'

export type OrchestratorCommandResponse = CommandResponse & {
  event?: OrchestratorEventLogRecord
}

export type OrchestratorApi = {
  sendCommand(entityId: string, command: OrchestratorCommand): Promise<OrchestratorCommandResponse | undefined>
  hydrateRuntime(entityId: string): Promise<HydrateRuntimeResponse | undefined>
  getDashboardState(entityId: string, filters?: Partial<DashboardFlowMindMetricsFilters>): Promise<DashboardSparkStateResponse | undefined>
  updatePublicPartialControl(entityId: string, input: {
    rolloutPercentage: number
    killSwitchEnabled: boolean
    automationMode: DashboardPublicFlowMindPartialAutomationMode
  }): Promise<PublicFlowMindPartialConfig | undefined>
  getDetailedRelationalTrace(entityId: string, limit?: number): Promise<RelationalTraceDetailedResponse | undefined>
  getLatestFrame(sessionId: string): Promise<OrchestratorFrame | undefined>
  logEvent(event: OrchestratorEvent): Promise<void>
  saveSnapshot(snapshot: OrchestratorSnapshot): Promise<void>
  getLatestSnapshot(entityId: string): Promise<OrchestratorSnapshot | undefined>
  getRecentEvents(entityId: string, limit?: number): Promise<OrchestratorEventLogRecord[]>
}

function getBackendBaseUrl() {
  return readBackendBridgeBaseUrl()
}

function isBackendGovernedCommand(command: OrchestratorCommand) {
  return command.name === 'start_birth'
    || command.name === 'pause_birth'
    || command.name === 'resume_birth'
    || command.name === 'set_stage'
    || command.name === 'apply_control'
    || command.name === 'trigger_export'
}

export function createHttpOrchestratorApi(baseUrl = getBackendBaseUrl()): OrchestratorApi {
  return {
    async sendCommand(entityId, command) {
      if (!isBackendGovernedCommand(command)) {
        return undefined
      }

      const commandRequest: CommandRequest = {
        type: command.type,
        name: command.name,
        commandId: command.commandId,
        issuedAt: command.issuedAt,
        payload: command.payload,
      }

      const response = await fetch(`${baseUrl}/orchestrator/${entityId}/command`, {
        method: 'POST',
        headers: await buildRequiredBackendAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(commandRequest),
      })

      if (response.status === 404) {
        return undefined
      }

      if (!response.ok) {
        throw new Error(`Orchestrator command failed with status ${response.status}.`)
      }

      const payload = (await response.json()) as Partial<OrchestratorCommandResponse> & {
        entityId: string
        event?: OrchestratorEventLogRecord
      }

      if (!payload.state || !payload.command || !payload.frame || !payload.session) {
        return undefined
      }

      return {
        entityId: payload.entityId,
        command: payload.command,
        state: payload.state,
        session: payload.session,
        lastEvent: payload.lastEvent ?? payload.event,
        pendingUiEffects: payload.pendingUiEffects ?? [],
        pendingScheduledTasks: payload.pendingScheduledTasks ?? [],
        sovereignFlowMind: payload.sovereignFlowMind,
        lineage: payload.lineage,
        event: payload.event,
        frame: payload.frame,
      }
    },
    async hydrateRuntime(entityId) {
      const response = await fetch(`${baseUrl}/orchestrator/${entityId}/runtime`, {
        headers: await buildRequiredBackendAuthHeaders(),
      })

      if (response.status === 404) {
        return undefined
      }

      if (!response.ok) {
        throw new Error(`Orchestrator hydrate failed with status ${response.status}.`)
      }

      const payload = (await response.json()) as Partial<HydrateRuntimeResponse> & {
        entityId: string
      }

      if (!payload.state || !payload.frame || !payload.session) {
        return undefined
      }

      return {
        entityId: payload.entityId,
        state: payload.state,
        frame: payload.frame,
        session: payload.session,
        lastEvent: payload.lastEvent,
        pendingUiEffects: payload.pendingUiEffects ?? [],
        pendingScheduledTasks: payload.pendingScheduledTasks ?? [],
      }
    },
    async getDashboardState(entityId, filters) {
      const params = new URLSearchParams()
      if (filters?.endpoint) {
        params.set('endpoint', filters.endpoint)
      }
      if (filters?.period) {
        params.set('period', filters.period)
      }

      const response = await fetch(`${baseUrl}/orchestrator/${entityId}/dashboard${params.size > 0 ? `?${params.toString()}` : ''}`, {
        headers: await buildRequiredBackendAuthHeaders(),
      })

      if (response.status === 404) {
        return undefined
      }

      if (!response.ok) {
        throw new Error(`Orchestrator dashboard failed with status ${response.status}.`)
      }

      const payload = (await response.json()) as Partial<DashboardSparkStateResponse> & {
        entityId: string
      }

      if (!payload.runtime || !payload.liveState || !payload.presenceHealth || !payload.recentActivity) {
        return undefined
      }

      return {
        entityId: payload.entityId,
        entityName: payload.entityName,
        runtime: payload.runtime,
        sovereignFlowMind: payload.sovereignFlowMind,
        flowMindComparison: payload.flowMindComparison,
        flowMindAuthority: payload.flowMindAuthority,
        flowMindAuthorityAggregation: payload.flowMindAuthorityAggregation,
        publicShadowAggregation: payload.publicShadowAggregation,
        publicShadowRecentPattern: payload.publicShadowRecentPattern,
        publicShadowSampleSize: payload.publicShadowSampleSize,
        publicShadowReadiness: payload.publicShadowReadiness,
        publicPartialAggregation: payload.publicPartialAggregation,
        flowMindMetrics: payload.flowMindMetrics,
        preSafeMappingSampleSize: payload.preSafeMappingSampleSize,
        postSafeMappingSampleSize: payload.postSafeMappingSampleSize,
        postSafeMappingAggregation: payload.postSafeMappingAggregation,
        postSafeMappingReadiness: payload.postSafeMappingReadiness,
        comparisonWindowLabel: payload.comparisonWindowLabel,
        liveState: payload.liveState,
        relationalState: payload.relationalState,
        presenceHealth: payload.presenceHealth,
        recentActivity: payload.recentActivity,
        relationalTrace: payload.relationalTrace ?? [],
        deprecatedFallbacks: payload.deprecatedFallbacks ?? [],
      }
    },
    async updatePublicPartialControl(entityId, input) {
      const response = await fetch(`${baseUrl}/orchestrator/${entityId}/public-partial-control`, {
        method: 'PATCH',
        headers: await buildRequiredBackendAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(input),
      })

      if (response.status === 404) {
        return undefined
      }

      if (!response.ok) {
        throw new Error(`Public partial control update failed with status ${response.status}.`)
      }

      const payload = (await response.json()) as {
        publicPartialControl?: PublicFlowMindPartialConfig
      }

      return payload.publicPartialControl
    },
    async getDetailedRelationalTrace(entityId, limit = 20) {
      const response = await fetch(`${baseUrl}/orchestrator/${entityId}/relational-trace?limit=${limit}`, {
        headers: await buildRequiredBackendAuthHeaders(),
      })

      if (response.status === 404) {
        return undefined
      }

      if (!response.ok) {
        throw new Error(`Orchestrator relational trace failed with status ${response.status}.`)
      }

      const payload = (await response.json()) as Partial<RelationalTraceDetailedResponse> & {
        entityId: string
      }

      if (!Array.isArray(payload.items)) {
        return undefined
      }

      return {
        entityId: payload.entityId,
        items: payload.items,
        deprecatedFallbacks: payload.deprecatedFallbacks ?? [],
      }
    },
    async getLatestFrame() {
      return undefined
    },
    async logEvent(event) {
      if (!('name' in event) || !event.entityId) {
        return
      }

      await fetch(`${baseUrl}/entity/${event.entityId}/events`, {
        method: 'POST',
        headers: await buildRequiredBackendAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          id: 'eventId' in event ? event.eventId : undefined,
          type: event.name,
          payload: event.payload,
          timestamp: 'timestamp' in event ? event.timestamp : new Date().toISOString(),
          causedByCommandId: 'causedByCommandId' in event ? event.causedByCommandId : undefined,
        }),
      })
    },
    async saveSnapshot(snapshot) {
      void snapshot
      return
    },
    async getLatestSnapshot(entityId) {
      const response = await fetch(`${baseUrl}/entity/${entityId}/snapshots/latest`, {
        headers: await buildRequiredBackendAuthHeaders(),
      })
      if (response.status === 404) {
        return undefined
      }

      const payload = (await response.json()) as { snapshot?: OrchestratorSnapshot }
      return payload.snapshot
    },
    async getRecentEvents(entityId, limit = 20) {
      const response = await fetch(`${baseUrl}/entity/${entityId}/events/recent?limit=${limit}`, {
        headers: await buildRequiredBackendAuthHeaders(),
      })
      if (response.status === 404) {
        return []
      }

      const payload = (await response.json()) as { events?: OrchestratorEventLogRecord[] }
      return payload.events ?? []
    },
  }
}

export function createUnavailableOrchestratorApi(): OrchestratorApi {
  return {
    async sendCommand() {
      throw new Error('Persona orchestrator backend is not connected yet.')
    },
    async hydrateRuntime() {
      return undefined
    },
    async getDashboardState() {
      return undefined
    },
    async updatePublicPartialControl() {
      return undefined
    },
    async getDetailedRelationalTrace() {
      return undefined
    },
    async getLatestFrame() {
      return undefined
    },
    async logEvent() {
      return
    },
    async saveSnapshot() {
      return
    },
    async getLatestSnapshot() {
      return undefined
    },
    async getRecentEvents() {
      return []
    },
  }
}
