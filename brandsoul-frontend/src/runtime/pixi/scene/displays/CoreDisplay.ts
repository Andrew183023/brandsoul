import type { PixiSceneSpec } from '../../adapters/specAdapter'
import type { PixiShapeData } from '../../adapters/shapeAdapter'

type PixiModule = typeof import('pixi.js')

function hexToNumber(color: string) {
  return Number.parseInt(color.replace('#', ''), 16)
}

export class CoreDisplay {
  private readonly pixi: PixiModule
  private readonly container: import('pixi.js').Container
  private readonly base: import('pixi.js').Graphics
  private readonly accent: import('pixi.js').Graphics
  private readonly detail: import('pixi.js').Graphics
  private spec?: PixiSceneSpec
  private shape?: PixiShapeData
  private active = true
  private time = 0
  private readonly tick: import('pixi.js').TickerCallback<number>

  constructor(args: { pixi: PixiModule }) {
    this.pixi = args.pixi
    this.container = new this.pixi.Container()
    this.base = new this.pixi.Graphics()
    this.accent = new this.pixi.Graphics()
    this.detail = new this.pixi.Graphics()
    this.container.addChild(this.base, this.accent, this.detail)
    this.tick = (ticker) => {
      if (!this.active || !this.spec?.showCore || this.spec.shapeOnly || !this.shape || !this.spec.corePreset) {
        return
      }
      if (this.spec.timelineState?.active) {
        return
      }
      this.time += 0.016 * ticker.deltaTime
      this.redraw()
    }
  }

  mount(parent: import('pixi.js').Container, ticker: import('pixi.js').Ticker) {
    parent.addChild(this.container)
    ticker.add(this.tick)
  }

  update(args: { spec: PixiSceneSpec; shape?: PixiShapeData }) {
    this.spec = args.spec
    this.shape = args.shape
    this.redraw()
  }

  setActive(active: boolean) {
    this.active = active
  }

  destroy(ticker: import('pixi.js').Ticker) {
    ticker.remove(this.tick)
    this.container.destroy({ children: true })
  }

  private redraw() {
    this.base.clear()
    this.accent.clear()
    this.detail.clear()

    if (!this.spec?.showCore || this.spec.shapeOnly || !this.shape || !this.spec.corePreset) {
      return
    }

    const preset = this.spec.corePreset
    const accentColor = hexToNumber(this.spec.accent)
    const energyColor = hexToNumber(this.spec.energy ?? this.spec.secondary)
    const neutralColor = hexToNumber(this.spec.neutral ?? this.spec.secondary)
    const timelineState = this.spec.timelineState
    const finalReveal = this.spec.finalReveal && !timelineState?.active
    const coreDominance = this.spec.finishPlan?.coreDominance ?? 0.76
    const modeCoreBoost = this.spec.mode === 'centelha' ? 1.18 : this.spec.mode === 'robo-ia' ? 0.82 : 1
    const pulseVisibility = this.spec.mode === 'centelha' ? 0.36 : this.spec.mode === 'robo-ia' ? 0.18 : 0.24
    const pulse =
      timelineState?.active
        ? (timelineState.coreScale ?? 1) + (timelineState.coreFlare ?? 0) * 0.08
        : 1 + Math.sin(this.time * (finalReveal ? preset.rhythmSpeed * 0.7 : preset.rhythmSpeed)) * (finalReveal ? preset.pulse * pulseVisibility : preset.pulse * (0.54 + coreDominance * 0.44))
    const cx = this.shape.centroid.x + preset.offsetX
    const cy = this.shape.centroid.y + preset.offsetY
    const radius = preset.radius * (1 + coreDominance) * modeCoreBoost * pulse * (finalReveal ? 0.84 : 1)
    const alphaBoost = (timelineState?.coreOpacity ?? 1) * (finalReveal ? 0.72 : 1)
    const flareBoost = timelineState?.coreFlare ?? 0
    const baseAlpha = Math.max(0.9, preset.baseAlpha) * alphaBoost
    const accentAlpha = Math.max(0.92, preset.accentAlpha) * alphaBoost
    const detailAlpha = Math.max(0.84, preset.detailAlpha + coreDominance * 0.08) * alphaBoost

    switch (this.spec.mode) {
      case 'centelha':
        this.base.circle(cx, cy, radius * 0.92).fill({ color: accentColor, alpha: baseAlpha })
        this.accent
          .poly([cx, cy - radius * 0.96, cx + radius * 0.46, cy, cx, cy + radius * 0.96, cx - radius * 0.46, cy], true)
          .fill({ color: neutralColor, alpha: accentAlpha + flareBoost * 0.1 })
        this.detail
          .star(cx, cy, 4, radius * 1.48, radius * 0.52)
          .stroke({ color: energyColor, width: 2.8, alpha: detailAlpha + flareBoost * 0.14, join: 'round', cap: 'round' })
        this.detail
          .poly([cx, cy - radius * 1.12, cx, cy + radius * 1.12], false)
          .stroke({ color: accentColor, width: 2.2, alpha: detailAlpha * 0.72 + flareBoost * 0.08, join: 'round', cap: 'round' })
        this.detail.circle(cx, cy, radius * 0.18).fill({ color: energyColor, alpha: Math.min(1, detailAlpha * 0.92) })
        break
      case 'elemental':
        this.drawElemental({ cx, cy, radius, accentColor, secondaryColor: energyColor, preset })
        break
      case 'natureza':
        this.base.circle(cx, cy, radius * 0.82).fill({ color: accentColor, alpha: baseAlpha })
        this.accent
          .poly([cx, cy - radius * 0.92, cx + radius * 0.4, cy + radius * 0.18, cx, cy + radius * 0.9, cx - radius * 0.46, cy + radius * 0.12], true)
          .fill({ color: energyColor, alpha: accentAlpha })
        this.detail
          .poly([cx, cy + radius * 0.18, cx, cy - radius * 0.74], false)
          .stroke({ color: neutralColor, width: 1.8, alpha: detailAlpha * 0.82, join: 'round', cap: 'round' })
        break
      case 'robo-ia':
        this.base.roundRect(cx - radius, cy - radius, radius * 2, radius * 2, 6).fill({
          color: accentColor,
          alpha: Math.max(0.9, preset.baseAlpha * 0.96) * alphaBoost,
        })
        this.accent.roundRect(cx - radius * 0.58, cy - radius * 0.58, radius * 1.16, radius * 1.16, 4).stroke({
          color: energyColor,
          width: 2.3,
          alpha: Math.max(0.88, preset.accentAlpha * 0.88) * alphaBoost,
        })
        this.detail
          .poly([cx - radius * 1.36, cy - radius * 0.84, cx - radius * 1.02, cy - radius * 0.84, cx - radius * 1.02, cy + radius * 0.84, cx - radius * 1.36, cy + radius * 0.84], false)
          .stroke({ color: neutralColor, width: 2.3, alpha: detailAlpha * 0.72, join: 'miter', cap: 'square' })
        this.detail
          .poly([cx + radius * 1.36, cy - radius * 0.84, cx + radius * 1.02, cy - radius * 0.84, cx + radius * 1.02, cy + radius * 0.84, cx + radius * 1.36, cy + radius * 0.84], false)
          .stroke({ color: neutralColor, width: 2.3, alpha: detailAlpha * 0.72, join: 'miter', cap: 'square' })
        break
    }
  }

  private drawElemental(args: {
    cx: number
    cy: number
    radius: number
    accentColor: number
    secondaryColor: number
    preset: NonNullable<PixiSceneSpec['corePreset']>
  }) {
    const { cx, cy, radius, accentColor, secondaryColor, preset } = args
    const alphaBoost = this.spec?.timelineState?.coreOpacity ?? 1

    switch (this.spec?.variant) {
      case 'agua':
        this.base.ellipse(cx, cy, radius * 1.16, radius * 0.72).fill({ color: accentColor, alpha: preset.baseAlpha * alphaBoost })
        this.accent.ellipse(cx, cy + radius * 0.08, radius * 0.64, radius * 0.34).stroke({
          color: secondaryColor,
          width: 2.2,
          alpha: preset.accentAlpha * alphaBoost,
        })
        break
      case 'fogo':
        this.base
          .poly([cx - radius * 0.7, cy + radius * 0.66, cx - radius * 0.1, cy - radius * 1.12, cx + radius * 0.24, cy - radius * 0.24, cx + radius * 0.72, cy - radius * 1.36, cx + radius * 0.92, cy + radius * 0.56], true)
          .fill({ color: accentColor, alpha: preset.baseAlpha * alphaBoost })
        this.accent.circle(cx, cy - radius * 0.12, radius * 0.36).fill({ color: 0xffffff, alpha: preset.accentAlpha * alphaBoost })
        break
      case 'terra':
        this.base.roundRect(cx - radius * 1.1, cy - radius * 0.54, radius * 2.2, radius * 1.18, 6).fill({
          color: accentColor,
          alpha: preset.baseAlpha * alphaBoost,
        })
        this.accent.roundRect(cx - radius * 0.74, cy - radius * 0.26, radius * 1.48, radius * 0.54, 4).fill({
          color: secondaryColor,
          alpha: preset.accentAlpha * alphaBoost,
        })
        break
      default:
        this.base.circle(cx, cy, radius * 0.34).fill({ color: accentColor, alpha: preset.baseAlpha * 0.54 * alphaBoost })
        this.accent.ellipse(cx + radius * 0.18, cy - radius * 0.1, radius * 0.9, radius * 0.38).stroke({
          color: secondaryColor,
          width: 1.6,
          alpha: preset.accentAlpha * alphaBoost,
        })
        break
    }
  }
}
