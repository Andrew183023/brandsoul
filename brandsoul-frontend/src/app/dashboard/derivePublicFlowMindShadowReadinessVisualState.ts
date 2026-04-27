type ShadowReadiness = {
  publicShadowReadinessState?: string
}

export function derivePublicFlowMindShadowReadinessVisualState(readiness: ShadowReadiness | undefined) {
  if (!readiness) {
    return {
      tone: 'unknown',
      badgeLabel: 'sem prontidão',
    } as const
  }

  if (readiness.publicShadowReadinessState === 'ready') {
    return {
      tone: 'ready',
      badgeLabel: 'pronto para partial',
    } as const
  }

  if (readiness.publicShadowReadinessState === 'forming') {
    return {
      tone: 'forming',
      badgeLabel: 'em formação',
    } as const
  }

  return {
    tone: 'unknown',
    badgeLabel: 'sem prontidão',
  } as const
}