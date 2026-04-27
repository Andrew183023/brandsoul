import type { PixiSceneSpec } from '../../adapters/specAdapter'
import type { PixiShapeData } from '../../adapters/shapeAdapter'
import type { VisualFinishLayer } from '../../../../domain/materialization/contracts/VisualFinishPlan'

type PixiModule = typeof import('pixi.js')

function flattenPoints(points: Array<{ x: number; y: number }>) {
  return points.flatMap((point) => [point.x, point.y])
}

function hexToNumber(color: string) {
  return Number.parseInt(color.replace('#', ''), 16)
}

function mixColors(primary: number, secondary: number, ratio: number) {
  const clampedRatio = Math.min(1, Math.max(0, ratio))
  const primaryRed = (primary >> 16) & 0xff
  const primaryGreen = (primary >> 8) & 0xff
  const primaryBlue = primary & 0xff
  const secondaryRed = (secondary >> 16) & 0xff
  const secondaryGreen = (secondary >> 8) & 0xff
  const secondaryBlue = secondary & 0xff

  const red = Math.round(primaryRed + (secondaryRed - primaryRed) * clampedRatio)
  const green = Math.round(primaryGreen + (secondaryGreen - primaryGreen) * clampedRatio)
  const blue = Math.round(primaryBlue + (secondaryBlue - primaryBlue) * clampedRatio)

  return (red << 16) | (green << 8) | blue
}

export class ShapeDisplay {
  private readonly pixi: PixiModule
  private readonly container: import('pixi.js').Container
  private readonly body: import('pixi.js').Graphics
  private readonly detail: import('pixi.js').Graphics
  private readonly edge: import('pixi.js').Graphics
  private spec?: PixiSceneSpec
  private shape?: PixiShapeData
  private active = true
  private time = 0
  private readonly tick: import('pixi.js').TickerCallback<number>

  constructor(args: { pixi: PixiModule }) {
    this.pixi = args.pixi
    this.container = new this.pixi.Container()
    this.body = new this.pixi.Graphics()
    this.detail = new this.pixi.Graphics()
    this.edge = new this.pixi.Graphics()
    this.container.addChild(this.body, this.detail, this.edge)
    this.tick = (ticker) => {
      if (!this.active || !this.spec || (!this.shape && !this.spec.finishPlan) || this.spec.shapeOnly) {
        return
      }
      if (this.spec.timelineState?.active) {
        return
      }
      this.time += 0.016 * ticker.deltaTime
      const pulseStrength = this.spec.finalReveal ? (this.spec.shapePreset?.pulse ?? 0) * 0.16 : this.spec.shapePreset?.pulse ?? 0
      const rhythmSpeed = this.spec.finalReveal ? (this.spec.shapePreset?.rhythmSpeed ?? 1) * 0.72 : this.spec.shapePreset?.rhythmSpeed ?? 1
      const pulse = 1 + Math.sin(this.time * rhythmSpeed) * pulseStrength
      this.container.scale.set(pulse)
    }
  }

  mount(parent: import('pixi.js').Container, ticker: import('pixi.js').Ticker) {
    parent.addChild(this.container)
    ticker.add(this.tick)
  }

  update(args: { spec: PixiSceneSpec; shape?: PixiShapeData }) {
    this.spec = args.spec
    this.shape = args.shape
    this.container.position.set(0, 0)
    const timelineState = args.spec.timelineState
    const finalReveal = args.spec.finalReveal && !timelineState?.active
    const finishScale = args.spec.finishPlan?.shapeScale ?? 1
    const scale = timelineState?.shapeScale ?? ((finalReveal ? 1.02 : 1) * finishScale)
    const deform = timelineState?.shapeDeform ?? (finalReveal ? 0.008 : 0)
    this.container.scale.set(scale * (1 + deform * 0.08), scale * (1 - deform * 0.06))
    this.container.alpha = timelineState?.shapeOpacity ?? 1
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
    this.body.clear()
    this.detail.clear()
    this.edge.clear()

    if (!this.spec || !this.spec.shapePreset) {
      return
    }

    const preset = this.spec.shapePreset
    const accentColor = hexToNumber(this.spec.accent)
    const secondaryColor = hexToNumber(this.spec.secondary)
    const finalReveal = this.spec.finalReveal && !this.spec.timelineState?.active
    const visibilityAlpha = this.spec.timelineState?.shapeOpacity ?? 1

    if (this.drawFinishPlan(accentColor, secondaryColor, preset, finalReveal, visibilityAlpha)) {
      return
    }

    if (!this.shape) {
      return
    }

    const bodyPoints = this.spec.typographicCandidate ? this.shape.basePoints : this.shape.abstractedPoints
    const edgePoints = this.shape.basePoints.length ? this.shape.basePoints : bodyPoints

    if (!bodyPoints.length) {
      return
    }

    this.body.poly(flattenPoints(bodyPoints), true).fill({
      color: accentColor,
      alpha: (finalReveal ? Math.min(1, preset.fillAlpha * 1.04) : preset.fillAlpha) * visibilityAlpha,
    })

    switch (this.spec.fillStrategy) {
      case 'edge-lit':
        this.detail.poly(flattenPoints(edgePoints), true).stroke({
          color: secondaryColor,
          width: preset.edgeWidth + 0.6 + (finalReveal ? 0.4 : 0),
          alpha: (finalReveal ? preset.detailAlpha * 0.72 : preset.detailAlpha) * visibilityAlpha,
          join: 'round',
          cap: 'round',
        })
        break
      case 'solid':
        if (this.spec.mode === 'elemental') {
          this.drawElementalDetail(bodyPoints, secondaryColor, finalReveal ? preset.detailAlpha * 0.62 : preset.detailAlpha)
        }
        break
      case 'textured':
        this.drawOrganicTexture(secondaryColor, finalReveal ? preset.detailAlpha * 0.58 : preset.detailAlpha)
        break
      case 'segmented':
        this.drawSegments(secondaryColor, finalReveal ? preset.detailAlpha * 0.7 : preset.detailAlpha)
        break
    }

    this.edge.poly(flattenPoints(edgePoints), true).stroke({
      color: this.spec.typographicCandidate ? 0xffffff : secondaryColor,
      width: preset.edgeWidth + (finalReveal ? 0.8 : 0),
      alpha: (finalReveal ? Math.min(1, preset.edgeAlpha * 1.08) : preset.edgeAlpha) * visibilityAlpha,
      join: this.spec.mode === 'robo-ia' ? 'miter' : 'round',
      cap: this.spec.mode === 'robo-ia' ? 'square' : 'round',
    })
  }

  private drawFinishPlan(
    accentColor: number,
    secondaryColor: number,
    preset: NonNullable<PixiSceneSpec['shapePreset']>,
    finalReveal: boolean,
    visibilityAlpha: number,
  ) {
    const finishPlan = this.spec?.finishPlan

    if (!this.spec || !finishPlan) {
      return false
    }

    const shellTint = this.spec.mode === 'centelha' ? mixColors(accentColor, secondaryColor, 0.1) : mixColors(accentColor, secondaryColor, 0.18)
    const innerTint = this.spec.mode === 'centelha' ? mixColors(accentColor, secondaryColor, 0.34) : mixColors(accentColor, secondaryColor, 0.24)
    const ridgeTint = this.spec.mode === 'centelha' ? mixColors(accentColor, secondaryColor, 0.9) : mixColors(accentColor, secondaryColor, 0.82)
    const layerJoin = finishPlan.materialProfile.edgeDiscipline === 'sharp' ? 'miter' : 'round'
    const layerCap = finishPlan.materialProfile.edgeDiscipline === 'sharp' ? 'square' : 'round'

    for (const layer of finishPlan.layers) {
      this.drawFinishLayer({
        layer,
        accentColor,
        shellTint,
        innerTint,
        secondaryColor,
        preset,
        finalReveal,
        visibilityAlpha,
        layerJoin,
        layerCap,
      })
    }

    for (const cavity of finishPlan.cavityMasks) {
      const alpha = this.resolveAuxiliaryAlpha('cavity', cavity.depth, finishPlan, preset, visibilityAlpha)
      this.detail.svg(cavity.path).fill({
        color: innerTint,
        alpha,
      })
      this.detail.svg(cavity.path).stroke({
        color: ridgeTint,
        width: 1 + cavity.softness * 0.8,
        alpha: alpha * 0.54,
        join: 'round',
        cap: 'round',
      })
    }

    for (const ridge of finishPlan.ridgePaths) {
      const alpha = this.resolveAuxiliaryAlpha('ridge', ridge.emphasis, finishPlan, preset, visibilityAlpha)
      this.detail.svg(ridge.path).stroke({
        color: ridgeTint,
        width: 0.8 + ridge.weight * 1.6 + (finalReveal ? 0.3 : 0),
        alpha,
        join: layerJoin,
        cap: layerCap,
      })
    }

    for (const bridge of finishPlan.coreBridges) {
      const alpha = this.resolveAuxiliaryAlpha('core-bridge', bridge.tension, finishPlan, preset, visibilityAlpha)
      this.detail.svg(bridge.path).stroke({
        color: this.spec.mode === 'centelha' ? mixColors(accentColor, secondaryColor, 0.68) : mixColors(accentColor, secondaryColor, 0.52),
        width: 0.8 + bridge.weight * 1.2 + (this.spec.mode === 'centelha' ? 0.4 : 0),
        alpha,
        join: 'round',
        cap: 'round',
      })
    }

    const outerShell = finishPlan.layers.find((layer) => layer.role === 'shell')
    if (outerShell) {
      this.edge.svg(outerShell.path).stroke({
        color: this.spec.typographicCandidate ? 0xffffff : secondaryColor,
        width: preset.edgeWidth + (finalReveal ? 0.8 : 0),
        alpha: (finalReveal ? Math.min(1, preset.edgeAlpha * 1.08) : preset.edgeAlpha) * visibilityAlpha,
        join: layerJoin,
        cap: layerCap,
      })
    }

    return true
  }

  private drawFinishLayer(args: {
    layer: VisualFinishLayer
    accentColor: number
    shellTint: number
    innerTint: number
    secondaryColor: number
    preset: NonNullable<PixiSceneSpec['shapePreset']>
    finalReveal: boolean
    visibilityAlpha: number
    layerJoin: 'round' | 'miter'
    layerCap: 'round' | 'square'
  }) {
    const {
      layer,
      accentColor,
      shellTint,
      innerTint,
      secondaryColor,
      preset,
      finalReveal,
      visibilityAlpha,
      layerJoin,
      layerCap,
    } = args

    const fillColor =
      layer.role === 'inner-shell'
        ? innerTint
        : layer.role === 'plate' || layer.role === 'band'
          ? mixColors(accentColor, secondaryColor, 0.16)
          : shellTint
    const alphaMultiplier = this.resolveLayerAlphaMultiplier(layer)
    const contrastBoost = this.spec?.mode === 'robo-ia' ? 1.08 : this.spec?.mode === 'centelha' ? 1.06 : 1

    if (layer.renderMode === 'fill') {
      this.body.svg(layer.path).fill({
        color: fillColor,
        alpha: preset.fillAlpha * layer.alpha * alphaMultiplier * contrastBoost * (finalReveal ? 1.04 : 1) * visibilityAlpha,
      })
      return
    }

    this.body.svg(layer.path).stroke({
      color: layer.role === 'band' ? secondaryColor : fillColor,
      width: (layer.strokeWidth ?? 1.6) + layer.emphasis * 0.8 + (this.spec?.mode === 'robo-ia' ? 0.5 : 0),
      alpha: preset.detailAlpha * layer.alpha * alphaMultiplier * contrastBoost * visibilityAlpha,
      join: layerJoin,
      cap: layerCap,
    })
  }

  private resolveLayerAlphaMultiplier(layer: VisualFinishLayer) {
    if (!this.spec?.finishPlan) {
      return 1
    }

    const finishPlan = this.spec.finishPlan
    if (layer.role === finishPlan.primaryLayerRole) {
      return 1
    }
    if (layer.role === finishPlan.secondaryLayerRole) {
      return 0.68
    }

    return 0.18
  }

  private resolveAuxiliaryAlpha(
    role: 'ridge' | 'cavity' | 'core-bridge',
    emphasis: number,
    finishPlan: NonNullable<PixiSceneSpec['finishPlan']>,
    preset: NonNullable<PixiSceneSpec['shapePreset']>,
    visibilityAlpha: number,
  ) {
    if (finishPlan.surfaceBias === 'smooth') {
      return preset.detailAlpha * 0.1 * visibilityAlpha
    }

    const roleBoost = role === 'core-bridge' ? 0.22 : role === 'ridge' ? 0.18 : 0.14
    if (this.spec?.mode === 'centelha') {
      if (role === 'core-bridge') {
        return preset.detailAlpha * (0.18 + emphasis * 0.3) * visibilityAlpha
      }

      if (role === 'ridge') {
        return preset.detailAlpha * (0.08 + emphasis * 0.14) * visibilityAlpha
      }
    }

    return preset.detailAlpha * (0.1 + emphasis * roleBoost) * visibilityAlpha
  }

  private drawElementalDetail(points: Array<{ x: number; y: number }>, color: number, alpha: number) {
    if (!this.shape) {
      return
    }

    switch (this.spec?.variant) {
      case 'agua':
        this.detail.ellipse(this.shape.centroid.x, this.shape.centroid.y + 6, this.shape.bounds.width * 0.28, this.shape.bounds.height * 0.16).stroke({
          color,
          width: 2,
          alpha,
        })
        break
      case 'fogo':
        this.detail
          .poly([this.shape.centroid.x - 10, this.shape.centroid.y + 12, this.shape.centroid.x, this.shape.centroid.y - 24, this.shape.centroid.x + 10, this.shape.centroid.y + 8], false)
          .stroke({ color, width: 2.6, alpha, join: 'round', cap: 'round' })
        break
      case 'terra':
        this.detail.roundRect(this.shape.centroid.x - this.shape.bounds.width * 0.2, this.shape.centroid.y + this.shape.bounds.height * 0.08, this.shape.bounds.width * 0.4, 12, 4).fill({
          color,
          alpha: alpha * 0.7,
        })
        break
      default:
        this.detail.poly(flattenPoints(points.slice(0, Math.min(points.length, 8))), false).stroke({
          color,
          width: 1.8,
          alpha,
          join: 'round',
          cap: 'round',
        })
        break
    }
  }

  private drawOrganicTexture(color: number, alpha: number) {
    if (!this.shape) {
      return
    }

    this.detail.circle(this.shape.centroid.x - this.shape.bounds.width * 0.16, this.shape.centroid.y - this.shape.bounds.height * 0.12, 4).fill({
      color,
      alpha,
    })
    this.detail.circle(this.shape.centroid.x + this.shape.bounds.width * 0.12, this.shape.centroid.y + this.shape.bounds.height * 0.08, 3).fill({
      color,
      alpha: alpha * 0.82,
    })
    this.detail
      .poly([this.shape.centroid.x, this.shape.centroid.y - 14, this.shape.centroid.x + 6, this.shape.centroid.y + 10], false)
      .stroke({ color, width: 1.8, alpha: alpha * 0.9, join: 'round', cap: 'round' })
  }

  private drawSegments(color: number, alpha: number) {
    if (!this.shape) {
      return
    }

    const left = this.shape.centroid.x - this.shape.bounds.width * 0.22
    const right = this.shape.centroid.x + this.shape.bounds.width * 0.22
    const top = this.shape.centroid.y - this.shape.bounds.height * 0.18
    const bottom = this.shape.centroid.y + this.shape.bounds.height * 0.18
    this.detail.moveTo(left, this.shape.centroid.y).lineTo(right, this.shape.centroid.y).stroke({
      color,
      width: 1.8,
      alpha,
      join: 'miter',
      cap: 'square',
    })
    this.detail.moveTo(this.shape.centroid.x, top).lineTo(this.shape.centroid.x, bottom).stroke({
      color,
      width: 1.4,
      alpha: alpha * 0.84,
      join: 'miter',
      cap: 'square',
    })
  }
}
