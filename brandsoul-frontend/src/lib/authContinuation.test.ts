import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  captureAdminAuthContinuation,
  consumeAuthContinuationReturnTo,
  consumeSafeLegalAdminContinuationReturnTo,
} from './authContinuation'

function createStorage() {
  const store = new Map<string, string>()

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key) ?? null : null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

describe('auth continuation', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      sessionStorage: createStorage(),
      localStorage: createStorage(),
    })
    window.sessionStorage.clear()
  })

  it('keeps generic admin continuation paths', () => {
    captureAdminAuthContinuation('/admin')

    expect(consumeSafeLegalAdminContinuationReturnTo('/admin')).toBe('/admin')
  })

  it('rejects direct office admin continuation paths for legal auth recovery', () => {
    captureAdminAuthContinuation('/admin/escritorios/office-antigo/visao-geral')

    expect(consumeSafeLegalAdminContinuationReturnTo('/admin')).toBe('/admin')
  })

  it('legacy continuation consumer still returns captured office path when explicitly requested', () => {
    captureAdminAuthContinuation('/admin/escritorios/office-antigo/visao-geral')

    expect(consumeAuthContinuationReturnTo('/admin')).toBe('/admin/escritorios/office-antigo/visao-geral')
  })
})
