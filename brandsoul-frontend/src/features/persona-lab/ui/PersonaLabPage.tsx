import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useMemo, useState, type CSSProperties } from 'react'

import brandsoulLogo from '../../../assets/brandsoul-logo-original.jpeg'
import { deriveBaseFormProfile } from '../../../domain/base-form/services/deriveBaseFormProfile'
import type { EntityProfile } from '../../../domain/entity/contracts/EntityProfile'
import { abstractShape } from '../../../domain/shape/services/shapeIntelligence'
import { derivePersonaDNA } from '../../../domain/persona-dna/services/derivePersonaDNA'
import { resolvePersonaSemantics } from '../../../domain/persona-dna/services/resolvePersonaSemantics'
import { buildVisualBody, resolveCanonicalWeightProfile } from '../../../domain/visual-archetype/services/buildVisualBody'
import { deriveVisualArchetype } from '../../../domain/visual-archetype/services/deriveVisualArchetype'
import { useEntitlement } from '../../../domain/monetization/useEntitlement'
import { buildManifestationPreview } from '../../../domain/manifestation/services/previewBuilder'
import { getManifestationSpec } from '../../../domain/manifestation/specs'
import { manifestationModes } from '../../../domain/manifestation/specs/manifestationModes'
import { createOrchestratorCommand } from '../../../domain/orchestration/contracts/OrchestratorCommand'
import type { ManifestationIntensity, ManifestationMode, PersonaLabPreview, PersonaVisualVariant } from '../../../domain/rendering/contracts/types'
import { getPersonaArchetypeConfig } from '../../../lib/personaArchetypes'
import { navigateTo } from '../../../lib/persona'
import { generateShapeFromLogo } from '../../../personaLab/engine/shapeEngine'
import './personaLab.css'
import { usePersonaLabFlow } from '../hooks/usePersonaLabFlow'
import { usePersonaLabDebug } from '../hooks/usePersonaLabDebug'
import { useRuntimeEngineChoice } from '../hooks/useRuntimeEngineChoice'
import { comparisonVariantByMode, manifestationIntensityLevels, type PersonaLabStage } from '../state/personaLabStore'
import { getBirthActLabels, getBirthActNarrative, getBirthSignalLines, getFinalPresenceModel, getFusionRitualModel, type BirthNarrativeAct } from '../content/ritualCopy'
import { PersonaLabDevPanel } from './PersonaLabDevPanel'
import { PersonaLabArchetypeValidationPanel } from './PersonaLabArchetypeValidationPanel'
import { PersonaLabComparisonPanel } from './PersonaLabComparisonPanel'
import { PersonaLabShapeComparePanel } from './PersonaLabShapeComparePanel'
import { EntityMessageSurface } from './EntityMessageSurface'
import { PersonaLabFinalHero } from './PersonaLabFinalHero'
import { PersonaLabSocialPanel } from './PersonaLabSocialPanel'
import type { FlowMindUiEffect } from '../../../domain/entity/services/flowMindActionExecutor'
import { archetypeValidationFixtures } from '../dev/archetypeValidationFixtures'

const progressStages: PersonaLabStage[] = ['upload', 'manifestation', 'variant', 'fusion', 'birth', 'final']
const birthActBlueprint = getBirthActLabels()

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function resolveBirthAct(stepIndex: number, totalStages: number): BirthNarrativeAct {
  if (totalStages <= 1 || stepIndex <= 0) {
    return 'origin'
  }

  if (stepIndex === 1) {
    return 'reading'
  }

  if (stepIndex >= totalStages - 1) {
    return 'incarnation'
  }

  return 'metamorphosis'
}

function resolveBirthAnatomyPhase(stageId: string | undefined, act: BirthNarrativeAct | undefined, birthState: 'building' | 'transition' | 'final') {
  if (stageId && /stabilize|final|hold|settle|incarn/i.test(stageId)) {
    return birthState === 'final' ? 'incarnation' : 'core-emergence'
  }

  if (act === 'incarnation') {
    return birthState === 'final' ? 'incarnation' : 'core-emergence'
  }

  if (stageId && /align|assemble|segment|ignite|flare|metamorph/i.test(stageId)) {
    return 'convergence'
  }

  if (birthState === 'building') {
    return 'emission'
  }

  if (birthState === 'transition') {
    return 'convergence'
  }

  if (stageId && /stabilize|final|hold|settle|incarn/i.test(stageId)) {
    return 'incarnation'
  }

  if (act === 'metamorphosis') {
    return 'convergence'
  }

  return 'emission'
}

function resolveCoreEmergenceRhythm(personaDNA: EntityProfile['personaDNA'] | undefined) {
  const emergence = resolvePersonaSemantics(personaDNA).emergence

  return {
    ['--persona-lab-birth-core-emergence-duration' as string]: `${emergence.pauseDurationMs}ms`,
    ['--persona-lab-birth-core-emergence-particle-fade-duration' as string]: `${emergence.particleFadeDurationMs}ms`,
    ['--persona-lab-birth-core-emergence-particle-travel-duration' as string]: `${emergence.particleTravelDurationMs}ms`,
    ['--persona-lab-birth-core-emergence-segment-duration' as string]: `${emergence.segmentReleaseDurationMs}ms`,
    ['--persona-lab-birth-core-emergence-envelope-delay' as string]: `${emergence.envelopeDelayMs}ms`,
    ['--persona-lab-birth-core-emergence-core-duration' as string]: `${emergence.coreRevealDurationMs}ms`,
    ['--persona-lab-birth-core-emergence-core-pulse-duration' as string]: `${emergence.corePulseDurationMs}ms`,
  } as CSSProperties
}

function normalizePointToPercent(value: number, min: number, size: number) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(size) || size <= 0) {
    return 50
  }

  return clamp(((value - min) / size) * 100, 0, 100)
}

function toDebugPath(points?: Array<{ x: number; y: number }>) {
  if (!points?.length) {
    return ''
  }

  if (points.length < 3) {
    return `M${points[0]!.x} ${points[0]!.y}Z`
  }

  return `${points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')} Z`
}

const stageBlueprint: Record<PersonaLabStage, { label: string; title: string; description: string }> = {
  upload: {
    label: 'Origem visual',
    title: 'Hero / Manifestação principal',
    description: 'Traga o símbolo inicial da marca. O laboratório lê forma, contraste e assinatura cromática antes de qualquer decisão estética.',
  },
  manifestation: {
    label: 'Arquitetura viva',
    title: 'Manifestação visual',
    description: 'Escolha a família de presença que vai governar o corpo, o campo e o pulso da entidade.',
  },
  variant: {
    label: 'Assinatura interna',
    title: 'Essência / Voz / Comportamento',
    description: 'Refine a expressão dominante para que a entidade pareça intencional, não apenas renderizada.',
  },
  fusion: {
    label: 'Acoplamento',
    title: 'Fusão de identidade',
    description: 'Logo, campo e manifestação entram em ressonância. Aqui a presença começa a responder como algo vivo.',
  },
  birth: {
    label: 'Ativação',
    title: 'Nascimento da entidade',
    description: 'A presença ganha ritmo próprio no orchestrator e revela sua primeira forma operável.',
  },
  final: {
    label: 'Presença pública',
    title: 'Resumo vivo / preview final',
    description: 'Consolide a identidade, a primeira fala e a primeira aparição da entidade no mundo.',
  },
}

function resolveRelationalSummary(entityProfile?: EntityProfile) {
  const relational = entityProfile?.relational
  if (!relational) {
    return undefined
  }

  const refinementCopy =
    relational.progression.maturityStage === 'evolved' || relational.progression.maturityStage === 'stable'
      ? 'Sua centelha já carrega uma forma mais estável.'
      : relational.progression.maturityStage === 'expressive' || relational.progression.maturityStage === 'forming'
        ? 'Sua centelha está mais refinada desde a criação.'
        : 'Sua centelha começou a formar uma presença própria.'
  const styleCopy =
    relational.imprint.imprintConfidence >= 0.42
      ? 'Ela já entende melhor seu estilo e os sinais que você reforçou.'
      : 'Ela começou a registrar seu estilo sem perder a origem da marca.'
  const continuityCopy =
    relational.binding.continuityScore >= 0.42 || relational.value.retentionSignals.shouldProtectContinuity
      ? 'Há continuidade suficiente para preservar esta identidade como algo seu.'
      : 'A continuidade ainda é inicial, mas a história da entidade já começou.'

  return {
    refinementCopy,
    styleCopy,
    continuityCopy,
  }
}

export default function PersonaLabPage() {
  const [manifestationIntensity, setManifestationIntensity] = useState<ManifestationIntensity>('balanced')
  const [debugShapeOverlay, setDebugShapeOverlay] = useState(false)
  const [flowMindPromptValues, setFlowMindPromptValues] = useState<Record<string, string>>({})

  const {
    stage,
    setStage,
    labState,
    personaLabInput,
    selectedPreview,
    selectedManifestationMode,
    isExtractingPalette,
    birthState,
    birthMessageIndex,
    logoUploadNotice,
    exportingFormat,
    isExportingRuntimeScene,
    orchestratorCommand,
    orchestratorFrame,
    flowMindEffects,
    setRuntimeSceneExporter,
    canContinueToFusion,
    birthMessages,
    fusionCopy,
    socialOutputPreviews,
    handleLogoUpload,
    handleManifestationModeChange,
    handleManifestationVariantChange,
    handleStartBirth,
    handleRestart,
    handleDownloadSocialAsset,
    handleDownloadRuntimeScene,
    handleBirthPhaseChange,
    handleBirthComplete,
    dispatchPersonaCommand,
    dismissFlowMindEffect,
  } = usePersonaLabFlow()

  const {
    runtimePerf,
    setRuntimePerf,
    pixiPerfScenario,
    setPixiPerfScenario,
    runtimeDebug,
    toggleRuntimeDebug,
    resolvedLayerVisibility,
  } = usePersonaLabDebug(debugShapeOverlay)

  const runtimeLogoData = useMemo(
    () => ({
      preview: personaLabInput.logoPreview,
      mask: personaLabInput.logoMask,
      coreSymbol: personaLabInput.coreSymbol,
      shapeSource: personaLabInput.shapeSource,
    }),
    [personaLabInput.coreSymbol, personaLabInput.logoMask, personaLabInput.logoPreview, personaLabInput.shapeSource],
  )

  const renderRuntime = useRuntimeEngineChoice({
    manifestationIntensity,
    runtimeLogoData,
    visualEssence: personaLabInput.visualEssence,
    brandCategory: personaLabInput.brandCategory,
    styleAnswers: personaLabInput.styleAnswers,
    resolvedLayerVisibility,
    entityProfile: labState.entityProfile,
  })

  const activeArchetypeConfig = useMemo(
    () => getPersonaArchetypeConfig(personaLabInput.brandCategory, personaLabInput.styleAnswers),
    [personaLabInput.brandCategory, personaLabInput.styleAnswers],
  )
  const relationalSummary = useMemo(() => resolveRelationalSummary(labState.entityProfile), [labState.entityProfile])
  const entitlement = useEntitlement(labState.entityProfile?.id)
  const currentStageBlueprint = stageBlueprint[stage]

  const liveSummaryChips = useMemo(() => {
    const chips: string[] = []

    if (selectedManifestationMode?.label) {
      chips.push(selectedManifestationMode.label)
    }

    if (selectedPreview?.manifestationVariant) {
      chips.push(selectedPreview.manifestationVariant)
    }

    chips.push(`intensidade ${manifestationIntensity}`)

    if (personaLabInput.visualEssence?.structure) {
      chips.push(personaLabInput.visualEssence.structure)
    }

    return chips
  }, [manifestationIntensity, personaLabInput.visualEssence?.structure, selectedManifestationMode?.label, selectedPreview?.manifestationVariant])

  const liveIdentityLines = useMemo(() => {
    return [
      personaLabInput.styleAnswers.brandStyle ? `essência ${personaLabInput.styleAnswers.brandStyle}` : 'essência em formação',
      personaLabInput.styleAnswers.languageStyle ? `voz ${personaLabInput.styleAnswers.languageStyle}` : 'voz ainda não definida',
      personaLabInput.styleAnswers.actionStyle ? `conduta ${personaLabInput.styleAnswers.actionStyle}` : 'comportamento emergente',
    ]
  }, [personaLabInput.styleAnswers.actionStyle, personaLabInput.styleAnswers.brandStyle, personaLabInput.styleAnswers.languageStyle])

  const birthSpec = useMemo(
    () => (selectedPreview ? getManifestationSpec(selectedPreview.manifestationMode) : undefined),
    [selectedPreview],
  )

  const birthTimelineStages = birthSpec?.birthTimeline.stages ?? []
  const birthTimelineStageCount = birthTimelineStages.length
  const birthTimelineStep = birthTimelineStages[birthMessageIndex]
  const birthAct = useMemo(
    () => resolveBirthAct(birthMessageIndex, birthTimelineStageCount),
    [birthMessageIndex, birthTimelineStageCount],
  )
  const birthActIndex = useMemo(
    () => Math.max(0, birthActBlueprint.findIndex((act) => act.id === birthAct)),
    [birthAct],
  )
  const activePersonaDNA = selectedPreview?.personaDNA ?? labState.entityProfile?.personaDNA
  const fusionRitualModel = useMemo(
    () => getFusionRitualModel({
      mode: selectedPreview?.manifestationMode,
      variant: selectedPreview?.manifestationVariant,
      intensity: manifestationIntensity,
      personaDNA: activePersonaDNA,
    }),
    [activePersonaDNA, manifestationIntensity, selectedPreview?.manifestationMode, selectedPreview?.manifestationVariant],
  )
  const finalPresenceModel = useMemo(
    () => getFinalPresenceModel({
      mode: selectedPreview?.manifestationMode,
      personaDNA: activePersonaDNA,
      finalForm: labState.entityProfile?.finalForm,
    }),
    [activePersonaDNA, labState.entityProfile?.finalForm, selectedPreview?.manifestationMode],
  )
  const activeBirthMessage = birthMessages[Math.min(birthActIndex, birthMessages.length - 1)] ?? birthMessages[0] ?? ''
  const birthActProgress = birthActBlueprint.length > 1 ? birthActIndex / (birthActBlueprint.length - 1) : 0

  const birthShapeOverlay = useMemo(() => {
    const shapeSource = runtimeLogoData.shapeSource
    if (!shapeSource) {
      return undefined
    }

    const shapeData = shapeSource.shapeData
    const boundingBox = shapeData.boundingBox
    const points = shapeSource.debug.contourPoints
    if (!points.length || boundingBox.width <= 0 || boundingBox.height <= 0) {
      return undefined
    }

    const pad = 12
    const viewBoxSize = 100
    const usable = viewBoxSize - pad * 2
    const scale = Math.min(usable / boundingBox.width, usable / boundingBox.height)
    const offsetX = (viewBoxSize - boundingBox.width * scale) / 2
    const offsetY = (viewBoxSize - boundingBox.height * scale) / 2
    const normalizedPoints = points.map((point) => ({
      x: (point.x - boundingBox.minX) * scale + offsetX,
      y: (point.y - boundingBox.minY) * scale + offsetY,
    }))

    const path = toDebugPath(normalizedPoints)
    const centroid = shapeSource.debug.centroid

    return {
      path,
      centroid: {
        x: normalizePointToPercent(centroid.x, boundingBox.minX, boundingBox.width),
        y: normalizePointToPercent(centroid.y, boundingBox.minY, boundingBox.height),
      },
      signature: shapeSource.signature,
      dominantAxis:
        shapeSource.signature.dominantAxis === 'horizontal'
          ? 'Eixo dominante horizontal'
          : shapeSource.signature.dominantAxis === 'vertical'
            ? 'Eixo dominante vertical'
            : 'Eixo dominante radial',
      densityLabel:
        shapeSource.signature.density >= 0.7
          ? 'densidade estrutural alta'
          : shapeSource.signature.density >= 0.4
            ? 'densidade estrutural balanceada'
            : 'densidade estrutural aérea',
    }
  }, [runtimeLogoData.shapeSource])

  const birthAnatomyOverlay = useMemo(() => {
    const plan = selectedPreview?.visualBodyPlan ?? labState.entityProfile?.visualBodyPlan
    if (!plan) {
      return undefined
    }

    const bounds = plan.silhouette.boundingBox
    const framePad = Math.max(Math.max(bounds.width, bounds.height) * 0.08, 12)
    const coreX = normalizePointToPercent(plan.core.position.x, bounds.minX, bounds.width)
    const coreY = normalizePointToPercent(plan.core.position.y, bounds.minY, bounds.height)
    const clusterSize = Math.max(plan.core.radius * 6.4, 132)
    const anchors = plan.structure.anchors.map((anchor, index) => {
      const x = normalizePointToPercent(anchor.point.x, bounds.minX, bounds.width)
      const y = normalizePointToPercent(anchor.point.y, bounds.minY, bounds.height)

      return {
        ...anchor,
        index,
        x,
        y,
        targetX: `${(coreX - x).toFixed(2)}%`,
        targetY: `${(coreY - y).toFixed(2)}%`,
      }
    })

    return {
      bounds,
      framePad,
      viewBox: `${bounds.minX - framePad} ${bounds.minY - framePad} ${bounds.width + framePad * 2} ${bounds.height + framePad * 2}`,
      coreX,
      coreY,
      clusterSize,
      coreRadius: plan.core.radius,
      envelopePath: plan.silhouette.envelopePath,
      anchors,
      segments: plan.structure.segments,
      cavities: plan.structure.cavities,
      signalLabel: `${plan.structure.anchors.length} anchors • ${plan.structure.segments.length} segmentos • ${plan.structure.cavities.length} cavidades`,
      envelopeLabel: `envelope ${Math.round(bounds.width)}×${Math.round(bounds.height)}`,
    }
  }, [labState.entityProfile?.visualBodyPlan, selectedPreview?.visualBodyPlan])

  const birthCoreClusterStyle = useMemo(() => {
    if (!birthAnatomyOverlay) {
      return undefined
    }

    return {
      ['--persona-lab-birth-core-x' as string]: `${birthAnatomyOverlay.coreX}%`,
      ['--persona-lab-birth-core-y' as string]: `${birthAnatomyOverlay.coreY}%`,
      ['--persona-lab-birth-core-size' as string]: `${birthAnatomyOverlay.clusterSize}px`,
    } as CSSProperties
  }, [birthAnatomyOverlay])
  const birthCoreEmergenceRhythm = useMemo(() => resolveCoreEmergenceRhythm(activePersonaDNA), [activePersonaDNA])
  const birthVisualStyle = useMemo(
    () => ({
      ...birthCoreEmergenceRhythm,
      ...(birthCoreClusterStyle ?? {}),
    }),
    [birthCoreClusterStyle, birthCoreEmergenceRhythm],
  )

  const birthActDetail = useMemo(() => {
    return getBirthActNarrative({
      act: birthAct,
      stageId: birthTimelineStep?.id,
      personaDNA: activePersonaDNA,
    })
  }, [activePersonaDNA, birthAct, birthTimelineStep?.id])
  const [birthToneLine, birthProgressLine] = useMemo(
    () => getBirthSignalLines({ personaDNA: activePersonaDNA, stageId: birthTimelineStep?.id, progress: birthActProgress }),
    [activePersonaDNA, birthActProgress, birthTimelineStep?.id],
  )
  const birthAnatomyPhase = useMemo(() => resolveBirthAnatomyPhase(birthTimelineStep?.id, birthAct, birthState), [birthAct, birthState, birthTimelineStep?.id])

  const comparisonPreviews = useMemo(() => {
    if (!import.meta.env.DEV || !runtimeDebug.showComparison || !personaLabInput.logoPreview) {
      return []
    }

    return (['centelha', 'elemental', 'natureza', 'robo-ia'] as ManifestationMode[])
      .map((mode) =>
        buildManifestationPreview({
          manifestationMode: mode,
          manifestationVariant: comparisonVariantByMode[mode],
          visualEssence: personaLabInput.visualEssence,
          shapeSource: personaLabInput.shapeSource,
          palette: {
            primary: personaLabInput.palette.primary,
            secondary: personaLabInput.palette.secondary,
          },
        }),
      )
      .filter((preview): preview is PersonaLabPreview => Boolean(preview))
  }, [personaLabInput.logoPreview, personaLabInput.palette.primary, personaLabInput.palette.secondary, personaLabInput.visualEssence, runtimeDebug.showComparison])

  const archetypeValidationCases = useMemo(() => {
    if (!import.meta.env.DEV || !runtimeDebug.showArchetypeValidation) {
      return []
    }

    const validationMode = selectedPreview?.manifestationMode ?? personaLabInput.manifestationMode ?? 'centelha'
    const validationVariant = selectedPreview?.manifestationVariant ?? personaLabInput.manifestationVariant ?? comparisonVariantByMode[validationMode]

    return archetypeValidationFixtures
      .map((fixture) => {
        const processedShape = abstractShape(fixture.shapeSource, validationMode, validationVariant)
        const baseFormProfile = deriveBaseFormProfile({
          shapeSignature: processedShape?.signature ?? fixture.shapeSource.signature,
          visualEssence: personaLabInput.visualEssence,
        })
        const personaDNA = derivePersonaDNA({
          shapeSignature: processedShape?.signature ?? fixture.shapeSource.signature,
          baseFormProfile,
          visualEssence: personaLabInput.visualEssence,
        })
        const visualArchetype = deriveVisualArchetype({
          shapeSignature: processedShape?.signature ?? fixture.shapeSource.signature,
          baseFormProfile,
          personaDNA,
        })
        const visualBodyPlan = buildVisualBody({
          visualArchetype,
          processedShape,
        })
        const preview = buildManifestationPreview({
          manifestationMode: validationMode,
          manifestationVariant: validationVariant,
          visualEssence: personaLabInput.visualEssence,
          shapeSource: fixture.shapeSource,
          processedShape,
          baseFormProfile,
          personaDNA,
          visualArchetype,
          visualBodyPlan,
          palette: {
            primary: personaLabInput.palette.primary,
            secondary: personaLabInput.palette.secondary,
          },
        })

        if (!preview) {
          return undefined
        }

        return {
          fixture,
          actualBodyType: visualArchetype.bodyType,
          silhouetteStrategy: visualArchetype.silhouetteStrategy,
          weights: resolveCanonicalWeightProfile({ archetype: visualArchetype, processedShape }),
          legibility: visualBodyPlan.silhouette.legibility,
          visualBodyPlan,
          render: renderRuntime(preview, {
            variant: 'final',
            intensity: 'balanced',
            layerVisibility: {
              field: false,
              particles: false,
              core: false,
              debug: false,
              liteEffects: true,
              shapeOnly: true,
            },
          }),
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
  }, [
    personaLabInput.manifestationMode,
    personaLabInput.manifestationVariant,
    personaLabInput.palette.primary,
    personaLabInput.palette.secondary,
    personaLabInput.visualEssence,
    renderRuntime,
    runtimeDebug.showArchetypeValidation,
    selectedPreview?.manifestationMode,
    selectedPreview?.manifestationVariant,
  ])

  const selectedShapeDiagnostics = useMemo(() => {
    if (!import.meta.env.DEV || !selectedPreview || !runtimeLogoData.shapeSource) {
      return undefined
    }

    return generateShapeFromLogo(runtimeLogoData, selectedPreview.manifestationMode, selectedPreview.manifestationVariant)
  }, [runtimeLogoData, selectedPreview])

  const renderPreviewVisual = useCallback(
    (preview: PersonaLabPreview, variant: PersonaVisualVariant = 'preview') => renderRuntime(preview, { variant, intensity: manifestationIntensity }),
    [manifestationIntensity, renderRuntime],
  )

  const livePreview = useMemo(() => {
    if (selectedPreview) {
      return renderRuntime(selectedPreview, {
        variant: stage === 'final' ? 'final' : 'preview',
        intensity: manifestationIntensity,
      })
    }

    if (personaLabInput.logoPreview) {
      return (
        <div className="persona-lab-live-logo-shell">
          <img src={personaLabInput.logoPreview} alt="Origem visual enviada" className="persona-lab-logo-image" />
        </div>
      )
    }

    return (
      <div className="persona-lab-live-empty">
        <span className="professional-label">Núcleo em espera</span>
        <strong>A centelha ainda não recebeu origem visual.</strong>
        <p>Envie um logo para iniciar a manifestação e destravar o preview vivo.</p>
      </div>
    )
  }, [manifestationIntensity, personaLabInput.logoPreview, renderRuntime, selectedPreview, stage])

  const handleManifestationIntensityChange = useCallback((level: ManifestationIntensity) => {
    setManifestationIntensity(level)
    dispatchPersonaCommand(createOrchestratorCommand('register_interaction', {
      interactionType: 'click',
      action: 'customize',
      summary: `Ritual intensity changed to ${level}.`,
      topics: ['ritual-intensity', level],
      weight: 0.28,
    }))
  }, [dispatchPersonaCommand])

  const handleFlowMindPromptChange = useCallback((effectId: string, value: string) => {
    setFlowMindPromptValues((current) => ({
      ...current,
      [effectId]: value,
    }))
  }, [])

  const handleFlowMindPromptSubmit = useCallback((effect: Extract<FlowMindUiEffect, { kind: 'prompt' }>) => {
    const value = flowMindPromptValues[effect.effectId]?.trim()
    if (!value) {
      return
    }

    dispatchPersonaCommand(createOrchestratorCommand('register_interaction', {
      interactionType: 'message',
      summary: value,
      topics: ['flowmind-prompt', 'user-preference'],
      weight: 0.46,
    }))
    dismissFlowMindEffect(effect.effectId)
    setFlowMindPromptValues((current) => {
      const next = { ...current }
      delete next[effect.effectId]
      return next
    })
  }, [dismissFlowMindEffect, dispatchPersonaCommand, flowMindPromptValues])

  return (
    <main className="persona-lab-shell">
      <section className="persona-lab-panel">
        <div className="persona-lab-topbar">
          <button type="button" className="chat-header-button subtle" onClick={() => navigateTo('/')}>
            Voltar ao produto
          </button>
          {import.meta.env.DEV ? (
            <button type="button" className={`chat-header-button subtle ${debugShapeOverlay ? 'selected' : ''}`} onClick={() => setDebugShapeOverlay((current) => !current)}>
              {debugShapeOverlay ? 'Ocultar shape debug' : 'Shape debug'}
            </button>
          ) : null}
          <button type="button" className="chat-header-button subtle" onClick={handleRestart}>
            Reiniciar laboratório
          </button>
        </div>

        <PersonaLabDevPanel
          runtimeDebug={runtimeDebug}
          runtimePerf={runtimePerf}
          entityProfile={labState.entityProfile}
          pixiPerfScenario={pixiPerfScenario}
          toggleRuntimeDebug={toggleRuntimeDebug}
          setPixiPerfScenario={setPixiPerfScenario}
        />

        <section className="persona-lab-hero-grid">
          <div className="persona-lab-header">
            <div className="brandsoul-hero-logo">
              <img src={brandsoulLogo} alt="BrandSoul" className="brandsoul-logo brandsoul-logo--hero" />
            </div>
            <span className="eyebrow">Persona Lab</span>
            <h1 className="persona-lab-title">Manifeste uma presença viva, não apenas um visual de marca.</h1>
            <p className="persona-lab-subtitle">
              O laboratório acopla símbolo, campo, intensidade e comportamento até a entidade responder com forma própria. Cada ajuste altera a presença em tempo real.
            </p>
            <div className="persona-lab-stage-intro">
              <span className="persona-lab-stage-intro__index">Agora em {currentStageBlueprint.label}</span>
              <strong>{currentStageBlueprint.title}</strong>
              <p>{currentStageBlueprint.description}</p>
            </div>
            <div className="persona-lab-stage-rail" aria-label="Ritual de manifestação">
              {progressStages.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  className={`persona-lab-stage-pill ${stage === step ? 'active' : ''}`}
                  onClick={() => {
                    if (progressStages.indexOf(step) <= progressStages.indexOf(stage)) {
                      setStage(step)
                    }
                  }}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{stageBlueprint[step].label}</strong>
                </button>
              ))}
            </div>
            {entitlement.isBlocked && entitlement.strongestUpgrade ? (
              <div className="persona-lab-upgrade-banner">
                <strong>Limite atual do plano</strong>
                <p>
                  {entitlement.strongestUpgrade.reason} Upgrade sugerido: {entitlement.strongestUpgrade.suggestedPlan}.
                </p>
              </div>
            ) : null}
            {!entitlement.isBlocked && entitlement.hasSoftLimit && entitlement.strongestUpgrade ? (
              <div className="persona-lab-upgrade-banner persona-lab-upgrade-banner--soft">
                <strong>Uso próximo do limite</strong>
                <p>
                  {entitlement.strongestUpgrade.reason} A experiência continua, mas vale considerar {entitlement.strongestUpgrade.suggestedPlan}.
                </p>
              </div>
            ) : null}
          </div>

          <aside className="persona-lab-live-panel" aria-label="Presença viva da entidade">
            <div className="persona-lab-live-panel__header">
              <div>
                <span className="professional-label">Núcleo vivo</span>
                <strong>{labState.entityProfile?.finalForm.identity?.name ?? labState.finalPersona?.name ?? 'Entidade em formação'}</strong>
              </div>
              <span className="persona-lab-live-status">{stage}</span>
            </div>
            <div className={`persona-lab-live-preview ${selectedPreview ? `mode-${selectedPreview.manifestationMode}` : 'mode-dormant'}`}>
              {livePreview}
            </div>
            <div className="persona-lab-live-chip-row">
              {liveSummaryChips.map((chip) => (
                <span key={chip} className="persona-lab-live-chip">{chip}</span>
              ))}
            </div>
            <div className="persona-lab-live-insights">
              <article className="persona-lab-live-insight">
                <span className="professional-label">Identidade da entidade</span>
                <strong>{selectedManifestationMode?.label ?? 'Aguardando família visual'}</strong>
                <p>{selectedPreview?.description ?? 'A primeira forma ainda não foi escolhida.'}</p>
              </article>
              <article className="persona-lab-live-insight">
                <span className="professional-label">Essência / voz / comportamento</span>
                <div className="persona-lab-live-list">
                  {liveIdentityLines.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
              </article>
              <article className="persona-lab-live-insight">
                <span className="professional-label">Presença pública</span>
                <p>{relationalSummary?.refinementCopy ?? 'A identidade pública aparece assim que a entidade concluir a ativação.'}</p>
              </article>
            </div>
          </aside>
        </section>

        <PersonaLabComparisonPanel comparisonPreviews={comparisonPreviews} renderRuntime={renderRuntime} />

        <PersonaLabArchetypeValidationPanel cases={archetypeValidationCases} />

        {runtimeDebug.showShapeCompare ? (
          <PersonaLabShapeComparePanel
            selectedPreview={selectedPreview}
            selectedShapeDiagnostics={selectedShapeDiagnostics}
            logoPreview={personaLabInput.logoPreview}
            coreSymbolDebug={personaLabInput.coreSymbolDebug}
            renderRuntime={renderRuntime}
            toDebugPath={toDebugPath}
          />
        ) : null}

        <EntityMessageSurface
          effects={flowMindEffects}
          promptValues={flowMindPromptValues}
          canTriggerExport={stage === 'final' && exportingFormat === null}
          onDismiss={dismissFlowMindEffect}
          onPromptChange={handleFlowMindPromptChange}
          onPromptSubmit={handleFlowMindPromptSubmit}
          onOpenDiscovery={navigateTo}
          onTriggerExport={(effect) => {
            void handleDownloadSocialAsset(effect.exportFormat === 'story' ? 'story' : 'post')
            dismissFlowMindEffect(effect.effectId)
          }}
        />

        <AnimatePresence mode="wait">
          <motion.section
            key={stage}
            className="persona-lab-stage"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.985 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            {stage === 'upload' ? (
              <div className="persona-lab-card">
                <span className="catalog-kicker">Etapa 1 • Origem visual</span>
                <h2>Entregue o símbolo que vai disparar a manifestação</h2>
                <p>Envie um PNG, JPG ou SVG. O laboratório lê forma, temperatura visual e contraste para montar o primeiro campo da entidade.</p>
                <label className="persona-lab-upload">
                  <input type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" onChange={handleLogoUpload} />
                  <span>{isExtractingPalette ? 'Lendo forma, brilho e assinatura cromática...' : 'Iniciar leitura do símbolo'}</span>
                </label>
                {personaLabInput.logoPreview ? (
                  <div className="persona-lab-logo-preview">
                    <img src={personaLabInput.logoPreview} alt="Preview do logo enviado" className="persona-lab-logo-image" />
                    <div className="persona-lab-palette-summary">
                      <span className="professional-label">Paleta inicial</span>
                      <div className="persona-lab-palette">
                        <span className="persona-lab-swatch" style={{ background: personaLabInput.palette.primary }} />
                        {personaLabInput.palette.secondary ? <span className="persona-lab-swatch" style={{ background: personaLabInput.palette.secondary }} /> : null}
                      </div>
                      {personaLabInput.visualEssence ? (
                        <p>
                          {personaLabInput.visualEssence.structure} • {personaLabInput.visualEssence.temperature} • {personaLabInput.visualEssence.intensity}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {logoUploadNotice ? (
                  <div className="persona-lab-upgrade-banner">
                    <strong>{logoUploadNotice.title}</strong>
                    <p>{logoUploadNotice.message}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {stage === 'manifestation' ? (
              <div className="persona-lab-card">
                <span className="catalog-kicker">Etapa 2 • Arquitetura viva</span>
                <h2>Escolha a família de presença que vai conduzir a entidade</h2>
                <div className="persona-lab-logo-preview compact">
                  {personaLabInput.logoPreview ? <img src={personaLabInput.logoPreview} alt="Preview do logo enviado" className="persona-lab-logo-image compact" /> : null}
                  <div className="persona-lab-palette-summary">
                    <span className="professional-label">Extração visual</span>
                    <p>Primária: {personaLabInput.palette.primary} • Secundária: {personaLabInput.palette.secondary ?? 'não detectada'} • Contraste: {personaLabInput.palette.contrast}</p>
                    {personaLabInput.visualEssence ? (
                      <p>
                        Estrutura: {personaLabInput.visualEssence.structure} • Composição: {personaLabInput.visualEssence.composition} • Intensidade: {personaLabInput.visualEssence.intensity}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="persona-lab-manifestation-grid">
                  {manifestationModes.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className={`persona-lab-preview-card manifestation-card ${personaLabInput.manifestationMode === mode.id ? 'active' : ''}`}
                      style={{ ['--persona-lab-accent' as string]: mode.accent }}
                      onClick={() => handleManifestationModeChange(mode.id)}
                    >
                      <div className={`persona-lab-mode-glyph mode-${mode.id}`} aria-hidden="true" />
                      <span className="professional-label">Família de manifestação</span>
                      <strong>{mode.label}</strong>
                      <p>{mode.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {stage === 'variant' ? (
              <div className="persona-lab-card">
                <span className="catalog-kicker">Etapa 3 • Assinatura interna</span>
                <h2>Refine a essência que vai guiar voz, gesto e comportamento</h2>
                <p className="persona-lab-preview-note">Agora você define como essa família se comporta por dentro antes de ganhar vida no runtime.</p>
                <div className="persona-lab-preview-grid">
                  {(selectedManifestationMode?.variants ?? []).map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      className={`persona-lab-preview-card ${personaLabInput.manifestationVariant === variant.id ? 'active' : ''}`}
                      style={{ ['--persona-lab-accent' as string]: selectedManifestationMode?.accent ?? '#ff9460' }}
                      onClick={() => handleManifestationVariantChange(variant.id)}
                    >
                      <div className={`persona-lab-mode-glyph variant-${variant.id}`} aria-hidden="true" />
                      <span className="professional-label">Variação dominante</span>
                      <strong>{variant.label}</strong>
                      <p>{variant.description}</p>
                      <span className="persona-lab-select-link">Ativar esta assinatura</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {stage === 'fusion' ? (
              <div className="persona-lab-card">
                <span className="catalog-kicker">Etapa 4 • Fusão de identidade</span>
                <h2>Acople o símbolo da marca ao corpo vivo da entidade</h2>
                <div className="persona-lab-intensity-controls" aria-label="Ritual intensity">
                  {manifestationIntensityLevels.map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`persona-lab-intensity-chip ${manifestationIntensity === level ? 'active' : ''}`}
                      onClick={() => handleManifestationIntensityChange(level)}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                {selectedPreview ? (
                  <div
                    className={`persona-lab-fusion-stage mode-${selectedPreview.manifestationMode} variant-${selectedPreview.manifestationVariant} intensity-${manifestationIntensity} temperament-${activePersonaDNA?.temperament ?? 'default'} presence-${activePersonaDNA?.presenceStyle ?? 'default'} precision-${activePersonaDNA?.precision ?? 'default'}`}
                    style={fusionRitualModel.styleVars}
                  >
                    <article className="persona-lab-selected-preview" style={{ ['--persona-lab-accent' as string]: selectedPreview.visualConfig.accent }}>
                      <div className="persona-lab-fusion-logo">
                        {personaLabInput.logoPreview ? <img src={personaLabInput.logoPreview} alt="Logo base da fusão" className="persona-lab-logo-image compact" /> : null}
                      </div>
                      <div className="persona-lab-fusion-plus">+</div>
                      {renderPreviewVisual(selectedPreview)}
                      <span className="professional-label">{fusionRitualModel.eyebrow}</span>
                      <strong>{fusionRitualModel.title}</strong>
                      <p>{fusionRitualModel.detail}</p>
                    </article>
                    <div className="persona-lab-fusion-meta">
                      <article className="persona-lab-fusion-copy-card">
                        <span className="professional-label">Continuidade de identidade</span>
                        <strong>
                          {selectedManifestationMode?.label} • {selectedPreview.description}
                        </strong>
                        <p className="persona-lab-birth-message">{fusionCopy}</p>
                      </article>
                      <article className="persona-lab-fusion-copy-card persona-lab-fusion-copy-card--signal">
                        <span className="professional-label">Direção semântica da fusão</span>
                        <div className="persona-lab-fusion-signal-grid">
                          {fusionRitualModel.signals.map((signal) => (
                            <span key={signal}>{signal}</span>
                          ))}
                        </div>
                      </article>
                    </div>
                  </div>
                ) : null}
                <div className="admin-config-actions">
                  <button type="button" className="persona-toggle subtle" onClick={() => setStage('variant')}>
                    Revisar assinatura
                  </button>
                  <button type="button" className="persona-toggle selected guidance-submit-button" disabled={!canContinueToFusion} onClick={handleStartBirth}>
                    Iniciar ritual de ativação
                  </button>
                </div>
              </div>
            ) : null}

            {stage === 'birth' ? (
              <div className="persona-lab-card persona-lab-birth-card">
                <span className="catalog-kicker">Etapa 5 • Ativação</span>
                <h2>A entidade deixa de ser preview e entra em nascimento real</h2>
                <div className="persona-lab-birth-rail" aria-label="Linha narrativa do nascimento">
                  {birthActBlueprint.map((act, index) => {
                    const state =
                      index < birthActIndex ? 'complete' : index === birthActIndex ? 'active' : 'idle'

                    return (
                      <article key={act.id} className={`persona-lab-birth-act state-${state}`}>
                        <span>{act.label}</span>
                        <strong>{act.title}</strong>
                      </article>
                    )
                  })}
                </div>
                <motion.div
                  className={`persona-lab-birth-visual state-${birthState} act-${birthAct} phase-${birthAnatomyPhase} ${selectedPreview ? `mode-${selectedPreview.manifestationMode} variant-${selectedPreview.manifestationVariant}` : ''} intensity-${manifestationIntensity}`}
                  style={birthVisualStyle}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.36, ease: 'easeOut' }}
                >
                  <div className="persona-lab-birth-stage-frame">
                    <div className="persona-lab-birth-origin-shell" aria-hidden="true">
                      {personaLabInput.logoPreview ? <img src={personaLabInput.logoPreview} alt="" className="persona-lab-birth-origin-image" /> : null}
                    </div>
                    <div className="persona-lab-birth-reading-layer" aria-hidden="true">
                      <div className="persona-lab-birth-reading-scan scan-a" />
                      <div className="persona-lab-birth-reading-scan scan-b" />
                      <div className="persona-lab-birth-axis axis-horizontal" />
                      <div className="persona-lab-birth-axis axis-vertical" />
                      {birthAnatomyOverlay ? (
                        <svg className="persona-lab-birth-anatomy" viewBox={birthAnatomyOverlay.viewBox} preserveAspectRatio="xMidYMid meet">
                          <rect
                            x={birthAnatomyOverlay.bounds.minX}
                            y={birthAnatomyOverlay.bounds.minY}
                            width={birthAnatomyOverlay.bounds.width}
                            height={birthAnatomyOverlay.bounds.height}
                            rx={Math.min(birthAnatomyOverlay.bounds.width, birthAnatomyOverlay.bounds.height) * 0.08}
                            className="persona-lab-birth-anatomy-bounds"
                          />
                          <path d={birthAnatomyOverlay.envelopePath} className="persona-lab-birth-anatomy-envelope" />
                          {birthAnatomyOverlay.cavities.map((cavity) => (
                            <ellipse
                              key={cavity.id}
                              cx={cavity.center.x}
                              cy={cavity.center.y}
                              rx={Math.max(cavity.radiusX, 2)}
                              ry={Math.max(cavity.radiusY, 2)}
                              className="persona-lab-birth-anatomy-cavity"
                              style={{ opacity: Math.min(Math.max(cavity.weight, 0.2), 0.84) }}
                            />
                          ))}
                          {birthAnatomyOverlay.segments.map((segment) => (
                            <line
                              key={segment.id}
                              x1={segment.from.x}
                              y1={segment.from.y}
                              x2={segment.to.x}
                              y2={segment.to.y}
                              className="persona-lab-birth-anatomy-segment"
                              style={{ opacity: Math.min(Math.max(segment.weight, 0.22), 0.92) }}
                            />
                          ))}
                          {birthAnatomyOverlay.anchors.map((anchor) => (
                            <circle
                              key={anchor.id}
                              cx={anchor.point.x}
                              cy={anchor.point.y}
                              r={anchor.role === 'core' ? Math.max(birthAnatomyOverlay.coreRadius * 0.24, 3) : 2 + anchor.weight * 1.6}
                              className={`persona-lab-birth-anatomy-anchor role-${anchor.role}`}
                            />
                          ))}
                        </svg>
                      ) : birthShapeOverlay?.path ? (
                        <svg className="persona-lab-birth-contour" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <path d={birthShapeOverlay.path} />
                        </svg>
                      ) : null}
                      {birthAnatomyOverlay ? (
                        <div className="persona-lab-birth-particles">
                          {birthAnatomyOverlay.anchors
                            .filter((anchor) => anchor.role !== 'core')
                            .slice(0, 10)
                            .map((anchor, index) => (
                              <span
                                key={anchor.id}
                                className={`persona-lab-birth-particle anatomy-particle role-${anchor.role}`}
                                style={{
                                  left: `${anchor.x}%`,
                                  top: `${anchor.y}%`,
                                  ['--particle-x' as string]: anchor.targetX,
                                  ['--particle-y' as string]: anchor.targetY,
                                  ['--particle-delay' as string]: `${index * 90}ms`,
                                } as CSSProperties}
                              />
                            ))}
                        </div>
                      ) : birthShapeOverlay ? (
                        <div
                          className="persona-lab-birth-centroid"
                          style={{
                            left: `${birthShapeOverlay.centroid.x}%`,
                            top: `${birthShapeOverlay.centroid.y}%`,
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="persona-lab-birth-core-cluster" aria-hidden="true" style={birthCoreClusterStyle}>
                      <span className="persona-lab-birth-core-halo" />
                      <span className="persona-lab-birth-core-ring" />
                      <span className="persona-lab-birth-core-pulse" />
                    </div>
                    <div className="persona-lab-birth-hero-caption">
                      <span className="professional-label">{birthActDetail.eyebrow}</span>
                      <strong>{birthActDetail.title}</strong>
                      <p>{birthActDetail.detail}</p>
                    </div>
                  </div>
                  {selectedPreview
                    ? renderRuntime(selectedPreview, {
                        playBirthTimeline: true,
                        orchestratorFrame,
                        orchestratorCommand,
                        onBirthPhaseChange: handleBirthPhaseChange,
                        onBirthComplete: handleBirthComplete,
                        onPerformanceUpdate: setRuntimePerf,
                      })
                    : null}
                </motion.div>
                <div className="persona-lab-birth-meta">
                  <article className="persona-lab-birth-copy-card">
                    <span className="professional-label">Narrativa do ato</span>
                    <p className="persona-lab-birth-message">{activeBirthMessage}</p>
                  </article>
                  <article className="persona-lab-birth-copy-card persona-lab-birth-copy-card--signal">
                    <span className="professional-label">Leitura estrutural do logo</span>
                    <div className="persona-lab-birth-signal-grid">
                      <span>{birthShapeOverlay?.dominantAxis ?? 'Eixo aguardando leitura'}</span>
                      <span>{birthShapeOverlay?.densityLabel ?? 'densidade estrutural em análise'}</span>
                      <span>{birthAnatomyOverlay?.signalLabel ?? 'anatomia ainda em reconstrução'}</span>
                      <span>{birthAnatomyOverlay?.envelopeLabel ?? 'envelope aguardando corpo'}</span>
                      <span>{birthToneLine}</span>
                      <span>{birthProgressLine}</span>
                    </div>
                  </article>
                </div>
              </div>
            ) : null}

            {stage === 'final' ? (
              <div className="persona-lab-card">
                <span className="catalog-kicker">Etapa 6 • Presença pública</span>
                <h2>A entidade saiu do laboratório pronta para circular</h2>
                {selectedPreview ? (
                  <PersonaLabFinalHero
                    selectedPreview={selectedPreview}
                    entityProfile={labState.entityProfile}
                    orchestratorFrame={orchestratorFrame}
                    activeArchetypeConfig={activeArchetypeConfig}
                    finalPersona={labState.finalPersona}
                    renderRuntime={renderRuntime}
                    onExportReady={(exporter) => setRuntimeSceneExporter(() => exporter)}
                    onPerformanceUpdate={setRuntimePerf}
                  />
                ) : null}
                <div className="persona-lab-final-grid">
                  <article className="persona-lab-final-card">
                      <span className="professional-label">Identidade da entidade</span>
                    <strong>{labState.finalPersona?.name}</strong>
                    <p>{labState.finalPersona?.manifesto}</p>
                    {labState.finalPersona?.namingRationale ? <p className="persona-lab-naming-rationale">{labState.finalPersona.namingRationale}</p> : null}
                    {labState.finalPersona?.toneKeywords?.length ? (
                      <p className="persona-lab-tone-keywords">{labState.finalPersona.toneKeywords.join(' • ')}</p>
                    ) : null}
                  </article>
                  <article className="persona-lab-final-card">
                      <span className="professional-label">Primeira fala pública</span>
                    <p>{labState.finalPersona?.openingLine}</p>
                    <p className="persona-lab-final-card-note">{finalPresenceModel.detail}</p>
                  </article>
                  <article className="persona-lab-final-card">
                      <span className="professional-label">Essência / voz / comportamento</span>
                    <p>
                      {personaLabInput.styleAnswers.brandStyle} • {personaLabInput.styleAnswers.languageStyle} • {personaLabInput.styleAnswers.actionStyle}
                    </p>
                  </article>
                  <article className="persona-lab-final-card persona-lab-final-card--signal">
                    <span className="professional-label">Leitura semântica final</span>
                    <strong>{finalPresenceModel.eyebrow}</strong>
                    <p>{finalPresenceModel.title}</p>
                    <div className="persona-lab-final-signal-grid">
                      {finalPresenceModel.signals.map((signal) => (
                        <span key={signal}>{signal}</span>
                      ))}
                    </div>
                  </article>
                  {labState.entityProfile ? (
                    <article className="persona-lab-final-card">
                      <span className="professional-label">Forma revelada</span>
                      <strong>{labState.entityProfile.social.handle}</strong>
                      <p>
                        {labState.entityProfile.manifestation.mode} • {labState.entityProfile.manifestation.variant}
                      </p>
                      <p>{finalPresenceModel.impactCopy}</p>
                    </article>
                  ) : null}
                  {labState.entityProfile?.relational ? (
                    <article className="persona-lab-final-card persona-lab-relational-card">
                      <span className="professional-label">Vínculo</span>
                      <strong>Esta centelha já não é apenas um visual gerado.</strong>
                      <p>{relationalSummary?.refinementCopy}</p>
                      <p>{relationalSummary?.styleCopy}</p>
                      <p>{relationalSummary?.continuityCopy}</p>
                    </article>
                  ) : null}
                </div>
                {selectedPreview && labState.finalPersona ? (
                  <PersonaLabSocialPanel entityProfile={labState.entityProfile} />
                ) : null}
                {selectedPreview && labState.finalPersona ? (
                  <section className="persona-lab-social-section">
                    <div className="persona-lab-social-copy">
                      <span className="professional-label">Leve ela para o mundo</span>
                      <h3>Escolha o formato e exporte a primeira aparição da sua entidade.</h3>
                      <p>
                        Post e story já saem com composição própria, assinatura visual e espaço para a mensagem da entidade.
                      </p>
                    </div>
                    <div className="persona-lab-social-grid">
                      {socialOutputPreviews.map((output) => (
                        <article key={output.format} className={`persona-lab-social-card format-${output.format}`}>
                          <div className={`persona-lab-social-preview format-${output.format}`}>
                            <img src={output.previewUrl} alt={`Preview ${output.label}`} />
                          </div>
                          <div className="persona-lab-social-meta">
                            <div>
                              <span className="professional-label">{output.label}</span>
                              <strong>{output.ratio}</strong>
                            </div>
                            <p>{output.format === 'post' ? 'Persona central, frase forte e assinatura limpa.' : 'Mais presença vertical, CTA visível e composição para story.'}</p>
                            <p>{output.format === 'post' ? 'Ideal para anunciar a criação.' : 'Ideal para revelar a presença em tela cheia.'}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
                {selectedPreview && labState.finalPersona ? (
                  <div className="persona-lab-export-moment">
                    <div>
                      <span className="professional-label">Exportar criação</span>
                      <strong>Sua entidade já pode sair do laboratório.</strong>
                      <p>Baixe a presença final ou gere a peça pronta para compartilhar.</p>
                    </div>
                    <div className="admin-config-actions persona-lab-output-actions">
                      <button
                        type="button"
                        className="persona-toggle subtle"
                        disabled={isExportingRuntimeScene || exportingFormat !== null}
                        onClick={() => void handleDownloadRuntimeScene('current')}
                      >
                        {isExportingRuntimeScene ? 'Preparando presença...' : 'Baixar presença'}
                      </button>
                      <button
                        type="button"
                        className="persona-toggle selected guidance-submit-button"
                        disabled={exportingFormat !== null}
                        onClick={() => void handleDownloadSocialAsset('post')}
                      >
                        {exportingFormat === 'post' ? 'Preparando post...' : 'Exportar post'}
                      </button>
                      <button
                        type="button"
                        className="persona-toggle subtle"
                        disabled={exportingFormat !== null}
                        onClick={() => void handleDownloadSocialAsset('story')}
                      >
                        {exportingFormat === 'story' ? 'Preparando story...' : 'Exportar story'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </motion.section>
        </AnimatePresence>
      </section>
    </main>
  )
}
