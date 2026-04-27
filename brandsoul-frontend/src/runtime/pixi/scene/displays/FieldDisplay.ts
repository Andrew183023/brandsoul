import type { PixiSceneSpec } from '../../adapters/specAdapter'
import type { PixiShapeData } from '../../adapters/shapeAdapter'

type PixiModule = typeof import('pixi.js')

type FieldBudgetLevel = 'low' | 'medium' | 'high'

type FieldSemantics = {
  bodyType: NonNullable<PixiSceneSpec['finishPlan']>['bodyType'] | 'fallback'
  surfaceBias: NonNullable<PixiSceneSpec['finishPlan']>['surfaceBias'] | 'smooth'
  coreDominance: number
  presenceStyle: NonNullable<PixiSceneSpec['personaDNA']>['presenceStyle'] | 'balanced'
  fieldAttachment: number
  contourAdhesion: number
  radiality: number
  precision: number
  asymmetry: number
  colorIntensity: number
  hazeSuppression: number
  pulseFocus: number
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function scaleOutline(points: Array<{ x: number; y: number }>, centroid: { x: number; y: number }, factor: number) {
  return points.map((point) => ({
    x: centroid.x + (point.x - centroid.x) * factor,
    y: centroid.y + (point.y - centroid.y) * factor,
  }))
}

function flattenPoints(points: Array<{ x: number; y: number }>) {
  return points.flatMap((point) => [point.x, point.y])
}

function hexToNumber(color: string) {
  return Number.parseInt(color.replace('#', ''), 16)
}

function mixColors(primary: number, secondary: number, ratio: number) {
  const clampedRatio = clamp(ratio)
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

function offsetOutline(points: Array<{ x: number; y: number }>, offsetX: number, offsetY: number) {
  return points.map((point) => ({
    x: point.x + offsetX,
    y: point.y + offsetY,
  }))
}

function resolveFieldSemantics(spec: PixiSceneSpec): FieldSemantics {
  const finishPlan = spec.finishPlan
  const anatomy = spec.runtimeSceneSpec?.anatomy
  const presenceStyle = spec.personaDNA?.presenceStyle ?? 'balanced'
  const fieldAttachment = clamp(anatomy?.fieldAttachment ?? finishPlan?.materialProfile.contourAdhesion ?? 0.62, 0.36, 1)
  const contourAdhesion = clamp(finishPlan?.materialProfile.contourAdhesion ?? fieldAttachment, 0.4, 1)
  const coreDominance = clamp(finishPlan?.coreDominance ?? 0.76, 0.7, 1)
  const bodyType = finishPlan?.bodyType ?? 'fallback'
  const surfaceBias = finishPlan?.surfaceBias ?? 'smooth'
  const radiality =
    spec.mode === 'centelha'
      ? 0.92
      : bodyType === 'orbital'
        ? 0.82
        : bodyType === 'organic'
          ? 0.44
          : 0.28
  const precision =
    spec.mode === 'robo-ia'
      ? 0.94
      : bodyType === 'geometric'
        ? 0.86
        : bodyType === 'linear'
          ? 0.72
          : 0.42
  const asymmetry =
    bodyType === 'organic'
      ? 0.54
      : surfaceBias === 'veined'
        ? 0.46
        : presenceStyle === 'dominant'
          ? 0.18
          : 0.08
  const colorIntensity =
    spec.mode === 'centelha'
      ? 0.96
      : spec.mode === 'robo-ia'
        ? 0.72
        : surfaceBias === 'plated'
          ? 0.78
          : 0.82
  const hazeSuppression =
    spec.mode === 'robo-ia'
      ? 0.94
      : spec.mode === 'centelha'
        ? 0.72
        : 0.8
  const pulseFocus =
    spec.mode === 'centelha'
      ? 0.96
      : spec.mode === 'robo-ia'
        ? 0.42
        : 0.62

  return {
    bodyType,
    surfaceBias,
    coreDominance,
    presenceStyle,
    fieldAttachment,
    contourAdhesion,
    radiality,
    precision,
    asymmetry,
    colorIntensity,
    hazeSuppression,
    pulseFocus,
  }
}

function resolveStageBudget(spec: PixiSceneSpec): FieldBudgetLevel {
  if (spec.finalReveal && !spec.timelineState?.active) {
    return 'low'
  }
  const stageId = spec.timelineState?.id
  if (!stageId || !spec.fieldBudget) {
    return 'medium'
  }

  if (stageId === 'stabilize') {
    return spec.fieldBudget.stabilize
  }

  if (stageId === 'logo-entry' || stageId === 'distill' || stageId === 'seed-origin' || stageId === 'signal-entry') {
    return spec.fieldBudget.initial
  }

  if (stageId === 'ignite' || stageId === 'flare' || stageId === 'dominate' || stageId === 'bloom' || stageId === 'assemble') {
    return spec.fieldBudget.climax
  }

  return spec.fieldBudget.mid
}

function getFieldBudgetMultipliers(level: FieldBudgetLevel, spec: PixiSceneSpec) {
  const base =
    level === 'low'
      ? {
          spread: 0.72,
          baseAlpha: 0.34,
          accentAlpha: 0.3,
          detailAlpha: 0.24,
          pulse: 0.28,
          detailScale: 0.72,
        }
      : level === 'high'
        ? {
            spread: 1,
            baseAlpha: 1,
            accentAlpha: 1,
            detailAlpha: 1,
            pulse: 1,
            detailScale: 1,
          }
        : {
            spread: 0.84,
            baseAlpha: 0.58,
            accentAlpha: 0.52,
            detailAlpha: 0.46,
            pulse: 0.54,
            detailScale: 0.84,
          }

  if (spec.mode === 'centelha') {
    return level === 'low'
      ? { ...base, spread: base.spread * 0.82, detailScale: base.detailScale * 0.8 }
      : base
  }

  if (spec.mode === 'natureza') {
    return level === 'low'
      ? { ...base, spread: base.spread * 0.78, detailScale: base.detailScale * 0.72 }
      : level === 'medium'
        ? { ...base, spread: base.spread * 0.9 }
        : base
  }

  if (spec.mode === 'robo-ia') {
    return level === 'low'
      ? { ...base, spread: base.spread * 0.74, accentAlpha: base.accentAlpha * 0.7, detailAlpha: base.detailAlpha * 0.68, detailScale: base.detailScale * 0.76 }
      : { ...base, accentAlpha: base.accentAlpha * 0.86, detailAlpha: base.detailAlpha * 0.82 }
  }

  if (spec.variant === 'fogo') {
    return level === 'low'
      ? { ...base, spread: base.spread * 0.74, detailScale: base.detailScale * 0.7 }
      : base
  }

  if (spec.variant === 'agua') {
    return level === 'low'
      ? { ...base, spread: base.spread * 0.8, detailScale: base.detailScale * 0.78 }
      : base
  }

  if (spec.variant === 'terra') {
    return level === 'low'
      ? { ...base, spread: base.spread * 0.7, detailScale: base.detailScale * 0.82 }
      : base
  }

  if (spec.variant === 'ar') {
    return level === 'low'
      ? { ...base, spread: base.spread * 0.76, detailScale: base.detailScale * 0.74 }
      : base
  }

  return base
}

export class FieldDisplay {
  private readonly pixi: PixiModule
  private readonly container: import('pixi.js').Container
  private readonly base: import('pixi.js').Graphics
  private readonly accent: import('pixi.js').Graphics
  private readonly detail: import('pixi.js').Graphics
  private spec?: PixiSceneSpec
  private shape?: PixiShapeData
  private active = true
  private time = 0
  private accumulatedDelta = 0
  private readonly tick: import('pixi.js').TickerCallback<number>

  constructor(args: { pixi: PixiModule }) {
    this.pixi = args.pixi
    this.container = new this.pixi.Container()
    this.base = new this.pixi.Graphics()
    this.accent = new this.pixi.Graphics()
    this.detail = new this.pixi.Graphics()
    this.container.addChild(this.base, this.accent, this.detail)
    this.tick = (ticker) => {
      if (!this.active || !this.spec?.showField || !this.shape) {
        return
      }
      if (this.spec.timelineState?.active) {
        return
      }
      this.accumulatedDelta += ticker.elapsedMS
      if (this.accumulatedDelta < 33) {
        return
      }
      this.time += 0.016 * ticker.deltaTime
      this.accumulatedDelta = 0
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

    if (!this.spec?.showField || this.spec.shapeOnly || !this.shape || !this.spec.fieldPreset) {
      return
    }

    const accentColor = hexToNumber(this.spec.accent)
    const energyColor = hexToNumber(this.spec.energy ?? this.spec.secondary)
    const neutralColor = hexToNumber(this.spec.neutral ?? this.spec.secondary)
    const semantics = resolveFieldSemantics(this.spec)
    const timelineState = this.spec.timelineState
    const budgetLevel = resolveStageBudget(this.spec)
    const budget = getFieldBudgetMultipliers(budgetLevel, this.spec)
    const finalReveal = this.spec.finalReveal && !timelineState?.active
    const spreadTightening = 1 - semantics.fieldAttachment * 0.12 + semantics.radiality * 0.06
    const spread = this.spec.fieldPreset.spread * budget.spread * spreadTightening * (timelineState?.fieldScale ?? 1) * (finalReveal ? 0.74 : 1)
    const corePull = 1 - semantics.coreDominance * 0.08
    const baseOutline = scaleOutline(this.shape.points, this.shape.centroid, spread * corePull)
    const contourLift = 0.04 + (1 - semantics.fieldAttachment) * 0.04 + (semantics.radiality - semantics.precision) * 0.02
    const outerOutline = scaleOutline(this.shape.points, this.shape.centroid, spread + contourLift * budget.detailScale)
    const displacedOutline = semantics.asymmetry > 0.12
      ? offsetOutline(outerOutline, this.shape.bounds.width * 0.018 * semantics.asymmetry, -this.shape.bounds.height * 0.014 * semantics.asymmetry)
      : outerOutline
    const wave = timelineState?.active
      ? 1
      : 1 + Math.sin(this.time * this.spec.fieldPreset.rhythmSpeed) * this.spec.fieldPreset.pulse * budget.pulse * (0.7 + semantics.pulseFocus * 0.4)
    const alphaBoost = timelineState?.fieldOpacity ?? 1
    const baseAlpha = this.resolveBaseAlpha(budget, wave, alphaBoost, finalReveal, semantics)
    const accentAlpha = this.resolveAccentAlpha(budget, alphaBoost, semantics)
    const detailAlpha = this.resolveDetailAlpha(budget, alphaBoost, semantics)
    const fieldShellColor = this.resolveFieldShellColor(accentColor, energyColor, neutralColor, semantics)

    this.base.poly(flattenPoints(baseOutline), true).fill({
      color: fieldShellColor,
      alpha: baseAlpha,
    })

    this.drawContourHints(accentColor, energyColor, detailAlpha, semantics)

    switch (this.spec.mode) {
      case 'centelha':
        this.drawCentelha(accentColor, energyColor, displacedOutline, budget, semantics, accentAlpha, detailAlpha)
        break
      case 'elemental':
        this.drawElemental(accentColor, energyColor, displacedOutline, budget, semantics, accentAlpha, detailAlpha)
        break
      case 'natureza':
        this.drawNatureza(accentColor, energyColor, neutralColor, displacedOutline, budget, semantics, accentAlpha, detailAlpha)
        break
      case 'robo-ia':
        this.drawRobo(accentColor, energyColor, neutralColor, displacedOutline, budget, semantics, accentAlpha, detailAlpha)
        break
    }
  }

  private resolveBaseAlpha(budget: ReturnType<typeof getFieldBudgetMultipliers>, wave: number, alphaBoost: number, finalReveal: boolean, semantics: FieldSemantics) {
    if (!this.spec?.fieldPreset) {
      return 0
    }

    const adhesionFactor = 0.72 + semantics.fieldAttachment * 0.28
    const containmentFactor = semantics.precision > semantics.radiality ? 0.86 : 1
    const hazeFactor = 1 - semantics.hazeSuppression * 0.2

    return this.spec.fieldPreset.baseAlpha * budget.baseAlpha * wave * alphaBoost * adhesionFactor * containmentFactor * hazeFactor * (finalReveal ? 0.42 : 1)
  }

  private resolveAccentAlpha(budget: ReturnType<typeof getFieldBudgetMultipliers>, alphaBoost: number, semantics: FieldSemantics) {
    if (!this.spec?.fieldPreset) {
      return 0
    }

    return this.spec.fieldPreset.accentAlpha * budget.accentAlpha * alphaBoost * (0.88 + semantics.coreDominance * 0.18 + semantics.colorIntensity * 0.12)
  }

  private resolveDetailAlpha(budget: ReturnType<typeof getFieldBudgetMultipliers>, alphaBoost: number, semantics: FieldSemantics) {
    if (!this.spec?.fieldPreset) {
      return 0
    }

    const biasFactor = semantics.surfaceBias === 'smooth' ? 0.54 : semantics.surfaceBias === 'plated' ? 0.74 : 0.68
    return this.spec.fieldPreset.detailAlpha * budget.detailAlpha * alphaBoost * biasFactor * (0.82 + semantics.colorIntensity * 0.18)
  }

  private resolveFieldShellColor(accentColor: number, energyColor: number, neutralColor: number, semantics: FieldSemantics) {
    if (this.spec?.mode === 'centelha') {
      return mixColors(accentColor, energyColor, 0.14)
    }

    if (this.spec?.mode === 'robo-ia') {
      return mixColors(neutralColor, energyColor, 0.34)
    }

    return mixColors(accentColor, energyColor, 0.22 + (1 - semantics.hazeSuppression) * 0.08)
  }

  private drawContourHints(accentColor: number, energyColor: number, detailAlpha: number, semantics: FieldSemantics) {
    const hints = this.spec?.finishPlan?.fieldContourHints

    if (!hints?.length) {
      return
    }

    for (const hint of hints) {
      const hintAlpha = detailAlpha * (0.46 + hint.adhesion * 0.32) * (semantics.surfaceBias === 'smooth' ? 0.78 : 1)
      const color = hint.id.includes('inner')
        ? mixColors(accentColor, energyColor, this.spec?.mode === 'robo-ia' ? 0.62 : 0.4)
        : this.spec?.mode === 'robo-ia'
          ? mixColors(energyColor, accentColor, 0.18)
          : energyColor

      this.accent.svg(hint.path).stroke({
        color,
        width: 1.2 + hint.adhesion * 1.2 + (semantics.precision > 0.8 ? 0.4 : 0),
        alpha: hintAlpha * (this.spec?.mode === 'centelha' ? 1.08 : this.spec?.mode === 'robo-ia' ? 0.92 : 1),
        join: semantics.precision > 0.8 ? 'miter' : 'round',
        cap: semantics.precision > 0.8 ? 'square' : 'round',
      })
    }
  }

  private drawCentelha(
    accentColor: number,
    secondaryColor: number,
    outerOutline: Array<{ x: number; y: number }>,
    budget: ReturnType<typeof getFieldBudgetMultipliers>,
    semantics: FieldSemantics,
    accentAlpha: number,
    detailAlpha: number,
  ) {
    if (!this.shape || !this.spec?.fieldPreset) {
      return
    }
    const cx = this.shape.centroid.x
    const cy = this.shape.centroid.y
    const diamondHeight = Math.max(18, this.shape.bounds.height * 0.18 * budget.detailScale)
    const diamondWidth = Math.max(10, this.shape.bounds.width * 0.1 * budget.detailScale)
    const dischargeLength = Math.max(12, this.shape.bounds.height * 0.12 * budget.detailScale)

    this.accent.poly(flattenPoints(outerOutline), true).stroke({
      color: secondaryColor,
      width: 2 + semantics.radiality * 1.36,
      alpha: accentAlpha * 1.06,
      join: 'round',
      cap: 'round',
    })
    this.detail
      .poly([cx, cy - diamondHeight, cx + diamondWidth, cy, cx, cy + diamondHeight, cx - diamondWidth, cy], true)
      .stroke({ color: accentColor, width: 2.4, alpha: detailAlpha * (1.02 + semantics.coreDominance * 0.16), join: 'round', cap: 'round' })
    this.detail.moveTo(cx, cy - diamondHeight).lineTo(cx, cy - diamondHeight - dischargeLength).stroke({
      color: secondaryColor,
      width: 2.2,
      alpha: detailAlpha * 0.84,
      join: 'round',
      cap: 'round',
    })
    this.detail.moveTo(cx, cy + diamondHeight).lineTo(cx, cy + diamondHeight + dischargeLength * 0.82).stroke({
      color: secondaryColor,
      width: 1.8,
      alpha: detailAlpha * 0.7,
      join: 'round',
      cap: 'round',
    })
    this.detail.moveTo(cx - diamondWidth, cy).lineTo(cx - diamondWidth - dischargeLength * 0.64, cy).stroke({
      color: accentColor,
      width: 1.8,
      alpha: detailAlpha * 0.62,
      join: 'round',
      cap: 'round',
    })
    this.detail.moveTo(cx + diamondWidth, cy).lineTo(cx + diamondWidth + dischargeLength * 0.64, cy).stroke({
      color: accentColor,
      width: 1.8,
      alpha: detailAlpha * 0.62,
      join: 'round',
      cap: 'round',
    })
    this.detail.circle(cx, cy, Math.max(6, this.shape.bounds.width * 0.036 * budget.detailScale)).fill({
      color: secondaryColor,
      alpha: detailAlpha * 0.9,
    })
  }

  private drawElemental(
    accentColor: number,
    secondaryColor: number,
    outerOutline: Array<{ x: number; y: number }>,
    budget: ReturnType<typeof getFieldBudgetMultipliers>,
    semantics: FieldSemantics,
    accentAlpha: number,
    detailAlpha: number,
  ) {
    if (!this.shape || !this.spec?.fieldPreset) {
      return
    }
    const variant = this.spec.variant
    this.accent.poly(flattenPoints(outerOutline), true).stroke({
      color: secondaryColor,
      width: variant === 'terra' ? 4 : 2.4,
      alpha: accentAlpha * (semantics.surfaceBias === 'smooth' ? 0.84 : 1),
      join: 'round',
      cap: 'round',
    })
    if (variant === 'agua') {
      this.detail.ellipse(this.shape.centroid.x, this.shape.centroid.y + 6, this.shape.bounds.width * 0.42 * budget.detailScale, this.shape.bounds.height * 0.28 * budget.detailScale).stroke({
        color: secondaryColor,
        width: 3,
        alpha: detailAlpha,
      })
    } else if (variant === 'fogo') {
      this.detail
        .poly(
          flattenPoints([
            { x: this.shape.centroid.x - 18 * budget.detailScale, y: this.shape.centroid.y + 18 * budget.detailScale },
            { x: this.shape.centroid.x - 4 * budget.detailScale, y: this.shape.centroid.y - 30 * budget.detailScale },
            { x: this.shape.centroid.x + 8 * budget.detailScale, y: this.shape.centroid.y - 10 * budget.detailScale },
            { x: this.shape.centroid.x + 18 * budget.detailScale, y: this.shape.centroid.y - 42 * budget.detailScale },
            { x: this.shape.centroid.x + 22 * budget.detailScale, y: this.shape.centroid.y + 16 * budget.detailScale },
          ]),
          false,
        )
        .stroke({ color: accentColor, width: 4, alpha: detailAlpha * (0.94 + semantics.coreDominance * 0.08), join: 'round', cap: 'round' })
    } else if (variant === 'terra') {
      this.detail.roundRect(this.shape.centroid.x - this.shape.bounds.width * 0.25 * budget.detailScale, this.shape.centroid.y + this.shape.bounds.height * 0.18 * budget.detailScale, this.shape.bounds.width * 0.5 * budget.detailScale, 18 * budget.detailScale, 8).fill({
        color: accentColor,
        alpha: detailAlpha,
      })
    } else {
      this.detail.ellipse(this.shape.centroid.x + 14 * budget.detailScale, this.shape.centroid.y - 6 * budget.detailScale, this.shape.bounds.width * 0.32 * budget.detailScale, this.shape.bounds.height * 0.18 * budget.detailScale).stroke({
        color: secondaryColor,
        width: 2,
        alpha: detailAlpha,
      })
    }
  }

  private drawNatureza(
    accentColor: number,
    secondaryColor: number,
    neutralColor: number,
    outerOutline: Array<{ x: number; y: number }>,
    budget: ReturnType<typeof getFieldBudgetMultipliers>,
    semantics: FieldSemantics,
    accentAlpha: number,
    detailAlpha: number,
  ) {
    if (!this.shape || !this.spec?.fieldPreset) {
      return
    }
    this.accent.poly(flattenPoints(outerOutline), true).stroke({
      color: secondaryColor,
      width: 1.8 + semantics.fieldAttachment * 1.2,
      alpha: accentAlpha * (0.8 + semantics.fieldAttachment * 0.2),
      join: 'round',
      cap: 'round',
    })
    this.detail.circle(this.shape.centroid.x - this.shape.bounds.width * 0.2 * budget.detailScale, this.shape.centroid.y - this.shape.bounds.height * 0.18 * budget.detailScale, 6 * budget.detailScale).fill({
      color: neutralColor,
      alpha: detailAlpha * 0.9,
    })
    this.detail.circle(this.shape.centroid.x + this.shape.bounds.width * 0.24 * budget.detailScale, this.shape.centroid.y + this.shape.bounds.height * 0.1 * budget.detailScale, 4 * budget.detailScale).fill({
      color: accentColor,
      alpha: detailAlpha * 0.72,
    })
    this.detail
      .poly(
        flattenPoints([
          { x: this.shape.centroid.x - this.shape.bounds.width * 0.12 * budget.detailScale, y: this.shape.centroid.y - this.shape.bounds.height * 0.08 * budget.detailScale },
          { x: this.shape.centroid.x + this.shape.bounds.width * 0.06 * budget.detailScale, y: this.shape.centroid.y + this.shape.bounds.height * 0.04 * budget.detailScale },
          { x: this.shape.centroid.x + this.shape.bounds.width * 0.18 * budget.detailScale, y: this.shape.centroid.y - this.shape.bounds.height * 0.12 * budget.detailScale },
        ]),
        false,
      )
      .stroke({ color: secondaryColor, width: 1.6, alpha: detailAlpha * 0.66, join: 'round', cap: 'round' })
  }

  private drawRobo(
    accentColor: number,
    secondaryColor: number,
    neutralColor: number,
    outerOutline: Array<{ x: number; y: number }>,
    budget: ReturnType<typeof getFieldBudgetMultipliers>,
    semantics: FieldSemantics,
    accentAlpha: number,
    detailAlpha: number,
  ) {
    if (!this.shape || !this.spec?.fieldPreset) {
      return
    }
    this.accent.poly(flattenPoints(outerOutline), true).stroke({
      color: secondaryColor,
      width: 2 + semantics.precision * 1.24,
      alpha: accentAlpha * 0.82,
      join: 'miter',
      cap: 'square',
    })
    const left = this.shape.centroid.x - this.shape.bounds.width * 0.3 * budget.detailScale
    const top = this.shape.centroid.y - this.shape.bounds.height * 0.32 * budget.detailScale
    const width = this.shape.bounds.width * 0.6 * budget.detailScale
    const height = this.shape.bounds.height * 0.64 * budget.detailScale
    this.detail.roundRect(left, top, width, height, 6).stroke({
      color: accentColor,
      width: 2,
      alpha: detailAlpha * 0.66,
    })
    this.detail.moveTo(left, this.shape.centroid.y).lineTo(left + width, this.shape.centroid.y).stroke({
      color: neutralColor,
      width: 2.2,
      alpha: detailAlpha * 0.76,
    })
    this.detail.roundRect(left + width * 0.16, top + height * 0.16, width * 0.68, height * 0.68, 4).stroke({
      color: secondaryColor,
      width: 1.4,
      alpha: detailAlpha * 0.44,
      join: 'miter',
      cap: 'square',
    })
  }
}
