import type { VisualEssence } from '../../identity/contracts/VisualEssence'
import type { PersonaLabPreview } from '../../rendering/contracts/types'
import { getManifestationSpec } from '../specs'
import { manifestationModes } from '../specs/manifestationModes'
import type { BaseFormProfile } from '../../base-form/contracts/BaseFormProfile'
import { deriveBaseFormProfile } from '../../base-form/services/deriveBaseFormProfile'
import type { VisualFinishPlan } from '../../materialization/contracts/VisualFinishPlan'
import type { PersonaDNA } from '../../persona-dna/contracts/PersonaDNA'
import { derivePersonaDNA } from '../../persona-dna/services/derivePersonaDNA'
import type { ExtractedShapeSource, ProcessedShape, ShapePoint } from '../../shape/contracts/ProcessedShape'
import type { VisualArchetype } from '../../visual-archetype/contracts/VisualArchetype'
import type { VisualBodyPlan } from '../../visual-archetype/contracts/VisualBodyPlan'
import { abstractShape } from '../../shape/services/shapeIntelligence'
import { chaikin, computeCentroid, pointsToPath, simplifyPoints } from '../../shape/analysis/shapeMetrics'

const defaultSilhouette = {
  bodyPath: 'M119 22C147 22 170 36 181 58C191 79 188 104 183 127C178 149 171 177 149 191C128 205 97 206 75 194C54 181 43 154 44 129C45 106 61 91 73 74C86 55 92 22 119 22Z',
  innerPath: 'M118 52C133 52 145 59 151 70C157 82 156 95 153 108C150 121 146 137 134 145C121 154 102 154 89 147C77 139 71 123 72 109C73 96 83 88 91 79C98 68 103 52 118 52Z',
}

function resolveProcessedShape(args: {
  manifestationMode: PersonaLabPreview['manifestationMode']
  manifestationVariant?: string
  shapeSource?: ExtractedShapeSource
  processedShape?: ProcessedShape
}) {
  if (args.processedShape) {
    return args.processedShape
  }

  if (!args.shapeSource) {
    return undefined
  }

  return abstractShape(args.shapeSource, args.manifestationMode, args.manifestationVariant)
}

function applyBaseFormToSilhouette(points: ShapePoint[], baseForm: BaseFormProfile, core: { x: number; y: number }) {
  if (points.length < 3) {
    return points
  }

  const smoothed = baseForm.edgeDiscipline === 'soft'
    ? chaikin(points, 1)
    : baseForm.edgeDiscipline === 'controlled'
      ? simplifyPoints(points, 1.8)
      : simplifyPoints(points, 3)

  return smoothed.map((point, index) => {
    const dx = point.x - core.x
    const dy = point.y - core.y
    const angle = Math.atan2(dy, dx)
    const axisBias =
      baseForm.spine === 'vertical'
        ? Math.abs(Math.sin(angle))
        : baseForm.spine === 'horizontal'
          ? Math.abs(Math.cos(angle))
          : 1
    const familyExpansion =
      baseForm.family === 'orb'
        ? 0.06
        : baseForm.family === 'totem'
          ? axisBias * 0.08
          : baseForm.family === 'flare'
            ? 0.1 + axisBias * 0.04
            : baseForm.family === 'shard'
              ? 0.02
              : 0.05
    const familySharpness = baseForm.family === 'shard' ? Math.sin(index * 1.2 + angle * 3) * 6 : 0
    const compression = 1 - baseForm.bodyCompression * (baseForm.spine === 'radial' ? 0.32 : 0.18)
    const opennessLift = 1 + baseForm.openness * (1 - axisBias) * 0.12
    const scaleX =
      baseForm.spine === 'vertical'
        ? 1 - baseForm.bodyCompression * 0.18
        : baseForm.spine === 'horizontal'
          ? 1 + baseForm.openness * 0.08
          : 1 + familyExpansion * 0.06
    const scaleY =
      baseForm.spine === 'vertical'
        ? 1 + familyExpansion * 0.16
        : baseForm.spine === 'horizontal'
          ? 1 - baseForm.bodyCompression * 0.14
          : 1 + familyExpansion * 0.08

    return {
      x: core.x + dx * scaleX * compression * opennessLift + Math.cos(angle) * familySharpness,
      y: core.y + dy * scaleY * compression * opennessLift + Math.sin(angle) * familySharpness,
    }
  })
}

function buildInnerSilhouette(points: ShapePoint[], bodyCentroid: ShapePoint, baseForm: BaseFormProfile, core: { x: number; y: number }) {
  const inset = 0.46 + baseForm.openness * 0.08 - baseForm.bodyCompression * 0.06

  return points.map((point, index) => {
    const target = {
      x: bodyCentroid.x + (core.x - bodyCentroid.x) * 0.72,
      y: bodyCentroid.y + (core.y - bodyCentroid.y) * 0.72,
    }
    const dx = point.x - target.x
    const dy = point.y - target.y
    const familyRipple = baseForm.family === 'flare' ? Math.sin(index * 0.52) * 2 : 0

    return {
      x: target.x + dx * inset + familyRipple,
      y: target.y + dy * inset,
    }
  })
}

function buildRealSilhouette(args: {
  processedShape?: ProcessedShape
  shapeSource?: ExtractedShapeSource
  baseFormProfile: BaseFormProfile
}) {
  const sourcePoints = args.processedShape?.abstractedGeometry.points ?? args.shapeSource?.shapeData.points
  if (!sourcePoints || sourcePoints.length < 3) {
    return undefined
  }

  const sourceCentroid = args.processedShape?.abstractedGeometry.centroid ?? args.shapeSource?.shapeData.centroid ?? computeCentroid(sourcePoints)
  const targetCore = {
    x: 240 * args.baseFormProfile.corePlacement.x,
    y: 240 * args.baseFormProfile.corePlacement.y,
  }
  const bodyPoints = applyBaseFormToSilhouette(sourcePoints, args.baseFormProfile, sourceCentroid)
  const innerPoints = buildInnerSilhouette(bodyPoints, computeCentroid(bodyPoints), args.baseFormProfile, targetCore)

  return {
    bodyPath: pointsToPath(bodyPoints),
    innerPath: pointsToPath(innerPoints),
    source: 'real-geometry' as const,
  }
}

function buildPlanSilhouette(visualBodyPlan?: VisualBodyPlan) {
  if (!visualBodyPlan?.bodyPath) {
    return undefined
  }

  return {
    bodyPath: visualBodyPlan.bodyPath,
    innerPath: visualBodyPlan.innerPath ?? '',
    source: 'visual-body-plan' as const,
    legibility: visualBodyPlan.silhouette.legibility,
    framing: visualBodyPlan.silhouette.boundingBox,
    core: {
      x: visualBodyPlan.core.position.x,
      y: visualBodyPlan.core.position.y,
      radius: visualBodyPlan.core.radius,
      intensity: visualBodyPlan.core.intensity,
    },
  }
}

export function buildManifestationPreview(input: {
  manifestationMode?: string
  manifestationVariant?: string
  visualEssence?: VisualEssence
  shapeSource?: ExtractedShapeSource
  processedShape?: ProcessedShape
  baseFormProfile?: BaseFormProfile
  personaDNA?: PersonaDNA
  visualArchetype?: VisualArchetype
  visualBodyPlan?: VisualBodyPlan
  visualFinishPlan?: VisualFinishPlan
  palette: {
    primary: string
    secondary?: string
  }
}): PersonaLabPreview | undefined {
  const visualEssence = input.visualEssence
  const primary = visualEssence?.primaryColor ?? input.palette.primary
  const paletteSecondary = visualEssence?.secondaryColor ?? input.palette.secondary ?? '#6e86ff'
  const selectedMode = manifestationModes.find((mode) => mode.id === input.manifestationMode)
  const selectedVariant = selectedMode?.variants.find((variant) => variant.id === input.manifestationVariant)

  if (!selectedMode || !selectedVariant) {
    return undefined
  }

  const spec = getManifestationSpec(selectedMode.id)
  const variantOverride = spec.runtime.variantOverrides?.[selectedVariant.id]
  const processedShape = resolveProcessedShape({
    manifestationMode: selectedMode.id,
    manifestationVariant: selectedVariant.id,
    shapeSource: input.shapeSource,
    processedShape: input.processedShape,
  })
  const baseFormProfile = input.baseFormProfile ?? deriveBaseFormProfile({
    shapeSignature: processedShape?.signature ?? input.shapeSource?.signature,
    visualEssence,
  })
  const personaDNA = input.personaDNA ?? derivePersonaDNA({
    shapeSignature: processedShape?.signature ?? input.shapeSource?.signature,
    baseFormProfile,
    visualEssence,
  })
  const visualConfig = {
    ...spec.runtime.defaultVisual,
    ...variantOverride?.visual,
  }
  const silhouette = buildPlanSilhouette(input.visualBodyPlan) ?? buildRealSilhouette({
    processedShape,
    shapeSource: input.shapeSource,
    baseFormProfile,
  }) ?? {
    ...(variantOverride?.silhouette ?? defaultSilhouette),
    source: 'manifestation-fallback' as const,
  }
  const secondaryColor =
    visualConfig.secondarySource === 'primary'
      ? primary
      : visualConfig.secondarySource === 'secondary'
        ? paletteSecondary
        : paletteSecondary

  return {
    id: `${selectedMode.id}-${selectedVariant.id}`,
    label: selectedMode.label,
    description: selectedVariant.description,
    archetype: selectedMode.archetype,
    manifestationMode: selectedMode.id,
    manifestationVariant: selectedVariant.id,
    baseFormProfile,
    personaDNA,
    visualArchetype: input.visualArchetype,
    visualBodyPlan: input.visualBodyPlan,
    visualFinishPlan: input.visualFinishPlan,
    silhouette,
    visualConfig: {
      accent: visualConfig.accent,
      secondary: secondaryColor,
      shape: visualConfig.shape,
      motion: visualConfig.motion,
      glow: visualConfig.glow,
      density: visualConfig.density,
    },
  }
}
