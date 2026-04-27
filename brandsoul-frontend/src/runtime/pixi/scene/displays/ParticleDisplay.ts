import { createEmitter, updateParticles, type ParticleEmitter } from '../../../../personaLab/engine'
import type { PixiSceneSpec } from '../../adapters/specAdapter'
import type { PixiShapeData } from '../../adapters/shapeAdapter'
import { parsePixiColor } from '../../lib/color'

type PixiModule = typeof import('pixi.js')

type ParticleBudgetLevel = 'low' | 'medium' | 'high'

function resolveStageBudget(spec: PixiSceneSpec): ParticleBudgetLevel {
  if (spec.finalReveal && !spec.timelineState?.active) {
    return 'low'
  }
  const stageId = spec.timelineState?.id
  if (!stageId || !spec.particleBudget) {
    return 'medium'
  }

  if (stageId === 'stabilize') {
    return spec.particleBudget.stabilize
  }

  if (stageId === 'logo-entry' || stageId === 'distill' || stageId === 'seed-origin' || stageId === 'signal-entry') {
    return spec.particleBudget.initial
  }

  if (stageId === 'ignite' || stageId === 'flare' || stageId === 'dominate' || stageId === 'bloom' || stageId === 'assemble') {
    return spec.particleBudget.climax
  }

  return spec.particleBudget.mid
}

function getBudgetMultipliers(level: ParticleBudgetLevel, spec: PixiSceneSpec) {
  const base =
    level === 'low'
      ? {
          spawn: 0.18,
          maxParticles: 0.22,
          size: 0.64,
          alpha: 0.32,
          speed: 0.62,
          spread: 0.42,
          lifetime: 0.6,
          blendMode: 'normal' as const,
        }
      : level === 'high'
        ? {
            spawn: 1,
            maxParticles: 1,
            size: 1,
            alpha: 1,
            speed: 1,
            spread: 1,
            lifetime: 1,
            blendMode: 'add' as const,
          }
        : {
            spawn: 0.44,
            maxParticles: 0.5,
            size: 0.78,
            alpha: 0.56,
            speed: 0.74,
            spread: 0.62,
            lifetime: 0.72,
            blendMode: 'normal' as const,
          }

  if (spec.mode === 'centelha') {
    return level === 'low'
      ? { ...base, spread: base.spread * 0.82, size: base.size * 0.9 }
      : level === 'high'
        ? { ...base, blendMode: 'add' as const }
        : { ...base, spread: base.spread * 0.92 }
  }

  if (spec.mode === 'natureza') {
    return level === 'low'
      ? { ...base, spread: base.spread * 0.88, alpha: base.alpha * 0.9 }
      : level === 'high'
        ? { ...base, alpha: base.alpha * 0.9 }
        : base
  }

  if (spec.mode === 'robo-ia') {
    return level === 'high'
      ? { ...base, alpha: base.alpha * 0.82, size: base.size * 0.8, spread: base.spread * 0.7, blendMode: 'normal' as const }
      : { ...base, alpha: base.alpha * 0.76, spread: base.spread * 0.62, size: base.size * 0.78, blendMode: 'normal' as const }
  }

  if (spec.variant === 'fogo') {
    return level === 'low'
      ? { ...base, spread: base.spread * 0.74, speed: base.speed * 0.82 }
      : level === 'high'
        ? { ...base, blendMode: 'add' as const, alpha: base.alpha * 0.94 }
        : { ...base, spread: base.spread * 0.86 }
  }

  return base
}

function buildEmitterKey(spec: PixiSceneSpec, shape?: PixiShapeData) {
  const config = spec.particlePreset?.emitterConfig
  if (!config) {
    return 'none'
  }

  const origin = shape?.centroid ?? config.origin ?? { x: 0, y: 0 }
  return JSON.stringify({
    mode: spec.mode,
    variant: spec.variant,
    intensity: spec.intensity,
    originX: Math.round(origin.x),
    originY: Math.round(origin.y),
    spawnRate: config.spawnRate,
    maxParticles: config.maxParticles,
    size: config.size,
    velocity: config.velocity,
    direction: config.direction,
    lifetime: config.lifetime,
    colors: config.color,
    preset: spec.particlePreset,
  })
}

export class ParticleDisplay {
  private readonly pixi: PixiModule
  private readonly container: import('pixi.js').Container
  private readonly graphics: import('pixi.js').Graphics
  private emitter?: ParticleEmitter
  private emitterKey?: string
  private spec?: PixiSceneSpec
  private shape?: PixiShapeData
  private active = true
  private lastTimestamp = performance.now()
  private accumulatedDelta = 0
  private readonly tick: import('pixi.js').TickerCallback<number>

  constructor(args: { pixi: PixiModule }) {
    this.pixi = args.pixi
    this.container = new this.pixi.Container()
    this.graphics = new this.pixi.Graphics()
    this.container.addChild(this.graphics)
    this.tick = () => {
      this.updateFrame()
    }
  }

  mount(parent: import('pixi.js').Container, ticker: import('pixi.js').Ticker) {
    parent.addChild(this.container)
    ticker.add(this.tick)
  }

  update(args: { spec: PixiSceneSpec; shape?: PixiShapeData }) {
    this.spec = args.spec
    this.shape = args.shape

    if (!args.spec.showParticles || args.spec.shapeOnly || !args.spec.particlePreset?.emitterConfig) {
      this.emitter = undefined
      this.emitterKey = undefined
      this.graphics.clear()
      return
    }

    const emitterConfig = {
      ...args.spec.particlePreset.emitterConfig,
      origin: args.shape?.centroid ?? args.spec.particlePreset.emitterConfig.origin,
      spawnRate: args.spec.particlePreset.emitterConfig.spawnRate * args.spec.particlePreset.densityMultiplier,
      maxParticles: Math.max(
        6,
        Math.round((args.spec.particlePreset.emitterConfig.maxParticles ?? 24) * args.spec.particlePreset.densityMultiplier),
      ),
      size: {
        min: args.spec.particlePreset.emitterConfig.size.min * args.spec.particlePreset.sizeMultiplier,
        max: args.spec.particlePreset.emitterConfig.size.max * args.spec.particlePreset.sizeMultiplier,
      },
      velocity: {
        min: args.spec.particlePreset.emitterConfig.velocity.min * args.spec.particlePreset.speedMultiplier,
        max: args.spec.particlePreset.emitterConfig.velocity.max * args.spec.particlePreset.speedMultiplier,
      },
    }

    const emitterKey = buildEmitterKey(args.spec, args.shape)
    if (this.emitterKey !== emitterKey || !this.emitter) {
      this.emitter = createEmitter(emitterConfig)
      this.emitterKey = emitterKey
      this.lastTimestamp = performance.now()
      this.accumulatedDelta = 0
      return
    }

    this.emitter.config = {
      ...this.emitter.config,
      ...emitterConfig,
    }
  }

  setActive(active: boolean) {
    this.active = active
  }

  destroy(ticker: import('pixi.js').Ticker) {
    ticker.remove(this.tick)
    this.container.destroy({ children: true })
  }

  private updateFrame() {
    if (!this.active || !this.spec?.showParticles || !this.emitter || !this.spec.particlePreset) {
      return
    }

    const now = performance.now()
    const rawDelta = now - this.lastTimestamp
    this.lastTimestamp = now
    const normalizedDelta = rawDelta > 250 ? 16 : Math.min(34, rawDelta)

    const particlePreset = this.spec.particlePreset
    const timelineState = this.spec.timelineState
    const birthBoost = timelineState?.active ? timelineState.particleBoost : this.spec.timelineProgress !== undefined ? 1 + Math.sin(this.spec.timelineProgress * Math.PI) * 0.8 : 1
    const budgetLevel = resolveStageBudget(this.spec)
    const budget = getBudgetMultipliers(budgetLevel, this.spec)
    const finalReveal = this.spec.finalReveal && !timelineState?.active
    const targetFrameDelta = budgetLevel === 'low' ? 42 : budgetLevel === 'medium' ? 30 : 18
    this.accumulatedDelta += normalizedDelta
    if (this.accumulatedDelta < targetFrameDelta) {
      return
    }
    const delta = this.accumulatedDelta
    this.accumulatedDelta = 0
    const baseConfig = particlePreset.emitterConfig
    if (!baseConfig) {
      return
    }

    this.emitter.config.origin = this.shape?.centroid ?? baseConfig.origin
    this.emitter.config.spawnRate = baseConfig.spawnRate * particlePreset.densityMultiplier * birthBoost * budget.spawn
    this.emitter.config.maxParticles = Math.max(
      4,
      Math.min(finalReveal ? 12 : 32, Math.round((baseConfig.maxParticles ?? 24) * particlePreset.densityMultiplier * budget.maxParticles * (finalReveal ? 0.42 : 1))),
    )
    this.emitter.config.size = {
      min: baseConfig.size.min * particlePreset.sizeMultiplier * budget.size,
      max: baseConfig.size.max * particlePreset.sizeMultiplier * budget.size * (finalReveal ? 0.7 : 1),
    }
    this.emitter.config.velocity = {
      min: baseConfig.velocity.min * particlePreset.speedMultiplier * budget.speed,
      max: baseConfig.velocity.max * particlePreset.speedMultiplier * budget.speed,
    }
    this.emitter.config.direction = {
      angle: baseConfig.direction.angle,
      spread: baseConfig.direction.spread * budget.spread,
    }
    this.emitter.config.lifetime = {
      min: baseConfig.lifetime.min * budget.lifetime,
      max: baseConfig.lifetime.max * budget.lifetime,
    }
    this.emitter.config.opacity = {
      start: baseConfig.opacity.start * budget.alpha * (finalReveal ? 0.46 : 1),
      end: baseConfig.opacity.end,
    }

    updateParticles(this.emitter, delta)

    this.graphics.clear()
    this.graphics.blendMode = budget.blendMode

    for (const particle of this.emitter.particles) {
      const parsedColor = parsePixiColor(particle.color)
      const radius = Math.max(1, particle.size * (1 - particle.age / particle.lifetime / 5))
      this.graphics.circle(particle.position.x, particle.position.y, radius).fill({
        color: parsedColor.color,
        alpha: particle.opacity * particlePreset.alpha * parsedColor.alpha * (timelineState?.particleOpacity ?? 1),
      })
    }
  }
}
