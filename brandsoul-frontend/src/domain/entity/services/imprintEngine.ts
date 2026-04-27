export function buildInitialIdentityImprint(args: {
  manifestation?: { mode?: string; variant?: string }
  createdAt: string
}) {
  return {
    signature: `${args.manifestation?.mode ?? 'entity'}:${args.manifestation?.variant ?? 'default'}`,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  }
}