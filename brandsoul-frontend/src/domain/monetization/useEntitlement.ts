import { useEffect, useState } from 'react'

import { getMonetizationSnapshot, type MonetizationPayload } from '../../backend-bridge/api/monetizationApi'
import { useAuthSession } from '../../lib/session'

export function useEntitlement(entityId?: string) {
  const session = useAuthSession()
  const [payload, setPayload] = useState<MonetizationPayload | undefined>(undefined)
  const [loading, setLoading] = useState(Boolean(session))

  useEffect(() => {
    let cancelled = false

    if (!session) {
      setLoading(false)
      return
    }

    setLoading(true)
    void getMonetizationSnapshot(entityId).then((nextPayload) => {
      if (cancelled) {
        return
      }

      setPayload(nextPayload)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [entityId, session])

  const blocked = payload?.entitlements.filter((item) => item.status === 'blocked') ?? []
  const limited = payload?.entitlements.filter((item) => item.status === 'limited') ?? []
  const strongestUpgrade = payload?.snapshot.upgradeSignals[0]

  return {
    loading,
    plan: payload?.snapshot.plan ?? session?.tenant.plan?.toUpperCase(),
    snapshot: payload?.snapshot,
    entitlements: payload?.entitlements ?? [],
    blocked,
    limited,
    strongestUpgrade,
    isBlocked: blocked.length > 0,
    hasSoftLimit: limited.length > 0,
  }
}
