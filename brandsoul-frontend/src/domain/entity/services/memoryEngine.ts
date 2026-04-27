export function initializeUserMemory() {
  const now = new Date().toISOString()

  return {
    schemaVersion: 1,
    knownPreferences: [],
    lastInteractions: [],
    recentInterests: [],
    recurringTopics: [],
    memoryConfidence: 0,
    lastSeenAt: now,
    lastActiveAt: now,
    updatedAt: now,
  }
}