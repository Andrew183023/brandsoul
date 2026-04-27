export function buildEntitySocialProfile(args: {
  entityId: string
  publicName?: string
  handleSeed?: string
  visibility?: string
  createdAt?: string
}) {
  const normalizedHandle = (args.handleSeed ?? args.publicName ?? args.entityId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return {
    publicName: args.publicName ?? args.entityId,
    handle: normalizedHandle.length > 0 ? `@${normalizedHandle}` : undefined,
    visibility: args.visibility ?? 'public',
    createdAt: args.createdAt,
  }
}