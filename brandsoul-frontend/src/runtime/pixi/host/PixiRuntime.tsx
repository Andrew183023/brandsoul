import { useMemo } from 'react'

// Main runtime path: Pixi owns the live scene execution.
import type { OrchestratorFrame } from '../../../backend-bridge/contracts/OrchestratorFrame'
import type { EntityProfile } from '../../../domain/entity/contracts/EntityProfile'
import {
  resolveEntityIntensity,
  resolveEntityOriginSource,
  resolveEntityProcessedShape,
  resolveEntityRenderOutput,
  resolveEntityRuntimeControl,
} from '../../../domain/entity/services/entityRuntimeResolver'
import { getManifestationSpec } from '../../../domain/manifestation/specs'
import type { RuntimeControl, RuntimeLayerVisibility } from '../../../domain/orchestration/contracts/RuntimeControl'
import type { OrchestratorCommand } from '../../../domain/orchestration/contracts/OrchestratorCommand'
import { buildRuntimeControl } from '../../../domain/orchestration/realtime/runtimeSignalBridge'
import type { ManifestationIntensity, PersonaLabPreview, PersonaVisualVariant } from '../../../domain/rendering/contracts/types'
import { resolvePersonaRenderer } from '../../../domain/rendering/resolvers/rendererSelector'
import type { ExtractedShapeSource } from '../../../domain/shape/contracts/ProcessedShape'
import {
  getPersonaArchetypeConfig,
  type ActionStyleAnswer,
  type BrandCategory,
  type BrandStyleAnswer,
  type LanguageStyleAnswer,
} from '../../../lib/personaArchetypes'
import type { VisualEssence } from '../../../lib/visualEssence'
import { DebugShapeOverlay } from '../../../debug/ui/DebugShapeOverlay'
import type { SceneExportFormat } from '../export/sceneExport'
import { PersonaSceneBridge } from './PersonaSceneBridge'
import type { PixiScenePerfSnapshot } from '../scene/PersonaScene'
import '../styles/pixiRuntime.css'

type BirthPhase = 'building' | 'transition' | 'final'

type PixiRuntimeProps = {
  preview: PersonaLabPreview
  variant?: PersonaVisualVariant
  intensity: ManifestationIntensity
  logoData: {
    preview?: string
    mask?: string
    coreSymbol?: string
    shapeSource?: ExtractedShapeSource
  }
  visualEssence?: VisualEssence
  brandCategory?: BrandCategory
  styleAnswers: {
    brandStyle?: BrandStyleAnswer
    languageStyle?: LanguageStyleAnswer
    actionStyle?: ActionStyleAnswer
  }
  playBirthTimeline?: boolean
  onBirthPhaseChange?: (phase: BirthPhase, stepIndex: number) => void
  onBirthComplete?: () => void
  onExportReady?: (exporter: ((format?: SceneExportFormat) => Promise<void>) | null) => void
  onPerformanceUpdate?: (snapshot: PixiScenePerfSnapshot) => void
  showDebugOverlay?: boolean
  layerVisibility?: RuntimeLayerVisibility
  runtimeControl?: RuntimeControl
  orchestratorFrame?: OrchestratorFrame
  orchestratorCommand?: OrchestratorCommand
  entityProfile?: EntityProfile
}

const defaultRuntimeVars = {
  ['--persona-lab-runtime-shape-scale' as string]: '1',
  ['--persona-lab-runtime-shape-opacity' as string]: '1',
}
function getRuntimeBehaviorVars(spec: ReturnType<typeof getManifestationSpec>) {
  const idleDurationMultiplier =
    spec.behavior.idle === 'pulse-breathe'
      ? 0.9
      : spec.behavior.idle === 'material-drift'
        ? 1.02
        : spec.behavior.idle === 'organic-breathe'
          ? 1.14
          : 0.84
  const idleAmplitudeMultiplier =
    spec.behavior.idle === 'pulse-breathe'
      ? 1.12
      : spec.behavior.idle === 'material-drift'
        ? 0.96
        : spec.behavior.idle === 'organic-breathe'
          ? 0.92
          : 0.72
  const hoverGlowMultiplier =
    spec.behavior.hover === 'flare-expand'
      ? 1.22
      : spec.behavior.hover === 'element-surge'
        ? 1.1
        : spec.behavior.hover === 'bloom-lift'
          ? 1.06
          : 1.14
  const stabilizeCoreMultiplier =
    spec.behavior.stabilize === 'core-lock'
      ? 1.06
      : spec.behavior.stabilize === 'matter-hold'
        ? 0.98
        : spec.behavior.stabilize === 'rooted-bloom'
          ? 0.94
          : 1

  return {
    idleDurationMultiplier,
    idleAmplitudeMultiplier,
    hoverGlowMultiplier,
    stabilizeCoreMultiplier,
  }
}

export function PixiRuntime({
  preview,
  variant = 'preview',
  intensity,
  logoData,
  visualEssence,
  brandCategory,
  styleAnswers,
  playBirthTimeline = false,
  onBirthPhaseChange,
  onBirthComplete,
  onExportReady,
  onPerformanceUpdate,
  showDebugOverlay = false,
  layerVisibility,
  runtimeControl,
  orchestratorFrame,
  orchestratorCommand,
  entityProfile,
}: PixiRuntimeProps) {
  const resolvedIntensity = resolveEntityIntensity(entityProfile, intensity)
  const archetypeConfig = useMemo(() => getPersonaArchetypeConfig(brandCategory, styleAnswers), [brandCategory, styleAnswers])
  const rendererOutput = useMemo(() => {
    const entityRenderOutput = resolveEntityRenderOutput(entityProfile)
    if (entityRenderOutput && (variant === 'final' || playBirthTimeline)) {
      return entityRenderOutput
    }

    const primaryZone = visualEssence?.dominantZones[0]
    const secondaryZone = visualEssence?.dominantZones[1]
    const dominantSymbol = variant === 'final' ? logoData.coreSymbol ?? logoData.mask : undefined
    const usesLogoMask = Boolean(dominantSymbol)
    const manifestationSpec = getManifestationSpec(preview.manifestationMode)
    const behaviorVars = getRuntimeBehaviorVars(manifestationSpec)
    const accentColor = visualEssence?.primaryColor ?? preview.visualConfig.accent
    const supportColor = visualEssence?.energyColor ?? visualEssence?.secondaryColor ?? preview.visualConfig.secondary
    const neutralColor = visualEssence?.neutralColor ?? visualEssence?.secondaryColor ?? preview.visualConfig.secondary

    return resolvePersonaRenderer({
      logoData,
      visualEssence,
      intensity: resolvedIntensity,
      variant,
      brandCategory,
      preview,
      bodyPath: preview.silhouette.bodyPath,
      innerPath: preview.silhouette.innerPath,
      usesLogoMask,
      dominantSymbol,
      styleVars: {
        ['--persona-lab-accent' as string]: accentColor,
        ['--persona-lab-secondary' as string]: supportColor,
        ['--persona-lab-energy' as string]: supportColor,
        ['--persona-lab-neutral' as string]: neutralColor,
        ['--persona-lab-aura-opacity' as string]: archetypeConfig.auraOpacity.toString(),
        ['--persona-lab-aura-scale' as string]: archetypeConfig.auraScale.toString(),
        ['--persona-lab-glow-blur' as string]: `${archetypeConfig.glowBlur}px`,
        ['--persona-lab-glow-strength' as string]: archetypeConfig.glowStrength.toString(),
        ['--persona-lab-body-scale' as string]: archetypeConfig.bodyScale.toString(),
        ['--persona-lab-body-rotate' as string]: `${archetypeConfig.bodyRotate}deg`,
        ['--persona-lab-body-skew' as string]: `${archetypeConfig.bodySkew}deg`,
        ['--persona-lab-body-breath-scale' as string]: (archetypeConfig.bodyBreathScale * behaviorVars.idleAmplitudeMultiplier).toString(),
        ['--persona-lab-motion-duration' as string]: `${archetypeConfig.motionDuration * behaviorVars.idleDurationMultiplier}s`,
        ['--persona-lab-motion-amplitude' as string]: (archetypeConfig.motionAmplitude * behaviorVars.idleAmplitudeMultiplier).toString(),
        ['--persona-lab-core-scale' as string]: (archetypeConfig.coreScale * behaviorVars.stabilizeCoreMultiplier).toString(),
        ['--persona-lab-core-opacity' as string]: archetypeConfig.coreOpacity.toString(),
        ['--persona-lab-hover-scale' as string]: archetypeConfig.hoverScale.toString(),
        ['--persona-lab-hover-glow-boost' as string]: (archetypeConfig.hoverGlowBoost * behaviorVars.hoverGlowMultiplier).toString(),
        ['--persona-lab-zone-x' as string]: `${(primaryZone?.x ?? 0.5) * 100}%`,
        ['--persona-lab-zone-y' as string]: `${(primaryZone?.y ?? 0.5) * 100}%`,
        ['--persona-lab-zone-secondary-x' as string]: `${(secondaryZone?.x ?? 0.78) * 100}%`,
        ['--persona-lab-zone-secondary-y' as string]: `${(secondaryZone?.y ?? 0.72) * 100}%`,
        ...defaultRuntimeVars,
      },
    })
  }, [
    archetypeConfig,
    brandCategory,
    entityProfile,
    logoData,
    playBirthTimeline,
    preview,
    resolvedIntensity,
    variant,
    visualEssence,
  ])

  const resolvedLayerVisibility = useMemo<RuntimeLayerVisibility>(
    () => ({
      field: runtimeControl?.layerVisibility?.field ?? layerVisibility?.field ?? true,
      particles: runtimeControl?.layerVisibility?.particles ?? layerVisibility?.particles ?? true,
      core: runtimeControl?.layerVisibility?.core ?? layerVisibility?.core ?? true,
      debug: runtimeControl?.layerVisibility?.debug ?? layerVisibility?.debug ?? runtimeControl?.debugFlags?.showDebugOverlay ?? showDebugOverlay,
      liteEffects: runtimeControl?.layerVisibility?.liteEffects ?? layerVisibility?.liteEffects ?? false,
      shapeOnly: runtimeControl?.layerVisibility?.shapeOnly ?? layerVisibility?.shapeOnly ?? runtimeControl?.debugFlags?.shapeOnly ?? false,
    }),
    [
      layerVisibility?.core,
      layerVisibility?.debug,
      layerVisibility?.field,
      layerVisibility?.liteEffects,
      layerVisibility?.particles,
      layerVisibility?.shapeOnly,
      runtimeControl?.debugFlags?.shapeOnly,
      runtimeControl?.debugFlags?.showDebugOverlay,
      runtimeControl?.layerVisibility?.core,
      runtimeControl?.layerVisibility?.debug,
      runtimeControl?.layerVisibility?.field,
      runtimeControl?.layerVisibility?.liteEffects,
      runtimeControl?.layerVisibility?.particles,
      runtimeControl?.layerVisibility?.shapeOnly,
      showDebugOverlay,
    ],
  )

  const resolvedRuntimeControl = useMemo(
    () =>
      resolveEntityRuntimeControl(
        entityProfile,
        runtimeControl ??
          buildRuntimeControl({
            engine: 'pixi',
            playBirthTimeline,
            layerVisibility: resolvedLayerVisibility,
            debugFlags: {
              showDebugOverlay: resolvedLayerVisibility.debug,
              shapeOnly: resolvedLayerVisibility.shapeOnly,
            },
          }),
      ),
    [entityProfile, playBirthTimeline, resolvedLayerVisibility, runtimeControl],
  )
  const resolvedProcessedShape = resolveEntityProcessedShape(entityProfile) ?? rendererOutput.debugShape?.processedShape
  const resolvedOriginSource = resolveEntityOriginSource(entityProfile, logoData.coreSymbol ?? logoData.mask ?? logoData.preview)

  return (
    <div
      className={`${rendererOutput.animationConfig.rootClassName} persona-lab-pixi-runtime ${resolvedLayerVisibility.liteEffects ? 'runtime-lite' : ''} ${resolvedLayerVisibility.shapeOnly ? 'shape-only-mode' : ''}`}
      style={rendererOutput.animationConfig.styleVars}
      aria-hidden="true"
    >
      <PersonaSceneBridge
        entityProfile={entityProfile}
        processedShape={resolvedProcessedShape}
        rendererOutput={rendererOutput}
        manifestationSpec={rendererOutput.manifestationSpec}
        visualEssence={visualEssence}
        intensity={resolvedIntensity}
        originSource={resolvedOriginSource}
        playBirthTimeline={playBirthTimeline}
        orchestratorFrame={orchestratorFrame}
        runtimeControl={resolvedRuntimeControl}
        orchestratorCommand={orchestratorCommand}
        onBirthPhaseChange={onBirthPhaseChange}
        onBirthComplete={onBirthComplete}
        onExportReady={onExportReady}
        onPerformanceUpdate={onPerformanceUpdate}
        layerVisibility={resolvedRuntimeControl.layerVisibility ?? resolvedLayerVisibility}
        debugFlags={{
          showDebugOverlay: resolvedRuntimeControl.debugFlags?.showDebugOverlay ?? resolvedLayerVisibility.debug,
          shapeOnly: resolvedRuntimeControl.debugFlags?.shapeOnly ?? resolvedLayerVisibility.shapeOnly,
        }}
      />
      {resolvedLayerVisibility.debug ? (
        <DebugShapeOverlay
          processedShape={resolvedProcessedShape}
          sourceSignature={rendererOutput.debugShape?.sourceSignature}
          shapeReadabilityScore={rendererOutput.debugShape?.readabilityScore}
          silhouetteContrast={rendererOutput.debugShape?.silhouetteContrast}
        />
      ) : null}
    </div>
  )
}
