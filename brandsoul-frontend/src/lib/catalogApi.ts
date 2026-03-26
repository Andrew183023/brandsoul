import axios from 'axios'

import { buildApiUrl } from './api'
import type { CatalogItem } from '../types/catalog'
import { getAuthToken } from './session'


function buildCatalogHeaders() {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required.')
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

export async function fetchCatalogItems(): Promise<CatalogItem[]> {
  const response = await axios.get<CatalogItem[]>(buildApiUrl('/admin/catalog'), {
    headers: buildCatalogHeaders(),
  })
  return response.data
}

export async function createCatalogItem(item: CatalogItem): Promise<CatalogItem> {
  const response = await axios.post<CatalogItem>(buildApiUrl('/admin/catalog'), item, {
    headers: buildCatalogHeaders(),
  })
  return response.data
}

export async function updateCatalogItem(itemId: string, item: CatalogItem): Promise<CatalogItem> {
  const response = await axios.put<CatalogItem>(buildApiUrl(`/admin/catalog/${itemId}`), item, {
    headers: buildCatalogHeaders(),
  })
  return response.data
}

export async function deleteCatalogItem(itemId: string): Promise<void> {
  await axios.delete(buildApiUrl(`/admin/catalog/${itemId}`), {
    headers: buildCatalogHeaders(),
  })
}

