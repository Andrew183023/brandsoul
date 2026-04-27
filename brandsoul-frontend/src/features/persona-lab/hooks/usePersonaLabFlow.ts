import type { ChangeEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { type ManifestationMode } from '../../../domain/rendering/contracts/types'
import { getOrCreatePersonaOwnerId } from '../../../backend-bridge/api/ownerSession'
import { publishExport } from '../../../export/social/distributionService'
import { buildSocialOutputConfig, buildSocialPreviewDataUrl, downloadSocialAsset, type SocialOutputFormat } from '../../../persona-lab/core/socialOutputs'
import type { SceneExportFormat } from '../../../runtime/pixi/export/sceneExport'
import { createHttpPersonaEngineApi } from '../../../backend-bridge/api/personaEngineApi'
import { mapPersonaLabStateToBackendEntityRequest } from '../../../backend-bridge/mappers/entityRequestMapper'
import type { OrchestratorCommand } from '../../../domain/orchestration/contracts/OrchestratorCommand'
import { createOrchestratorCommand } from '../../../domain/orchestration/contracts/OrchestratorCommand'
import { createHttpOrchestratorApi } from '../../../backend-bridge/api/orchestratorApi'
import { analyzeVisualEssence } from '../../../lib/visualEssence'
import { extractCoreSymbol, extractLogoMask } from '../../../domain/identity/processing/logoProcessing'
import { normalizeSvgAssetForPersonaLab } from '../../../domain/identity/processing/svgAssetPipeline'
import { extractShapeSource } from '../../../domain/shape/services/shapeIntelligence'
import { getManifestationBirthMessages, getManifestationFusionCopy } from '../content/ritualCopy'
import { initialLabState, type PersonaBirthState, type PersonaLabStage } from '../state/personaLabStore'
import { applyLogoExtraction, finalizePersona, hydrateStateFromEntityProfile, selectManifestationMode, selectManifestationVariant } from '../state/personaLabActions'
import { selectSelectedManifestationMode, selectSelectedPreview } from '../state/personaLabSelectors'
import { usePersonaLabEventDispatch } from './usePersonaLabEventDispatch'
import { useAuthSession } from '../../../lib/session'
import { detectSupportedLogoFileFormat, readFileAsDataUrl, type SupportedLogoFileFormat } from '../../../lib/media'
import type { ExtractedShapeSource } from '../../../domain/shape/contracts/ProcessedShape'

const personaEngineApi = createHttpPersonaEngineApi()
const orchestratorApi = createHttpOrchestratorApi()
const PERSONA_ENTITY_STORAGE_KEY = 'brandsoul.persona-lab.entity-id'

type LogoUploadNotice = {
  tone: 'error' | 'warning'
  title: string
  message: string
}

function buildFallbackVisualEssence() {
  return {
    primaryColor: '#ff9460',
    secondaryColor: '#6e86ff',
    energyColor: '#ffc18e',
    neutralColor: '#8f99ad',
    contrast: 'medium' as const,
    saturation: 'medium' as const,
    temperature: 'neutral' as const,
    brightness: 0.5,
    structure: 'balanced' as const,
    composition: 'centered' as const,
    intensity: 'vivid' as const,
    dominantZones: [{ x: 0.5, y: 0.5, weight: 1 }],
  }
}

function formatLogoFormatLabel(format: SupportedLogoFileFormat) {
  return format === 'svg' ? 'SVG' : format === 'png' ? 'PNG' : 'JPG'
}

function buildUploadWarnings(args: {
  fileFormat: SupportedLogoFileFormat
  svgNormalized: boolean
  visualFallback: boolean
  logoMaskFailed: boolean
  coreSymbolFailed: boolean
  shapeFailed: boolean
}) {
  const warnings: string[] = []

  if (args.fileFormat === 'svg' && !args.svgNormalized) {
    warnings.push('O SVG foi aceito, mas a normalização segura caiu para fallback compatível.')
  }
  if (args.visualFallback) {
    warnings.push('A leitura cromática usou parâmetros padrão para não travar a criação.')
  }
  if (args.logoMaskFailed && args.fileFormat !== 'svg') {
    warnings.push('A máscara raster não ficou estável; o preview e a análise visual continuam válidos.')
  }
  if (args.coreSymbolFailed) {
    warnings.push('O recorte do símbolo central falhou, então o laboratório seguirá sem esse detalhe auxiliar.')
  }
  if (args.shapeFailed) {
    warnings.push('A extração estrutural não conseguiu montar um shape rico; a persona seguirá em modo degradado com preview, paleta e leitura visual.')
  }

  return warnings
}

function clearPersistedPersonaEntityId() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(PERSONA_ENTITY_STORAGE_KEY)
}

function mapSocialOutputToExportFormat(format: SocialOutputFormat) {
  return format === 'story' ? 'story' as const : 'png' as const
}

function mapSceneExportToEntityExportFormat(format: SceneExportFormat) {
  if (format === 'vertical') {
    return 'story' as const
  }

  return 'png' as const
}

export function usePersonaLabFlow() {
  const authSession = useAuthSession()
  const [stage, setStage] = useState<PersonaLabStage>('upload')
  const [labState, setLabState] = useState(initialLabState)
  const [isExtractingPalette, setIsExtractingPalette] = useState(false)
  const [birthState, setBirthState] = useState<PersonaBirthState>('building')
  const [birthMessageIndex, setBirthMessageIndex] = useState(0)
  const [logoUploadNotice, setLogoUploadNotice] = useState<LogoUploadNotice | null>(null)
  const [exportingFormat, setExportingFormat] = useState<SocialOutputFormat | null>(null)
  const [isExportingRuntimeScene, setIsExportingRuntimeScene] = useState(false)
  const [runtimeSceneExporter, setRuntimeSceneExporter] = useState<((format?: SceneExportFormat) => Promise<void>) | null>(null)
  const [orchestratorCommand, setOrchestratorCommand] = useState<OrchestratorCommand | undefined>(undefined)
  const hasLeftExperienceRef = useRef(false)
  const hydratedEntityIdRef = useRef<string | null>(null)
  const restoreRequestEntityIdRef = useRef<string | null>(null)
  const ownerId = useMemo(() => getOrCreatePersonaOwnerId(), [])

  const personaLabInput = labState.input
  const selectedPreview = useMemo(() => selectSelectedPreview(labState), [labState])
  const selectedManifestationMode = useMemo(() => selectSelectedManifestationMode(labState), [labState])
  const canContinueToFusion = Boolean(personaLabInput.manifestationMode && personaLabInput.manifestationVariant)

  const birthMessages = useMemo(
    () => getManifestationBirthMessages(selectedPreview?.manifestationMode, selectedPreview?.manifestationVariant, selectedPreview?.personaDNA),
    [selectedPreview?.manifestationMode, selectedPreview?.manifestationVariant, selectedPreview?.personaDNA],
  )

  const fusionCopy = useMemo(
    () => getManifestationFusionCopy(selectedPreview?.manifestationMode, selectedPreview?.manifestationVariant),
    [selectedPreview?.manifestationMode, selectedPreview?.manifestationVariant],
  )

  const socialOutputConfigs = useMemo(() => [buildSocialOutputConfig('post'), buildSocialOutputConfig('story')], [])

  const socialOutputPreviews = useMemo(() => {
    if (!selectedPreview || !labState.finalPersona) {
      return []
    }

    const finalPersona = labState.finalPersona

    return socialOutputConfigs.map((config) => ({
      ...config,
      previewUrl: buildSocialPreviewDataUrl({
        preview: selectedPreview,
        finalPersona,
        config,
        entityProfile: labState.entityProfile,
      }),
    }))
  }, [labState.entityProfile, labState.finalPersona, selectedPreview, socialOutputConfigs])

  const {
    dispatchPersonaCommand,
    dispatchPersonaEvent,
    orchestratorFrame,
    flowMindEffects,
    restoreHydratedRuntime,
    dismissFlowMindEffect,
  } = usePersonaLabEventDispatch({
    labState,
    setLabState,
    setOrchestratorCommand,
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!authSession?.token) {
      return
    }

    const persistedEntityId = window.localStorage.getItem(PERSONA_ENTITY_STORAGE_KEY)
    if (!persistedEntityId) {
      return
    }

    if (restoreRequestEntityIdRef.current === persistedEntityId) {
      return
    }

    if (hydratedEntityIdRef.current === persistedEntityId || labState.entityProfile?.id === persistedEntityId) {
      return
    }

    let cancelled = false
    restoreRequestEntityIdRef.current = persistedEntityId

    void personaEngineApi.getEntityById(persistedEntityId).then(async (response) => {
      if (cancelled) {
        return
      }

      restoreRequestEntityIdRef.current = null

      if (!response?.entity) {
        if (response?.status === 'failed' && ['ENTITY_NOT_FOUND', 'ENTITY_ACCESS_DENIED'].includes(response.error?.code ?? '')) {
          clearPersistedPersonaEntityId()
          hydratedEntityIdRef.current = null
          setLabState((currentState) => currentState.entityProfile?.id === persistedEntityId ? initialLabState : currentState)
          setStage('upload')
        }
        return
      }

      const entityProfile = response.entity
      hydratedEntityIdRef.current = entityProfile.id
      setLabState((currentState) => hydrateStateFromEntityProfile(currentState, entityProfile))

      const hydratedRuntime = await orchestratorApi.hydrateRuntime(entityProfile.id)

      if (cancelled) {
        return
      }

      if (!hydratedRuntime) {
        return
      }

      restoreHydratedRuntime(hydratedRuntime)
      setStage(
        hydratedRuntime.state.sessionStatus === 'running' || hydratedRuntime.state.sessionStatus === 'paused'
          ? 'birth'
          : hydratedRuntime.state.currentStage === 'final' || hydratedRuntime.state.sessionStatus === 'completed'
            ? 'final'
            : 'fusion',
      )
    })

    return () => {
      cancelled = true
      if (restoreRequestEntityIdRef.current === persistedEntityId) {
        restoreRequestEntityIdRef.current = null
      }
    }
  }, [authSession?.token, labState.entityProfile?.id, restoreHydratedRuntime])

  useEffect(() => {
    if (stage !== 'birth' || !selectedPreview) {
      return
    }

    setBirthState('building')
    setBirthMessageIndex(0)
  }, [selectedPreview, stage])

  useEffect(() => {
    if (!labState.entityProfile) {
      return
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hasLeftExperienceRef.current = true
        return
      }

      if (document.visibilityState === 'visible' && hasLeftExperienceRef.current) {
        hasLeftExperienceRef.current = false
        dispatchPersonaCommand(createOrchestratorCommand('register_return_visit', {
          summary: 'PersonaLab return visit registered.',
          topics: ['return-visit', 'persona-lab'],
          weight: 0.48,
        }))
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [dispatchPersonaCommand, labState.entityProfile])

  const handleLogoUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const inputElement = event.target
    const file = inputElement.files?.[0]
    if (!file) {
      return
    }

    const fileFormat = detectSupportedLogoFileFormat(file)
    if (!fileFormat) {
      setLogoUploadNotice({
        tone: 'error',
        title: 'Arquivo não suportado',
        message: `Use SVG, PNG ou JPG/JPEG. O arquivo ${file.name} chegou com um formato que o Persona Lab não reconheceu.`,
      })
      inputElement.value = ''
      return
    }

    setLogoUploadNotice(null)
    setIsExtractingPalette(true)

    try {
      const rawSource = await readFileAsDataUrl(file)
      if (!rawSource) {
        throw new Error('Arquivo sem conteúdo legível.')
      }

      setLabState((currentState) =>
        applyLogoExtraction(currentState, {
          logoFile: file,
          logoPreview: rawSource,
          logoMask: undefined,
          coreSymbol: undefined,
          coreSymbolDebug: undefined,
          shapeSource: undefined,
        }),
      )

      let previewSource = rawSource
      let shapeInputSource = rawSource
      let svgNormalized = fileFormat !== 'svg'

      if (fileFormat === 'svg') {
        try {
          const normalizedSvgAsset = await normalizeSvgAssetForPersonaLab(rawSource)
          if (normalizedSvgAsset) {
            svgNormalized = true
            previewSource = normalizedSvgAsset.rasterPreviewDataUrl || rawSource
            shapeInputSource = normalizedSvgAsset.normalizedSvgDataUrl || rawSource

            if (previewSource !== rawSource) {
              setLabState((currentState) =>
                applyLogoExtraction(currentState, {
                  logoFile: file,
                  logoPreview: previewSource,
                }),
              )
            }
          }
        } catch (error) {
          console.error('Persona Lab SVG normalization failed.', error)
        }
      }

      const [visualEssenceResult, logoMaskResult] = await Promise.allSettled([
        analyzeVisualEssence(previewSource),
        extractLogoMask({ file, imageSource: shapeInputSource }),
      ])

      const visualFallback = visualEssenceResult.status === 'rejected'
      if (visualEssenceResult.status === 'rejected') {
        console.error('Persona Lab visual essence analysis failed.', visualEssenceResult.reason)
      }
      if (logoMaskResult.status === 'rejected') {
        console.error('Persona Lab logo mask extraction failed.', logoMaskResult.reason)
      }

      const visualEssence = visualEssenceResult.status === 'fulfilled'
        ? visualEssenceResult.value
        : buildFallbackVisualEssence()
      const logoMask = logoMaskResult.status === 'fulfilled' ? logoMaskResult.value : undefined

      let coreSymbolSelection:
        | Awaited<ReturnType<typeof extractCoreSymbol>>
        | undefined
      let coreSymbolFailed = false

      if (logoMask) {
        try {
          coreSymbolSelection = await extractCoreSymbol({ maskSource: logoMask })
        } catch (error) {
          coreSymbolFailed = true
          console.error('Persona Lab core symbol extraction failed.', error)
        }
      }

      let shapeSource: ExtractedShapeSource | undefined
      let shapeFailed = false
      try {
        shapeSource = await extractShapeSource({
          file,
          imageSource: fileFormat === 'svg' ? shapeInputSource : logoMask ?? previewSource,
        })
        shapeFailed = !shapeSource
      } catch (error) {
        shapeFailed = true
        console.error('Persona Lab shape extraction failed.', error)
      }

      const warnings = buildUploadWarnings({
        fileFormat,
        svgNormalized,
        visualFallback,
        logoMaskFailed: !logoMask,
        coreSymbolFailed,
        shapeFailed,
      })

      setLabState((currentState) =>
        applyLogoExtraction(currentState, {
          logoFile: file,
          logoPreview: previewSource,
          logoMask,
          coreSymbol: coreSymbolSelection?.symbolSource,
          coreSymbolDebug: coreSymbolSelection?.debug,
          shapeSource,
          visualEssence,
          palette: {
            primary: visualEssence.primaryColor,
            secondary: visualEssence.secondaryColor,
            contrast: visualEssence.contrast,
          },
        }),
      )

      setLogoUploadNotice(
        warnings.length > 0
          ? {
              tone: 'warning',
              title: shapeSource
                ? `${formatLogoFormatLabel(fileFormat)} aceito com fallback parcial`
                : `${formatLogoFormatLabel(fileFormat)} aceito em modo degradado`,
              message: warnings.join(' '),
            }
          : null,
      )
      setStage('manifestation')
    } catch (error) {
      console.error('Persona Lab logo upload failed.', error)
      setLogoUploadNotice({
        tone: 'error',
        title: 'Não foi possível ler o arquivo',
        message: 'O arquivo foi selecionado, mas o navegador não conseguiu abrir uma prévia válida. Tente exportar novamente em SVG, PNG ou JPG.',
      })
    } finally {
      setIsExtractingPalette(false)
      inputElement.value = ''
    }
  }, [])

  const handleManifestationModeChange = useCallback((value: ManifestationMode) => {
    setLabState((currentState) => selectManifestationMode(currentState, value))
    setStage('variant')
  }, [])

  const handleManifestationVariantChange = useCallback(async (variantId: string) => {
    const nextStateSnapshot = selectManifestationVariant(labState, variantId)
    setLabState(nextStateSnapshot)

    const entityResponse = await personaEngineApi.createEntity(
      mapPersonaLabStateToBackendEntityRequest({
        state: nextStateSnapshot,
        ownerId,
      }),
    )

    if (entityResponse.status === 'ready' && entityResponse.entity) {
      const entityProfile = entityResponse.entity
      hydratedEntityIdRef.current = entityProfile.id
      setLabState((currentState) => hydrateStateFromEntityProfile(currentState, entityProfile))
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PERSONA_ENTITY_STORAGE_KEY, entityProfile.id)
      }
      setStage('fusion')
      return
    }

    clearPersistedPersonaEntityId()
  }, [labState, ownerId])

  const handleStartBirth = useCallback(() => {
    if (!selectedPreview) {
      return
    }
    setBirthState('building')
    setBirthMessageIndex(0)
    dispatchPersonaCommand(createOrchestratorCommand('start_birth'))
    setStage('birth')
  }, [dispatchPersonaCommand, selectedPreview])

  const handleRestart = useCallback(() => {
    setLabState(initialLabState)
    setIsExtractingPalette(false)
    setBirthState('building')
    setBirthMessageIndex(0)
    setLogoUploadNotice(null)
    setExportingFormat(null)
    setIsExportingRuntimeScene(false)
    setRuntimeSceneExporter(null)
    setOrchestratorCommand(undefined)
    if (typeof window !== 'undefined') {
      clearPersistedPersonaEntityId()
    }
    hydratedEntityIdRef.current = null
    restoreRequestEntityIdRef.current = null
    setStage('upload')
  }, [])

  const handleDownloadSocialAsset = useCallback(async (format: SocialOutputFormat) => {
    if (!selectedPreview || !labState.finalPersona || !labState.entityProfile) {
      return
    }

    setExportingFormat(format)
    dispatchPersonaCommand(createOrchestratorCommand('trigger_export', {
      exportFormat: format,
      summary: `Social ${format} export requested.`,
      topics: ['social-export', format],
      weight: 0.54,
    }))
    try {
      const assetBlob = await downloadSocialAsset({
        preview: selectedPreview,
        finalPersona: labState.finalPersona,
        format,
        entityProfile: labState.entityProfile,
      })
      void publishExport({
        entity: labState.entityProfile,
        channel: 'link',
        exportFormat: mapSocialOutputToExportFormat(format),
        assetBlob,
        template: format === 'story' ? 'instagram_story' : 'instagram_post',
        source: 'social-output',
      })
    } finally {
      setExportingFormat(null)
    }
  }, [dispatchPersonaCommand, labState.entityProfile, labState.finalPersona, selectedPreview, socialOutputPreviews])

  const handleDownloadRuntimeScene = useCallback(async (format: SceneExportFormat = 'current') => {
    if (!runtimeSceneExporter || !labState.entityProfile) {
      return
    }

    setIsExportingRuntimeScene(true)
    dispatchPersonaCommand(createOrchestratorCommand('trigger_export', {
      exportFormat: format,
      summary: `Runtime ${format} export requested.`,
      topics: ['runtime-export', format],
      weight: 0.62,
    }))
    try {
      await runtimeSceneExporter(format)
      void publishExport({
        entity: labState.entityProfile,
        channel: 'link',
        exportFormat: mapSceneExportToEntityExportFormat(format),
        source: 'pixi-runtime',
      })
    } finally {
      setIsExportingRuntimeScene(false)
    }
  }, [dispatchPersonaCommand, labState.entityProfile, runtimeSceneExporter])

  const handleBirthPhaseChange = useCallback((phase: PersonaBirthState, stepIndex: number) => {
    setBirthState(phase)
    setBirthMessageIndex(stepIndex)
  }, [])

  const handleBirthComplete = useCallback(() => {
    if (!selectedPreview) {
      return
    }

    dispatchPersonaEvent({ name: 'birth.completed' })
    setLabState((currentState) => finalizePersona(currentState))
    setStage('final')
  }, [dispatchPersonaEvent, selectedPreview])

  return {
    stage,
    setStage,
    labState,
    setLabState,
    personaLabInput,
    selectedPreview,
    selectedManifestationMode,
    isExtractingPalette,
    birthState,
    birthMessageIndex,
    logoUploadNotice,
    exportingFormat,
    isExportingRuntimeScene,
    runtimeSceneExporter,
    orchestratorCommand,
    orchestratorFrame,
    flowMindEffects,
    setRuntimeSceneExporter,
    canContinueToFusion,
    birthMessages,
    fusionCopy,
    socialOutputConfigs,
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
    dispatchPersonaEvent,
    dismissFlowMindEffect,
  }
}
