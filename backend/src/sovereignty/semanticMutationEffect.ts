export type SemanticMutationEffect = {
  effectId: string
  intentId: string
  effectType: string
  domain: string

  beforeFingerprint?: string
  afterFingerprint?: string

  changedFields: string[]
  institutionalMeaning: string

  replayFingerprint: string
  continuityLineageHash: string
  mutationLineageHash: string

  verified: boolean
}
