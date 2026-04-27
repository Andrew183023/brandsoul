import axios from 'axios'

import { buildApiUrl } from './api'
import { buildApiHeaders } from './auth'

export interface ScheduleBookingPayload {
  tenant_slug: string
  name: string
  phone: string
  service: string
  attendance_mode: 'presencial' | 'online' | 'domicilio'
  date: string
  time: string
  note?: string
  location_details?: string
}

export interface ScheduleBookingResult {
  id: number
  tenant_slug: string
  status: string
  whatsapp_url?: string | null
  notification_message?: string | null
}

export interface AdminScheduleBookingItem {
  id: number
  name: string
  phone: string
  service: string
  attendance_mode: 'presencial' | 'online' | 'domicilio'
  date: string
  time: string
  note?: string | null
  location_details?: string | null
  status: string
  created_at: string
}

export interface PublicScheduleAvailability {
  tenant_slug: string
  blocked_dates: string[]
  blocked_slots: string[]
  booked_slots: string[]
}

export async function createScheduleBooking(payload: ScheduleBookingPayload) {
  const response = await axios.post<ScheduleBookingResult>(buildApiUrl('/schedule/booking'), payload)
  return response.data
}

export async function fetchAdminBookings() {
  const response = await axios.get<AdminScheduleBookingItem[]>(buildApiUrl('/admin/bookings'), {
    headers: await buildApiHeaders('admin'),
  })
  return response.data
}

export async function fetchPublicScheduleAvailability(slug: string) {
  const response = await axios.get<PublicScheduleAvailability>(buildApiUrl(`/public/brands/${encodeURIComponent(slug)}/schedule`))
  return response.data
}
