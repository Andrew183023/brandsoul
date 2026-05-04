export type EntityPublicProfile = {
  schemaVersion: 1
  entityId: string
  name: string
  species: string
  avatarExportRef?: string
  tagline?: string
  behaviorTone?: string
  evolutionLevel: number
  trustScore: number
  lastActiveAt?: string
  publicStats: {
    interactions: number
    exports: number
    shares: number
    returns: number
  }
}