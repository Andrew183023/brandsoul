import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'

import BrandInteractionList, { type BrandInteractionTurnMessage } from '../lib/components/BrandInteractionList'
import { buildApiUrl } from '../lib/api'
import Spark from '../lib/components/Spark'
import {
  brandInteractionPresets,
  type BrandInteractionPreset,
  type InteractionContext,
  type InteractionTurns,
} from '../lib/brandInteractionPresets'
import {
  loadBrandPersona,
  navigateTo,
  powerOptions,
  toneOptions,
  type BrandPersona,
  type PowerOption,
  type ToneOption,
} from '../lib/persona'
import { inferInteractionProfilePreview, type BusinessProfile } from '../lib/interactionProfilePreview'

type SparkState = 'idle' | 'thinking' | 'speaking'
type InteractionExecutionState = 'idle' | 'running' | 'done'

interface BrandInteractionMetadata {
  initiator_profile?: BusinessProfile
  receiver_profile?: BusinessProfile
}

interface InteractionPersonaConfig {
  brandName: string
  tone: ToneOption
  power: PowerOption
  businessDescription: string
}

interface BrandInteractionResponse {
  context: InteractionContext
  turns: number
  transcript: BrandInteractionTurnMessage[]
  metadata?: BrandInteractionMetadata
}

const interactionContextOptions: Array<{ value: InteractionContext; label: string; detail: string }> = [
  { value: 'parceria', label: 'Parceria', detail: 'Sinergia e valor mútuo' },
  { value: 'indicacao', label: 'Indicação', detail: 'Recomendação entre marcas' },
  { value: 'combo', label: 'Combo', detail: 'Oferta conjunta controlada' },
  { value: 'negociacao', label: 'Negociação', detail: 'Ajuste comercial direto' },
  { value: 'colaboracao', label: 'Colaboração', detail: 'Criação ou ativação em conjunto' },
]

const interactionTurnOptions: InteractionTurns[] = [2, 3, 4]

function getDefaultInteractionPersonas(savedPersona: BrandPersona | null) {
  return {
    initiator: {
      brandName: savedPersona?.brandName ?? 'BrandSoul Demo',
      tone: savedPersona?.tone ?? 'divertido',
      power: savedPersona?.power ?? 'atração',
      businessDescription: savedPersona?.businessDescription ?? '',
    } satisfies InteractionPersonaConfig,
    receiver: {
      brandName: 'Studio Prisma',
      tone: 'inteligente' as ToneOption,
      power: 'conexão' as PowerOption,
      businessDescription: 'Somos um estúdio de design de embalagens e identidade para marcas autorais de varejo e gastronomia.',
    } satisfies InteractionPersonaConfig,
  }
}

function interactionButtonLabel(turns: InteractionTurns) {
  return `${turns} turnos`
}

function interactionStatusCopy(isLoading: boolean) {
  return isLoading ? 'Estamos medindo o encaixe entre nós.' : 'Interação guiada por contexto e identidade.'
}

function playbackStatusCopy(executionState: InteractionExecutionState, isLoading: boolean) {
  if (isLoading) {
    return 'Estamos abrindo essa conversa.'
  }

  if (executionState === 'running') {
    return 'Estamos em troca ativa.'
  }

  if (executionState === 'done') {
    return 'Encerramos essa troca.'
  }

  return 'Estamos prontas para colocar essa troca em movimento.'
}

function interactionBusinessInsightCopy(interactionContext: InteractionContext) {
  const insightByContext: Record<InteractionContext, string> = {
    parceria: 'Esse cenário demonstra potencial de integração operacional entre marcas.',
    combo: 'Esse cenário mostra oportunidade de aumento de ticket médio com ofertas combinadas.',
    colaboracao: 'Esse cenário indica sinergia entre serviços complementares.',
    negociacao: 'Esse cenário demonstra dinâmica de negociação B2B entre empresas.',
    indicacao: 'Esse cenário evidencia potencial de aquisição de clientes via parceria.',
  }

  return insightByContext[interactionContext]
}

function getTurnDelay(turnIndex: number) {
  const delays = [820, 960, 780, 1080]
  return delays[turnIndex % delays.length]
}

function normalizeScenarioText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function tokenizeScenarioText(value: string) {
  return normalizeScenarioText(value)
    .toLowerCase()
    .split(/[^a-z0-9áàâãéèêíïóôõöúç]+/i)
    .filter(Boolean)
}

function containsScenarioKeyword(value: string, keywords: string[]) {
  const tokens = tokenizeScenarioText(value)
  return keywords.some((keyword) => tokens.includes(keyword))
}

function createScenarioSignature(
  initiatorConfig: InteractionPersonaConfig,
  receiverConfig: InteractionPersonaConfig,
  interactionContext: InteractionContext,
  interactionTurns: InteractionTurns,
) {
  return JSON.stringify({
    initiator: {
      brandName: normalizeScenarioText(initiatorConfig.brandName),
      tone: initiatorConfig.tone,
      power: initiatorConfig.power,
      businessDescription: normalizeScenarioText(initiatorConfig.businessDescription),
    },
    receiver: {
      brandName: normalizeScenarioText(receiverConfig.brandName),
      tone: receiverConfig.tone,
      power: receiverConfig.power,
      businessDescription: normalizeScenarioText(receiverConfig.businessDescription),
    },
    interactionContext,
    interactionTurns,
  })
}

function isSamePersonaConfig(currentPersona: InteractionPersonaConfig, presetPersona: BrandInteractionPreset['initiator']) {
  return (
    normalizeScenarioText(currentPersona.brandName) === normalizeScenarioText(presetPersona.brandName) &&
    currentPersona.tone === presetPersona.tone &&
    currentPersona.power === presetPersona.power &&
    normalizeScenarioText(currentPersona.businessDescription) === normalizeScenarioText(presetPersona.businessDescription)
  )
}

function isPresetStillApplied(
  initiatorConfig: InteractionPersonaConfig,
  receiverConfig: InteractionPersonaConfig,
  interactionContext: InteractionContext,
  interactionTurns: InteractionTurns,
  preset: BrandInteractionPreset,
) {
  return (
    interactionContext === preset.context &&
    interactionTurns === preset.turns &&
    isSamePersonaConfig(initiatorConfig, preset.initiator) &&
    isSamePersonaConfig(receiverConfig, preset.receiver)
  )
}

function formatBusinessProfile(profile?: BusinessProfile) {
  if (!profile) {
    return '—'
  }

  const businessTypeLabels = {
    service: 'serviço',
    product: 'produto',
    industry: 'indústria',
    unknown: 'negócio',
  }
  const sectorLabels = {
    food: 'alimentação',
    retail: 'varejo',
    health: 'saúde',
    tech: 'tecnologia',
    industrial: 'industrial',
    logistics: 'logística',
    general: 'geral',
  }
  const modelLabels = {
    b2c: 'B2C',
    b2b: 'B2B',
    hybrid: 'híbrido',
    unknown: 'flexível',
  }
  const complexityLabels = {
    low: 'baixa',
    medium: 'média',
    high: 'alta',
  }

  return [
    businessTypeLabels[profile.business_type],
    sectorLabels[profile.sector],
    modelLabels[profile.model],
    complexityLabels[profile.complexity],
  ].join(' / ')
}

function buildDescriptionDescriptor(description: string) {
  if (!description.trim()) {
    return null
  }

  if (containsScenarioKeyword(description, ['delivery', 'entrega', 'entregas', 'motoboy', 'logistica'])) {
    return 'uma operação de entrega'
  }

  if (containsScenarioKeyword(description, ['restaurante', 'gastronomia', 'cafe', 'cafeteria', 'hamburgueria', 'confeitaria', 'alimentacao'])) {
    return 'uma marca de alimentação'
  }

  if (containsScenarioKeyword(description, ['consultoria', 'consultor', 'consultores'])) {
    return 'uma consultoria'
  }

  if (containsScenarioKeyword(description, ['clinica', 'estetica', 'saude', 'odontologia'])) {
    return 'uma clínica'
  }

  if (containsScenarioKeyword(description, ['laboratorio', 'exames', 'diagnostico'])) {
    return 'um laboratório'
  }

  if (containsScenarioKeyword(description, ['saas', 'software', 'tecnologia', 'tech', 'plataforma', 'produto digital'])) {
    return 'uma empresa tech'
  }

  if (containsScenarioKeyword(description, ['agencia', 'design', 'branding', 'criativo', 'criativa', 'studio', 'estudio'])) {
    return 'um estúdio criativo'
  }

  if (containsScenarioKeyword(description, ['varejo', 'loja', 'ecommerce', 'moda'])) {
    return 'uma marca de varejo'
  }

  if (containsScenarioKeyword(description, ['industria', 'industrial', 'fabrica', 'manufatura'])) {
    return 'uma operação industrial'
  }

  if (containsScenarioKeyword(description, ['servico', 'servicos'])) {
    return 'uma operação de serviços'
  }

  return null
}

function buildProfileDescriptor(profile?: BusinessProfile) {
  if (!profile) {
    return null
  }

  if (profile.sector === 'food') {
    return 'uma marca de alimentação'
  }

  if (profile.sector === 'tech') {
    return profile.model === 'b2b' ? 'uma empresa tech' : 'uma marca tech'
  }

  if (profile.sector === 'health') {
    return profile.business_type === 'service' ? 'uma operação de saúde' : 'uma marca de saúde'
  }

  if (profile.sector === 'retail') {
    return 'uma marca de varejo'
  }

  if (profile.sector === 'industrial') {
    return 'uma operação industrial'
  }

  if (profile.sector === 'logistics') {
    return 'uma operação de entrega'
  }

  if (profile.model === 'b2b') {
    return 'uma empresa B2B'
  }

  if (profile.model === 'b2c') {
    return 'uma marca B2C'
  }

  if (profile.model === 'hybrid') {
    return 'uma operação híbrida'
  }

  return 'uma marca'
}

function buildScenarioActorDescriptor(description: string, profile?: BusinessProfile) {
  return buildDescriptionDescriptor(description) ?? buildProfileDescriptor(profile) ?? 'uma marca'
}

function buildScenarioActorsSummary(
  initiatorDescription: string,
  receiverDescription: string,
  initiatorProfile?: BusinessProfile,
  receiverProfile?: BusinessProfile,
) {
  if (
    initiatorProfile &&
    receiverProfile &&
    initiatorProfile.model === receiverProfile.model &&
    initiatorProfile.model !== 'unknown'
  ) {
    if (initiatorProfile.model === 'hybrid') {
      return 'Duas marcas híbridas'
    }

    return `Duas marcas ${initiatorProfile.model.toUpperCase()}`
  }

  const initiatorDescriptor = buildScenarioActorDescriptor(initiatorDescription, initiatorProfile)
  const receiverDescriptor = buildScenarioActorDescriptor(receiverDescription, receiverProfile)

  return `${initiatorDescriptor} e ${receiverDescriptor}`
}

function buildInteractionScenarioSummary(
  interactionContext: InteractionContext,
  interactionTurns: InteractionTurns,
  initiatorDescription: string,
  receiverDescription: string,
  initiatorProfile?: BusinessProfile,
  receiverProfile?: BusinessProfile,
) {
  const actorsSummary = buildScenarioActorsSummary(
    initiatorDescription,
    receiverDescription,
    initiatorProfile,
    receiverProfile,
  )

  return `${actorsSummary} em contexto de ${interactionContext}, com ${interactionTurns} turnos.`
}

export default function BrandInteractionPage() {
  const savedPersona = useMemo(() => loadBrandPersona(), [])
  const defaultPersonas = useMemo(() => getDefaultInteractionPersonas(savedPersona), [savedPersona])
  const [initiatorConfig, setInitiatorConfig] = useState<InteractionPersonaConfig>(defaultPersonas.initiator)
  const [receiverConfig, setReceiverConfig] = useState<InteractionPersonaConfig>(defaultPersonas.receiver)
  const [interactionContext, setInteractionContext] = useState<InteractionContext>('parceria')
  const [interactionTurns, setInteractionTurns] = useState<InteractionTurns>(2)
  const [interactionTranscript, setInteractionTranscript] = useState<BrandInteractionTurnMessage[]>([])
  const [visibleTranscript, setVisibleTranscript] = useState<BrandInteractionTurnMessage[]>([])
  const [interactionError, setInteractionError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [executionState, setExecutionState] = useState<InteractionExecutionState>('idle')
  const [activeSpeakerId, setActiveSpeakerId] = useState<'a' | 'b' | null>(null)
  const [activeTurnIndex, setActiveTurnIndex] = useState<number | null>(null)
  const [initiatorProfile, setInitiatorProfile] = useState<BusinessProfile | undefined>(undefined)
  const [receiverProfile, setReceiverProfile] = useState<BusinessProfile | undefined>(undefined)
  const [profileScenarioSignature, setProfileScenarioSignature] = useState<string | null>(null)
  const playbackTimeoutRef = useRef<number | null>(null)
  const requestIdRef = useRef(0)

  const lastInteractionSpeaker = activeSpeakerId ?? visibleTranscript[visibleTranscript.length - 1]?.speaker_id ?? null
  const interactionContextLabel =
    interactionContextOptions.find((option) => option.value === interactionContext)?.label ?? interactionContext
  const isRunningPlayback = executionState === 'running'
  const isSimulationBusy = isLoading || isRunningPlayback
  const currentScenarioSignature = useMemo(
    () => createScenarioSignature(initiatorConfig, receiverConfig, interactionContext, interactionTurns),
    [initiatorConfig, interactionContext, interactionTurns, receiverConfig],
  )
  const hasCurrentScenarioProfiles = profileScenarioSignature === currentScenarioSignature
  const initiatorPreviewProfile = useMemo(
    () => inferInteractionProfilePreview(initiatorConfig.businessDescription),
    [initiatorConfig.businessDescription],
  )
  const receiverPreviewProfile = useMemo(
    () => inferInteractionProfilePreview(receiverConfig.businessDescription),
    [receiverConfig.businessDescription],
  )
  const currentInitiatorProfile = hasCurrentScenarioProfiles ? initiatorProfile : undefined
  const currentReceiverProfile = hasCurrentScenarioProfiles ? receiverProfile : undefined
  const displayedInitiatorProfile = currentInitiatorProfile ?? initiatorPreviewProfile
  const displayedReceiverProfile = currentReceiverProfile ?? receiverPreviewProfile
  const activePresetId = useMemo(
    () =>
      brandInteractionPresets.find((preset) =>
        isPresetStillApplied(initiatorConfig, receiverConfig, interactionContext, interactionTurns, preset),
      )?.id ?? null,
    [initiatorConfig, interactionContext, interactionTurns, receiverConfig],
  )
  const interactionScenarioSummary = useMemo(
    () =>
      buildInteractionScenarioSummary(
        interactionContext,
        interactionTurns,
        initiatorConfig.businessDescription,
        receiverConfig.businessDescription,
        displayedInitiatorProfile,
        displayedReceiverProfile,
      ),
    [
      displayedInitiatorProfile,
      displayedReceiverProfile,
      initiatorConfig.businessDescription,
      interactionContext,
      interactionTurns,
      receiverConfig.businessDescription,
    ],
  )

  useEffect(() => {
    return () => {
      if (playbackTimeoutRef.current) {
        window.clearTimeout(playbackTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (executionState !== 'running') {
      return
    }

    if (visibleTranscript.length >= interactionTranscript.length) {
      setExecutionState(interactionTranscript.length > 0 ? 'done' : 'idle')
      setActiveSpeakerId(null)
      setActiveTurnIndex(null)
      return
    }

    const nextTurnIndex = visibleTranscript.length
    const nextTurn = interactionTranscript[nextTurnIndex]

    playbackTimeoutRef.current = window.setTimeout(() => {
      setActiveSpeakerId(nextTurn.speaker_id)
      setActiveTurnIndex(nextTurnIndex)
      setVisibleTranscript((currentTranscript) => [...currentTranscript, nextTurn])
    }, getTurnDelay(nextTurnIndex))

    return () => {
      if (playbackTimeoutRef.current) {
        window.clearTimeout(playbackTimeoutRef.current)
      }
    }
  }, [executionState, interactionTranscript, visibleTranscript.length])

  const buildInteractionPersonaPayload = (persona: InteractionPersonaConfig) => ({
    tone: persona.tone,
    power: persona.power,
    business_description: persona.businessDescription.trim() || undefined,
  })

  const resetInteractionState = () => {
    if (playbackTimeoutRef.current) {
      window.clearTimeout(playbackTimeoutRef.current)
    }

    setInteractionTranscript([])
    setVisibleTranscript([])
    setInteractionError('')
    setIsLoading(false)
    setExecutionState('idle')
    setActiveSpeakerId(null)
    setActiveTurnIndex(null)
    setInitiatorProfile(undefined)
    setReceiverProfile(undefined)
    setProfileScenarioSignature(null)
  }

  const invalidateActiveInteraction = () => {
    requestIdRef.current += 1
    resetInteractionState()
  }

  const updateInteractionContext = (nextContext: InteractionContext) => {
    if (nextContext === interactionContext) {
      return
    }

    if (isLoading || executionState === 'running') {
      invalidateActiveInteraction()
    }

    setInteractionContext(nextContext)
  }

  const updateInteractionTurns = (nextTurns: InteractionTurns) => {
    if (nextTurns === interactionTurns) {
      return
    }

    if (isLoading || executionState === 'running') {
      invalidateActiveInteraction()
    }

    setInteractionTurns(nextTurns)
  }

  const runInteractionSimulation = async () => {
    if (isSimulationBusy) {
      return
    }

    if (!initiatorConfig.brandName.trim() || !receiverConfig.brandName.trim()) {
      setInteractionError('Preciso que nos duas tenhamos nome antes de entrar em cena.')
      return
    }

    setIsLoading(true)
    setInteractionError('')
    setExecutionState('idle')
    setActiveSpeakerId(null)
    setActiveTurnIndex(null)
    setInitiatorProfile(undefined)
    setReceiverProfile(undefined)
    setProfileScenarioSignature(null)

    requestIdRef.current += 1
    const requestId = requestIdRef.current

    resetInteractionState()

    try {
      const result = await axios.post<BrandInteractionResponse>(buildApiUrl('/interaction/simulate'), {
        initiator: {
          brand_name: initiatorConfig.brandName.trim(),
          persona: buildInteractionPersonaPayload(initiatorConfig),
        },
        receiver: {
          brand_name: receiverConfig.brandName.trim(),
          persona: buildInteractionPersonaPayload(receiverConfig),
        },
        context: interactionContext,
        turns: interactionTurns,
      })

      if (requestIdRef.current !== requestId) {
        return
      }

      setInteractionTranscript(result.data.transcript)
      setVisibleTranscript([])
      setExecutionState(result.data.transcript.length > 0 ? 'running' : 'idle')
      setInitiatorProfile(result.data.metadata?.initiator_profile)
      setReceiverProfile(result.data.metadata?.receiver_profile)
      setProfileScenarioSignature(currentScenarioSignature)
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return
      }

      console.error(error)
      setInteractionError('Perdemos o fio dessa troca por um instante. Se você rodar de novo, eu retomo.')
      setInteractionTranscript([])
      setVisibleTranscript([])
      setExecutionState('idle')
      setActiveSpeakerId(null)
      setActiveTurnIndex(null)
      setInitiatorProfile(undefined)
      setReceiverProfile(undefined)
      setProfileScenarioSignature(null)
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }

  const clearSimulation = () => {
    invalidateActiveInteraction()
  }

  const applyPreset = (preset: BrandInteractionPreset) => {
    requestIdRef.current += 1
    resetInteractionState()

    setInitiatorConfig({ ...preset.initiator })
    setReceiverConfig({ ...preset.receiver })
    setInteractionContext(preset.context)
    setInteractionTurns(preset.turns)
  }

  const updateInteractionPersona = (
    side: 'initiator' | 'receiver',
    field: keyof InteractionPersonaConfig,
    value: string,
  ) => {
    const updateState = side === 'initiator' ? setInitiatorConfig : setReceiverConfig
    updateState((currentValue) => ({ ...currentValue, [field]: value }))
  }

  const renderInteractionPersonaEditor = (
    side: 'initiator' | 'receiver',
    label: string,
    persona: InteractionPersonaConfig,
  ) => (
    <div className="interaction-config-card">
      <div className="interaction-config-header">
        <span className="interaction-config-label">{label}</span>
        <strong>{persona.brandName.trim() || 'Sem nome'}</strong>
      </div>

      <label className="persona-field">
        <span className="persona-label">Nome da marca</span>
        <input
          className="persona-input"
          value={persona.brandName}
          onChange={(event) => updateInteractionPersona(side, 'brandName', event.target.value)}
          placeholder="Nome da marca"
        />
      </label>

      <div className="interaction-inline-grid">
        <label className="persona-field">
          <span className="persona-label">Tone</span>
          <select
            className="persona-input interaction-select"
            value={persona.tone}
            onChange={(event) => updateInteractionPersona(side, 'tone', event.target.value)}
          >
            {toneOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="persona-field">
          <span className="persona-label">Power</span>
          <select
            className="persona-input interaction-select"
            value={persona.power}
            onChange={(event) => updateInteractionPersona(side, 'power', event.target.value)}
          >
            {powerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="persona-field">
        <span className="persona-label">Descrição do negócio</span>
        <textarea
          className="persona-input persona-textarea"
          value={persona.businessDescription}
          onChange={(event) => updateInteractionPersona(side, 'businessDescription', event.target.value)}
          placeholder="Descreva de forma breve o negócio, o setor e o posicionamento."
        />
      </label>
    </div>
  )

  const initiatorSparkState: SparkState = isLoading ? 'thinking' : lastInteractionSpeaker === 'a' ? 'speaking' : 'idle'
  const receiverSparkState: SparkState = isLoading ? 'thinking' : lastInteractionSpeaker === 'b' ? 'speaking' : 'idle'

  return (
    <main className="app-shell interaction-page-shell">
      <section className="identity-panel interaction-page-identity">
        <div className="identity-copy">
          <div className="eyebrow">BrandSoul Simulation</div>
          <h1>Duas Centelhas em interação controlada.</h1>
          <p className="hero-copy">
            Uma página dedicada para validar interação coerente entre marcas sem comprimir tudo no simulador principal.
          </p>
        </div>

        <div className="interaction-hero-chips" aria-label="Contexto atual da simulação">
          <div className="identity-chip brand">
            <span className="identity-chip-label">Contexto</span>
            <strong>{interactionContextLabel}</strong>
          </div>
          <div className="identity-chip">
            <span className="identity-chip-label">Turnos</span>
            <strong>{interactionTurns}</strong>
          </div>
          <div className="identity-chip">
            <span className="identity-chip-label">Modo</span>
            <strong>Marca ↔ Marca</strong>
          </div>
        </div>

        <div className="interaction-stage interaction-stage-page">
          <article className={`interaction-spark-card ${lastInteractionSpeaker === 'a' ? 'active-speaking' : ''}`}>
            <div className="interaction-spark-meta">
              <span className="interaction-spark-label">Centelha A</span>
              <strong>{initiatorConfig.brandName || 'Marca A'}</strong>
              <span>
                {initiatorConfig.tone} · {initiatorConfig.power}
              </span>
            </div>
            <div className="interaction-spark-shell">
              <div className="interaction-spark-stage">
                <div className="interaction-spark-orbit">
                  <Spark state={initiatorSparkState} tone={initiatorConfig.tone} power={initiatorConfig.power} />
                </div>
              </div>
            </div>
            {initiatorConfig.businessDescription.trim() ? (
              <p className="interaction-spark-description">{initiatorConfig.businessDescription.trim()}</p>
            ) : null}
          </article>

          <div className="interaction-spark-bridge interaction-spark-bridge-page">
            <span className={`spark-status-dot ${isLoading ? 'thinking' : 'speaking'}`} />
            <strong>{interactionContextLabel}</strong>
            <span>{interactionStatusCopy(isLoading)}</span>
            <span className={`interaction-run-state ${executionState}`}>{playbackStatusCopy(executionState, isLoading)}</span>
          </div>

          <article className={`interaction-spark-card ${lastInteractionSpeaker === 'b' ? 'active-speaking' : ''}`}>
            <div className="interaction-spark-meta">
              <span className="interaction-spark-label">Centelha B</span>
              <strong>{receiverConfig.brandName || 'Marca B'}</strong>
              <span>
                {receiverConfig.tone} · {receiverConfig.power}
              </span>
            </div>
            <div className="interaction-spark-shell">
              <div className="interaction-spark-stage">
                <div className="interaction-spark-orbit">
                  <Spark state={receiverSparkState} tone={receiverConfig.tone} power={receiverConfig.power} />
                </div>
              </div>
            </div>
            {receiverConfig.businessDescription.trim() ? (
              <p className="interaction-spark-description">{receiverConfig.businessDescription.trim()}</p>
            ) : null}
          </article>
        </div>

        <div className="interaction-page-actions">
          <button type="button" className="chat-header-button subtle" onClick={() => navigateTo('/')}>
            Voltar ao simulador principal
          </button>
          <button type="button" className="chat-header-button" onClick={() => navigateTo('/create')}>
            Editar Centelha base
          </button>
        </div>
      </section>

      <section className="chat-card interaction-page-card">
        <header className="chat-card-header">
          <div className="chat-card-header-main">
            <div className="chat-card-title">Centelha ↔ Centelha</div>
            <div className="chat-card-subtitle">Uma tela própria para configurar, rodar e observar a simulação.</div>
          </div>

          <div className="channel-selector-panel">
            <div className="channel-selector-copy">
              <span className="channel-selector-label">Presets de demo</span>
              <span className="channel-selector-subtitle">Carregue pares de marcas prontos e depois ajuste os campos livremente.</span>
            </div>

            <div className="interaction-preset-grid" aria-label="Presets de interação entre marcas">
              {brandInteractionPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`interaction-preset-card ${activePresetId === preset.id ? 'active' : ''}`}
                  onClick={() => applyPreset(preset)}
                >
                  <span className="interaction-preset-name">{preset.name}</span>
                  <span className="interaction-preset-description">{preset.description}</span>
                  <span className="interaction-preset-meta">
                    {preset.context} · {preset.turns} turnos
                  </span>
                </button>
              ))}
            </div>

            <div className="channel-selector-copy">
              <span className="channel-selector-label">Contexto da interação</span>
              <span className="channel-selector-subtitle">Escolha um enquadramento claro para a troca entre marcas.</span>
            </div>

            <div className="interaction-context-grid">
              {interactionContextOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`interaction-context-button ${option.value === interactionContext ? 'active' : ''}`}
                  onClick={() => updateInteractionContext(option.value)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.detail}</span>
                </button>
              ))}
            </div>

            <div className="interaction-turns-row" aria-label="Quantidade de turnos">
              {interactionTurnOptions.map((turnOption) => (
                <button
                  key={turnOption}
                  type="button"
                  className={`interaction-turn-button ${turnOption === interactionTurns ? 'active' : ''}`}
                  onClick={() => updateInteractionTurns(turnOption)}
                >
                  {interactionButtonLabel(turnOption)}
                </button>
              ))}
            </div>

            <div className="interaction-config-grid">
              {renderInteractionPersonaEditor('initiator', 'Centelha A', initiatorConfig)}
              {renderInteractionPersonaEditor('receiver', 'Centelha B', receiverConfig)}
            </div>

            {interactionError ? <p className="interaction-error">{interactionError}</p> : null}
          </div>

          <div className="chat-session-header">
            <div className="chat-session-meta">
              <span className="chat-session-brand">{initiatorConfig.brandName || 'Marca A'}</span>
              <span className="chat-session-chip">↔</span>
              <span className="chat-session-brand">{receiverConfig.brandName || 'Marca B'}</span>
              <span className="chat-session-chip">Contexto: {interactionContextLabel}</span>
              <span className="chat-session-chip">Turnos: {interactionTurns}</span>
              <span className={`chat-session-chip interaction-state-chip ${executionState}`}>{playbackStatusCopy(executionState, isLoading)}</span>
            </div>

            <p className="interaction-scenario-summary">{interactionScenarioSummary}</p>

            <div className="chat-session-actions">
              <button type="button" className="chat-header-button subtle" onClick={clearSimulation}>
                Limpar simulação
              </button>
              <button type="button" className="chat-header-button" onClick={runInteractionSimulation} disabled={isSimulationBusy}>
                {isLoading ? 'Preparando...' : isRunningPlayback ? 'Interação em curso' : 'Simular interação'}
              </button>
            </div>
          </div>

          {displayedInitiatorProfile || displayedReceiverProfile ? (
            <div className="interaction-profile-insights" aria-label="Perfis inferidos das marcas">
              {displayedInitiatorProfile ? (
                <div className="interaction-profile-chip">
                  <span className="interaction-profile-label">Perfil A</span>
                  <strong className="interaction-profile-value">{formatBusinessProfile(displayedInitiatorProfile)}</strong>
                </div>
              ) : null}
              {displayedReceiverProfile ? (
                <div className="interaction-profile-chip">
                  <span className="interaction-profile-label">Perfil B</span>
                  <strong className="interaction-profile-value">{formatBusinessProfile(displayedReceiverProfile)}</strong>
                </div>
              ) : null}
            </div>
          ) : null}
        </header>

        <section className="chat-panel">
          <BrandInteractionList
            transcript={visibleTranscript}
            currentTurnIndex={activeTurnIndex}
            executionState={executionState}
          />
        </section>

        <div className="interaction-business-insight" aria-label="Insight de negócio da simulação">
          <span className="interaction-business-insight-label">Leitura de valor</span>
          <p>{interactionBusinessInsightCopy(interactionContext)}</p>
        </div>

        <div className="interaction-footer-note">
          <span>Fluxo controlado, sem timeline social, sem banco e sem integracoes externas.</span>
        </div>
      </section>
    </main>
  )
}
