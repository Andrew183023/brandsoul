import axios from 'axios'

import { buildApiUrl } from './api'
import type { AuthSession, AuthTenant, AuthUser } from './session'

interface AuthResponse {
  token: string
  user: AuthUser
  tenant: AuthTenant
}

export async function registerAccount(payload: {
  name: string
  email: string
  password: string
  tenant_name: string
  business_model?: 'product' | 'service' | 'hybrid'
}): Promise<AuthSession> {
  const response = await axios.post<AuthResponse>(buildApiUrl('/auth/register'), payload)
  return response.data
}

export async function loginAccount(payload: { email: string; password: string }): Promise<AuthSession> {
  const response = await axios.post<AuthResponse>(buildApiUrl('/auth/login'), payload)
  return response.data
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const response = await axios.get<AuthUser>(buildApiUrl('/auth/me'), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return response.data
}

export async function fetchCurrentTenant(token: string): Promise<AuthTenant> {
  const response = await axios.get<AuthTenant>(buildApiUrl('/tenant/me'), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return response.data
}

