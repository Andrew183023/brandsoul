export type LawyerInboxEventType = 'assignment.created' | 'assignment.expired' | 'assignment.accepted' | 'assignment.rejected'

export type LawyerInboxEvent = {
  type: LawyerInboxEventType
  caseId?: string
  assignmentId?: string
  occurredAt: string
}

export type LawyerInboxEventListener = (event: LawyerInboxEvent) => void

const listenersByChannel = new Map<string, Set<LawyerInboxEventListener>>()

export function getLawyerInboxChannel(tenantId: number, professionalId: string) {
  return `lawyer:${tenantId}:${professionalId}`
}

export function subscribe(channel: string, listener: LawyerInboxEventListener) {
  const channelListeners = listenersByChannel.get(channel) ?? new Set<LawyerInboxEventListener>()
  channelListeners.add(listener)
  listenersByChannel.set(channel, channelListeners)
}

export function unsubscribe(channel: string, listener: LawyerInboxEventListener) {
  const channelListeners = listenersByChannel.get(channel)
  if (!channelListeners) {
    return
  }

  channelListeners.delete(listener)
  if (channelListeners.size === 0) {
    listenersByChannel.delete(channel)
  }
}

export function publish(channel: string, event: LawyerInboxEvent) {
  const channelListeners = listenersByChannel.get(channel)
  if (!channelListeners || channelListeners.size === 0) {
    return
  }

  for (const listener of channelListeners) {
    listener(event)
  }
}

export function getLawyerInboxListenerCountForTesting() {
  let total = 0
  for (const listeners of listenersByChannel.values()) {
    total += listeners.size
  }
  return total
}

export function clearLawyerInboxListenersForTesting() {
  listenersByChannel.clear()
}