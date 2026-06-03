import type { AdminLegalCase, AdminLegalCaseMessage } from '../backend-bridge/api/adminApi'
import type { StatusChipTone } from '../components/StatusChip'

export function formatCaseMonetizationAmount(amountCents = 2_000, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(amountCents / 100)
}

export function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function formatCaseStatus(status: AdminLegalCase['status']) {
  if (status === 'closed') return 'finalizado'
  if (status === 'pending') return 'pendente'
  if (status === 'dispatched') return 'enviado ao responsável'
  if (status === 'accepted') return 'aceito'
  if (status === 'in_progress') return 'em atendimento'
  return 'caso aberto'
}

export function formatCustomerCaseStatus(status: AdminLegalCase['status']) {
  if (status === 'closed') return 'finalizado'
  if (status === 'pending') return 'pendente'
  if (status === 'dispatched' || status === 'accepted' || status === 'in_progress') return 'em atendimento'
  return 'aguardando advogado'
}

export function resolveCaseStatusClassName(status: AdminLegalCase['status']) {
  return [
    'admin-status-chip',
    status === 'dispatched' || status === 'accepted' || status === 'in_progress'
      ? 'admin-status-chip--approved'
      : status === 'closed'
        ? 'admin-status-chip--rejected'
        : 'admin-status-chip--draft',
  ].join(' ')
}

export function resolveCaseStatusTone(status: AdminLegalCase['status']): StatusChipTone {
  if (status === 'dispatched' || status === 'accepted' || status === 'in_progress') return 'success'
  if (status === 'closed') return 'danger'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

export function formatMessageRole(role: AdminLegalCaseMessage['role']) {
  if (role === 'lawyer') {
    return 'advogado'
  }

  if (role === 'system') {
    return 'sistema'
  }

  return 'cliente'
}
