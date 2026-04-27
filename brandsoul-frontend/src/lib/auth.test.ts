import { beforeEach, describe, expect, it, vi } from 'vitest'

const axiosMock = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
}))

vi.mock('axios', () => ({
  default: axiosMock,
}))

import { bootstrapSession, buildAuthenticatedHeaders, loginAccount, logoutAllSessions, registerAccount, requestPasswordReset, resetPassword } from './auth'
import { clearSession, loadSession, saveSession } from './session'

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

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function buildToken(expiresInSeconds: number) {
  const now = Math.floor(Date.now() / 1000)
  return `${toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${toBase64Url(JSON.stringify({ exp: now + expiresInSeconds }))}.signature`
}

describe('auth authority client', () => {
  beforeEach(() => {
    const sessionStorage = createStorage()
    const localStorage = createStorage()

    vi.stubGlobal('window', {
      sessionStorage,
      localStorage,
    })
    vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('utf8'))

    axiosMock.post.mockReset()
    axiosMock.get.mockReset()
    clearSession()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('logs in against the TypeScript auth authority and stores refresh-capable session data', async () => {
    axiosMock.post.mockResolvedValueOnce({
      data: {
        accessToken: buildToken(300),
        refreshToken: 'refresh-1',
        tokenType: 'Bearer',
        expiresIn: 300,
        user: { id: 1, name: 'Ana', email: 'ana@brand.com', is_active: true, created_at: '', updated_at: '' },
        tenant: { id: 10, name: 'Brand', slug: 'brand', business_model: 'hybrid', plan: 'pro', is_active: true, created_at: '', updated_at: '' },
      },
    })

    const session = await loginAccount({ email: 'ana@brand.com', password: 'secret123' })
    saveSession(session)

    expect(session.accessToken).toBe(session.token)
    expect(session.refreshToken).toBe('refresh-1')
    expect(loadSession()?.refreshToken).toBe('refresh-1')
    expect(window.localStorage.getItem('brandsoul.auth.session')).toBeNull()
    expect(window.sessionStorage.getItem('brandsoul.auth.session')).toContain('refresh-1')
  })

  it('registers directly against the TypeScript auth authority and receives the official session bundle', async () => {
    axiosMock.post.mockResolvedValueOnce({
      data: {
        accessToken: buildToken(300),
        refreshToken: 'refresh-2',
        tokenType: 'Bearer',
        expiresIn: 300,
        user: { id: 2, name: 'Bia', email: 'bia@brand.com', is_active: true, created_at: '', updated_at: '' },
        tenant: { id: 11, name: 'Brand 2', slug: 'brand-2', business_model: 'service', plan: 'starter', is_active: true, created_at: '', updated_at: '' },
      },
    })

    const session = await registerAccount({
      name: 'Bia',
      email: 'bia@brand.com',
      password: 'secret123',
      tenant_name: 'Brand 2',
      business_model: 'service',
    })

    expect(axiosMock.post).toHaveBeenCalledTimes(1)
    expect(session.refreshToken).toBe('refresh-2')
  })

  it('routes forgot-password and reset-password through the TypeScript auth authority', async () => {
    axiosMock.post
      .mockResolvedValueOnce({ data: { message: 'reset requested' } })
      .mockResolvedValueOnce({ data: { message: 'password updated' } })

    const forgotResponse = await requestPasswordReset({ email: 'bia@brand.com' })
    const resetResponse = await resetPassword({ token: 'reset-token', new_password: 'secret1234' })

    expect(forgotResponse.message).toBe('reset requested')
    expect(resetResponse.message).toBe('password updated')
    expect(axiosMock.post).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/auth/forgot-password'),
      { email: 'bia@brand.com' },
    )
    expect(axiosMock.post).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/auth/reset-password'),
      { token: 'reset-token', new_password: 'secret1234' },
    )
  })

  it('refreshes an expired access token before building authenticated headers', async () => {
    saveSession({
      token: buildToken(-10),
      accessToken: buildToken(-10),
      refreshToken: 'refresh-3',
      tokenType: 'Bearer',
      accessTokenExpiresAt: null,
      user: { id: 3, name: 'Cris', email: 'cris@brand.com', is_active: true, created_at: '', updated_at: '' },
      tenant: { id: 12, name: 'Brand 3', slug: 'brand-3', business_model: 'product', plan: 'pro', is_active: true, created_at: '', updated_at: '' },
    })

    const refreshedAccessToken = buildToken(300)
    axiosMock.post.mockResolvedValueOnce({
      data: {
        accessToken: refreshedAccessToken,
        refreshToken: 'refresh-4',
        tokenType: 'Bearer',
        expiresIn: 300,
        user: { id: 3, name: 'Cris', email: 'cris@brand.com', is_active: true, created_at: '', updated_at: '' },
        tenant: { id: 12, name: 'Brand 3', slug: 'brand-3', business_model: 'product', plan: 'pro', is_active: true, created_at: '', updated_at: '' },
      },
    })

    const headers = await buildAuthenticatedHeaders({ 'Content-Type': 'application/json' })

    expect(headers?.Authorization).toBe(`Bearer ${refreshedAccessToken}`)
    expect(loadSession()?.refreshToken).toBe('refresh-4')
  })

  it('bootstraps user and tenant from TypeScript auth endpoints', async () => {
    saveSession({
      token: buildToken(300),
      accessToken: buildToken(300),
      refreshToken: 'refresh-5',
      tokenType: 'Bearer',
      accessTokenExpiresAt: null,
      user: { id: 4, name: 'Old', email: 'old@brand.com', is_active: true, created_at: '', updated_at: '' },
      tenant: { id: 13, name: 'Old Brand', slug: 'old-brand', business_model: 'hybrid', plan: 'basic', is_active: true, created_at: '', updated_at: '' },
    })

    axiosMock.get
      .mockResolvedValueOnce({ data: { id: 5, name: 'Nova', email: 'nova@brand.com', is_active: true, created_at: '', updated_at: '' } })
      .mockResolvedValueOnce({ data: { id: 14, name: 'Nova Brand', slug: 'nova-brand', business_model: 'professional', plan: 'pro', is_active: true, created_at: '', updated_at: '' } })

    const session = await bootstrapSession()

    expect(session?.user.name).toBe('Nova')
    expect(session?.tenant.slug).toBe('nova-brand')
  })

  it('logs out all sessions through the TypeScript authority and clears local session state', async () => {
    saveSession({
      token: buildToken(300),
      accessToken: buildToken(300),
      refreshToken: 'refresh-6',
      tokenType: 'Bearer',
      accessTokenExpiresAt: null,
      user: { id: 6, name: 'Dani', email: 'dani@brand.com', is_active: true, created_at: '', updated_at: '' },
      tenant: { id: 15, name: 'Brand 6', slug: 'brand-6', business_model: 'hybrid', plan: 'pro', is_active: true, created_at: '', updated_at: '' },
    })

    axiosMock.post.mockResolvedValueOnce({ data: {} })

    await logoutAllSessions()

    expect(loadSession()).toBeNull()
    expect(axiosMock.post).toHaveBeenCalledTimes(1)
  })
})
