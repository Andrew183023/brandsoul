export type VisualContrast = 'low' | 'medium' | 'high'
export type VisualSaturation = 'low' | 'medium' | 'high'
export type VisualTemperature = 'warm' | 'cool' | 'neutral'
export type VisualStructure = 'organic' | 'angular' | 'balanced'
export type VisualComposition = 'centered' | 'spread' | 'vertical'
export type VisualIntensity = 'soft' | 'vivid' | 'strong'

export interface VisualEssence {
  primaryColor: string
  secondaryColor: string
  energyColor?: string
  neutralColor?: string
  contrast: VisualContrast
  saturation: VisualSaturation
  temperature: VisualTemperature
  brightness: number
  structure: VisualStructure
  composition: VisualComposition
  intensity: VisualIntensity
  dominantZones: Array<{
    x: number
    y: number
    weight: number
  }>
}
