export type EntitySocialProfile = {
  publicName?: string
  tagline?: string
  bio?: string
  tags?: string[]
  channels?: Record<string, unknown>
  [key: string]: unknown
}