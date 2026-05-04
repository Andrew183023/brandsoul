export type RuntimeStageBudgetLevel = 'low' | 'medium' | 'high'

export type RuntimeStageBudget = {
  initial: RuntimeStageBudgetLevel
  mid: RuntimeStageBudgetLevel
  climax: RuntimeStageBudgetLevel
  stabilize: RuntimeStageBudgetLevel
}

export type RuntimeSceneSpec = {
  schemaVersion?: number
  source?: string
  shape: {
    fillStrategy?: string
    typographicCandidate?: boolean
    fillAlpha?: number
    edgeAlpha?: number
    edgeWidth?: number
    edgeTint?: number
    tint?: number
    detailAlpha?: number
    pulse?: number
    rhythmSpeed?: number
  }
  core: {
    radius?: number
    baseAlpha?: number
    accentAlpha?: number
    detailAlpha?: number
    pulse?: number
    rhythmSpeed?: number
    offsetX?: number
    offsetY?: number
  }
  field: {
    relation?: string
    mask?: 'aura-bound' | 'distributed' | 'minimal' | 'shape-bound' | string
    spread?: number
    baseAlpha?: number
    accentAlpha?: number
    detailAlpha?: number
    pulse?: number
    rhythmSpeed?: number
    budget?: RuntimeStageBudget
  }
  particles: {
    alpha?: number
    sizeMultiplier?: number
    speedMultiplier?: number
    densityMultiplier?: number
    spread?: number
    emitter?: Record<string, unknown>
    emitterConfig?: Record<string, unknown>
    budget?: RuntimeStageBudget
  }
  timeline?: {
    birthTimeline?: {
      duration?: number
      stages?: Array<Record<string, unknown>>
      [key: string]: unknown
    }
    duration?: number
    stages?: Array<Record<string, unknown>>
    activeStageId?: string
  }
  composition?: {
    mode?: string
    variant?: string
    intensity?: string
    finalReveal?: boolean
    backgroundAlpha?: number
    accent?: string
    secondary?: string
    shapeTint?: number
    edgeTint?: number
    originSource?: string
    layerVisibility?: Record<string, unknown>
    debugFlags?: Record<string, unknown>
    shapeOnly?: boolean
    finalForm?: Record<string, unknown>
  }
}