export type BrandSoulMemoryType = 'identity' | 'relational' | 'operational' | 'contextual'

export type BrandSoulMemoryValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean>
  | Record<string, string | number | boolean | null>

export type BrandSoulMemorySnapshot = {
  key: string
  value: BrandSoulMemoryValue
  type: BrandSoulMemoryType
  relevanceScore: number
  createdAt: string
}