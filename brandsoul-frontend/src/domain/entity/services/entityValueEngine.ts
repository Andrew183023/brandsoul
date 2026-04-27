export function computeEntityAccumulatedValueFromRelational(relational: {
  binding?: { bindingStrength?: number; continuityScore?: number }
  progression?: { level?: number; xp?: number }
  userMemory?: { memoryConfidence?: number }
}, now: string) {
  const bindingStrength = relational.binding?.bindingStrength ?? 0
  const continuityScore = relational.binding?.continuityScore ?? 0
  const level = relational.progression?.level ?? 0
  const xp = relational.progression?.xp ?? 0
  const memoryConfidence = relational.userMemory?.memoryConfidence ?? 0

  return {
    schemaVersion: 1,
    score: Number((bindingStrength * 0.35 + continuityScore * 0.2 + memoryConfidence * 0.2 + level * 0.1 + xp * 0.005).toFixed(4)),
    updatedAt: now,
  }
}