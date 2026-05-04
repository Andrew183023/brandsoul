export type RuntimeControl = {
  mode?: string
  stageId?: string
  priority?: 'low' | 'normal' | 'high'
  debugFlags?: {
    shapeOnly?: boolean
    [key: string]: unknown
  }
  playback?: {
    activeStage?: string
    playBirthTimeline?: boolean
    [key: string]: unknown
  }
  layerVisibility?: Record<string, unknown>
  [key: string]: unknown
}