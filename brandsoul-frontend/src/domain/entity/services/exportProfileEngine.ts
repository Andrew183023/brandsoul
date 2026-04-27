export function buildEntityExportProfile(args: {
  entityId: string
  input?: { palette?: { primary?: string; secondary?: string } }
  lastExportAt?: string
}) {
  return {
    entityId: args.entityId,
    formatsEnabled: ['post', 'story', 'square'],
    paletteHint: {
      primary: args.input?.palette?.primary,
      secondary: args.input?.palette?.secondary,
    },
    lastExportAt: args.lastExportAt,
  }
}