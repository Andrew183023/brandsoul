import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getExecutiveDashboard,
} from '../backend-bridge/api/executiveDashboardApi'
import type {
  ExecutiveDashboardResponse,
} from '../backend-bridge/api/executiveDashboardTypes'

export interface UseExecutiveDashboardOptions {
  enabled?: boolean
}

export interface UseExecutiveDashboardResult {
  data: ExecutiveDashboardResponse | null
  error: Error | null
  isLoading: boolean
  isRefreshing: boolean
  refresh: () => Promise<void>
}

type ExecutiveDashboardState = Omit<UseExecutiveDashboardResult, 'refresh'>

const IDLE_STATE: ExecutiveDashboardState = {
  data: null,
  error: null,
  isLoading: false,
  isRefreshing: false,
}

function hasValidOfficeId(officeId: string | null | undefined): officeId is string {
  return typeof officeId === 'string' && officeId.trim().length > 0
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  return 'name' in error && error.name === 'AbortError'
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }

  return new Error('Failed to load executive dashboard.')
}

export function useExecutiveDashboard(
  officeId: string | null | undefined,
  options?: UseExecutiveDashboardOptions,
): UseExecutiveDashboardResult {
  const enabled = options?.enabled ?? true
  const [state, setState] = useState<ExecutiveDashboardState>(IDLE_STATE)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestSequenceRef = useRef(0)
  const latestDataRef = useRef<ExecutiveDashboardResponse | null>(null)

  const abortActiveRequest = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  const runRequest = useCallback(async (mode: 'auto' | 'refresh') => {
    if (!enabled || !hasValidOfficeId(officeId)) {
      return
    }

    abortActiveRequest()

    const controller = new AbortController()
    abortControllerRef.current = controller
    const requestSequence = requestSequenceRef.current + 1
    requestSequenceRef.current = requestSequence
    const hasPreviousData = latestDataRef.current !== null

    setState((current) => ({
      data: hasPreviousData ? current.data : null,
      error: null,
      isLoading: !hasPreviousData,
      isRefreshing: hasPreviousData && mode === 'refresh',
    }))

    try {
      const nextDashboard = await getExecutiveDashboard(officeId, {
        signal: controller.signal,
      })

      if (requestSequence !== requestSequenceRef.current) {
        return
      }

      latestDataRef.current = nextDashboard
      setState({
        data: nextDashboard,
        error: null,
        isLoading: false,
        isRefreshing: false,
      })
    } catch (error) {
      if (requestSequence !== requestSequenceRef.current) {
        return
      }

      if (isAbortError(error)) {
        return
      }

      const normalizedError = normalizeError(error)
      setState((current) => ({
        data: hasPreviousData ? current.data : null,
        error: normalizedError,
        isLoading: false,
        isRefreshing: false,
      }))
    } finally {
      if (requestSequence === requestSequenceRef.current && abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }, [abortActiveRequest, enabled, officeId])

  const refresh = useCallback(async () => {
    if (!enabled || !hasValidOfficeId(officeId)) {
      return
    }

    await runRequest('refresh')
  }, [enabled, officeId, runRequest])

  useEffect(() => {
    abortActiveRequest()
    latestDataRef.current = null
    setState(IDLE_STATE)

    if (!enabled || !hasValidOfficeId(officeId)) {
      return () => {
        abortActiveRequest()
      }
    }

    void runRequest('auto')

    return () => {
      abortActiveRequest()
    }
  }, [abortActiveRequest, enabled, officeId, runRequest])

  return {
    ...state,
    refresh,
  }
}
