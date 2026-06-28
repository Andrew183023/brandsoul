import type { BrandSoulVisualRuntimePatch } from '../../domain/rendering/contracts/BrandSoulVisualRuntimePatch'

export type PublicEntityInteractionRequest = {
  requestId?: string
  userMessage: string
  businessContext?: {
    businessType?: string
    description?: string
    officeName?: string
    legalAreas?: string[]
    servedCities?: string[]
    intake?: {
      intakeCriteria?: string
      priorityRules?: string
    }
    availability?: {
      responseWindowLabel?: string
      operatingHours?: string
    }
    publicationStatus?: string
    catalogSummary?: {
      categories: string[]
      featuredItems: string[]
    }
    servicesSummary?: {
      names: string[]
    }
  }
  context?: {
    sessionId?: string
    allowDebug?: boolean
    clientRenderVersion?: string
    attribution?: {
      utmSource?: string
      utmMedium?: string
      utmCampaign?: string
      utmTerm?: string
      utmContent?: string
      referrer?: string
      currentUrl?: string
      pathname?: string
    }
  }
  triage?: {
    clientName?: string
    preferredName?: string
    city?: string
    practiceArea?: string
    context: string
    urgency: 'critical' | 'priority' | 'planned'
    objective: string
    contactPreference: string
    contactValue: string
  }
}

export type PublicEntityDecisionDebugSummary = {
  terminalReason?: string
  dominantReason?: string
  fallbackUsed: boolean
  fallbackReason?: string
  authorityShift?: string
  safeMode?: boolean
}

export type PublicEntityDecisionResponse = {
  status: 'ready'
  entityId: string
  requestId: string
  decision: {
    responseText: string
    decision: {
      intent: string
      action: string
      confidence: number
    }
    decisionSource: string
    terminalAuthority: string
    semanticFrozen: boolean
    visualPatch?: {
      visualState?: Record<string, unknown>
      runtimePatch?: BrandSoulVisualRuntimePatch
    }
    updatedPresenceIndicators?: {
      cognitiveIndicator?: {
        tone: string
        summary: string
        confidence?: number
      }
      relationshipLabel?: string
      presenceIntensity?: number
    }
    debugSummary?: PublicEntityDecisionDebugSummary
  }
  fallback: {
    occurred: boolean
    source: 'backend-authoritative' | 'backend-fallback' | 'frontend-explicit-fallback'
    reason?: string
  }
  actionResult?: {
    actionType: 'create_legal_case' | 'none'
    status: 'created' | 'needs_input' | 'skipped'
    caseId?: string
    missingFields?: Array<'descricao' | 'cidade' | 'contato'>
  }
  telemetry: {
    evaluatedAt: string
    latencyMs: number
  }
}
