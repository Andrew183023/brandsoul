import axios from 'axios'

import { buildApiUrl } from './api'
import type { BrandPersona } from './persona'
import { getAuthToken } from './session'


function buildSparkHeaders() {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required.')
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

export async function fetchSpark(): Promise<BrandPersona> {
  const response = await axios.get<BrandPersona>(buildApiUrl('/admin/spark'), {
    headers: buildSparkHeaders(),
  })
  return response.data
}

export async function saveSpark(persona: BrandPersona): Promise<BrandPersona> {
  const response = await axios.put<BrandPersona>(buildApiUrl('/admin/spark'), persona, {
    headers: buildSparkHeaders(),
  })
  return response.data
}

