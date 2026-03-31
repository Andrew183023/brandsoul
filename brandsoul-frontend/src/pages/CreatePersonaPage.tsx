import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'

import brandsoulLogo from '../assets/brandsoul-logo-original.jpeg'
import HintBox from '../lib/components/HintBox'
import Spark from '../lib/components/Spark'
import {
  actModeOptions,
  BUSINESS_DESCRIPTION_MAX_LENGTH,
  businessGoalOptions,
  loadBrandPersona,
  navigateTo,
  powerOptions,
  saveBrandPersona,
  toneOptions,
  type ActModeOption,
  type BusinessGoalOption,
  type PowerOption,
  type ToneOption,
  type VoiceStyleOption,
  voiceStyleOptions,
} from '../lib/persona'
import { isAuthenticated } from '../lib/session'
import '../App.css'

function buildVoiceStylePreview(voiceStyle: VoiceStyleOption) {
  switch (voiceStyle) {
    case 'soft':
      return 'Oi, eu sou a sua marca falando com calma, cuidado e presença.'
    case 'strong':
      return 'Cheguei. Posso resolver isso com você de forma rápida e clara.'
    case 'adaptive':
      return 'Eu me ajusto a conversa para te responder do melhor jeito.'
    case 'irreverent':
      return 'Cheguei. E prometo não ser uma conversa sem graça.'
    default:
      return 'Estou aqui para te atender com clareza e presença.'
  }
}

function playActivationChime() {
  const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) {
    return
  }

  const audioContext = new AudioContextConstructor()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(392, audioContext.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(523.25, audioContext.currentTime + 0.14)
  gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.025, audioContext.currentTime + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18)

  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)
  oscillator.start()
  oscillator.stop(audioContext.currentTime + 0.18)

  window.setTimeout(() => {
    void audioContext.close().catch(() => undefined)
  }, 260)
}

export default function CreatePersonaPage() {
  const savedPersona = useMemo(() => loadBrandPersona(), [])
  const [brandName, setBrandName] = useState(savedPersona?.brandName ?? '')
  const [businessDescription, setBusinessDescription] = useState(savedPersona?.businessDescription ?? '')
  const [tone, setTone] = useState<ToneOption | null>(savedPersona?.tone ?? null)
  const [power, setPower] = useState<PowerOption | null>(savedPersona?.power ?? null)
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyleOption>(savedPersona?.voiceStyle ?? 'balanced')
  const [actMode, setActMode] = useState<ActModeOption>(savedPersona?.actMode ?? 'seller')
  const [businessGoal, setBusinessGoal] = useState<BusinessGoalOption>(savedPersona?.businessGoal ?? 'volume')
  const [errorMessage, setErrorMessage] = useState('')
  const [isActivating, setIsActivating] = useState(false)

  const isReady = Boolean(brandName.trim() && tone && power)
  const hasActiveSession = useMemo(() => isAuthenticated(), [])
  const sparkTone = useMemo(() => tone ?? 'divertido', [tone])
  const sparkPower = useMemo(() => power ?? 'atração', [power])
  const businessDescriptionLength = businessDescription.trim().length
  const voiceStylePreview = useMemo(() => buildVoiceStylePreview(voiceStyle), [voiceStyle])

  const handleCreatePersona = async () => {
    const trimmedBrandName = brandName.trim()
    if (!trimmedBrandName || !tone || !power) {
      setErrorMessage('Preencha o nome da marca e escolha a personalidade e a energia.')
      return
    }

    setIsActivating(true)
    try {
      playActivationChime()
    } catch {
      // The visual pulse remains active if audio is blocked.
    }

    saveBrandPersona({
      brandName: trimmedBrandName,
      logo: savedPersona?.logo,
      tone,
      power,
      businessModel: savedPersona?.businessModel,
      brandType: savedPersona?.brandType,
      features: savedPersona?.features,
      voiceStyle,
      actMode,
      businessGoal,
      modes: savedPersona?.modes,
      emergencyType: savedPersona?.emergencyType,
      businessDescription: businessDescription.trim() || undefined,
      institutionalImage: savedPersona?.institutionalImage,
      theme: savedPersona?.theme,
      pageSections: savedPersona?.pageSections,
      carouselImages: savedPersona?.carouselImages,
      openingHours: savedPersona?.openingHours,
      address: savedPersona?.address,
      city: savedPersona?.city,
      state: savedPersona?.state,
      deliveryAvailable: savedPersona?.deliveryAvailable,
      businessHours: savedPersona?.businessHours,
      serviceRegion: savedPersona?.serviceRegion,
      brandHighlight: savedPersona?.brandHighlight,
      whatsapp: savedPersona?.whatsapp,
      email: savedPersona?.email,
      instagram: savedPersona?.instagram,
      facebook: savedPersona?.facebook,
      tiktok: savedPersona?.tiktok,
      site: savedPersona?.site,
      contactInfo: savedPersona?.contactInfo,
      serviceOffers: savedPersona?.serviceOffers,
      schedulingConfig: savedPersona?.schedulingConfig,
      professionalData: savedPersona?.professionalData,
    })

    window.setTimeout(() => {
      navigateTo('/admin')
    }, 320)
  }

  return (
    <main className="persona-page-shell">
      <motion.section
        className="persona-page-panel"
        initial={{ opacity: 0, scale: 0.98, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <div className="persona-top-actions">
          <button type="button" className="chat-header-button subtle" onClick={() => navigateTo(hasActiveSession ? '/admin' : '/login')}>
            {hasActiveSession ? 'Ir para painel' : 'Entrar'}
          </button>
        </div>

        <div className="persona-copy-block">
          <div className="brandsoul-hero-logo">
            <img src={brandsoulLogo} alt="BrandSoul" className="brandsoul-logo brandsoul-logo--hero" />
          </div>
          <div className="eyebrow">Nascimento da Centelha</div>
          <h1 className="persona-title">
            A sua marca não precisa só de presença.
            <br />
            Ela precisa de uma alma.
          </h1>
          <p className="persona-subtitle">Crie a Centelha que vai dar vida, ritmo e voz própria para a sua marca.</p>
        </div>

        <div className={`persona-spark-wrap ${isActivating ? 'persona-spark-wrap-activating' : ''}`}>
          <Spark state="idle" tone={sparkTone} power={sparkPower} />
        </div>

        <div className="persona-experience-form">
          <HintBox
            icon="✨"
            title="O que é isso?"
            description="Sua marca pode conversar com clientes com contexto, estilo e personalidade própria."
            example="Você define a base agora. A comunicação vai ficando mais precisa ao longo do uso."
          />

          <div className="persona-field">
            <label className="persona-label" htmlFor="brandName">
              Nome da marca
            </label>
            <input
              id="brandName"
              className="persona-input"
              value={brandName}
              onChange={(event) => {
                setBrandName(event.target.value)
                if (errorMessage) {
                  setErrorMessage('')
                }
              }}
              placeholder="Como sua marca se chama?"
              autoComplete="off"
            />
          </div>

          <div className="persona-field">
            <label className="persona-label" htmlFor="businessDescription">
              O que a sua marca faz?
            </label>
            <HintBox
              compact
              icon="🏪"
              title="Sobre sua empresa"
              description="Explique em poucas palavras o que sua marca faz. Isso ajuda a Centelha a responder com mais contexto e naturalidade."
            />
            <textarea
              id="businessDescription"
              className="persona-input persona-textarea"
              value={businessDescription}
              onChange={(event) => setBusinessDescription(event.target.value.slice(0, BUSINESS_DESCRIPTION_MAX_LENGTH))}
              placeholder="Em uma frase curta, me conta o que você faz e o que faz sua marca ter presença."
              rows={3}
              maxLength={BUSINESS_DESCRIPTION_MAX_LENGTH}
            />
            <div className="persona-field-meta" aria-live="polite">
              <span className="persona-field-hint">Esse contexto ja deixa a Centelha mais viva desde a primeira resposta.</span>
              <span className="persona-counter">
                {businessDescriptionLength}/{BUSINESS_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          </div>

          <div className="persona-field">
            <div className="persona-label">Personalidade</div>
            <HintBox
              compact
              icon="💬"
              title="Como sua marca fala"
              description="Define a personalidade da sua marca ao conversar com clientes. Ex.: mais divertida, séria ou ousada."
            />
            <div className="persona-chip-grid">
              {toneOptions.map((option) => {
                const isSelected = tone === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`persona-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setTone(option.value)
                      if (errorMessage) {
                        setErrorMessage('')
                      }
                    }}
                  >
                    <span>{option.label}</span>
                    <strong>{option.emoji}</strong>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="persona-field">
            <div className="persona-label">Energia</div>
            <HintBox
              compact
              icon="⚡"
              title="Como sua marca impacta"
              description="Mostra como sua comunicação influencia o cliente: atrair, conectar, acelerar ou trazer clareza."
            />
            <div className="persona-chip-grid">
              {powerOptions.map((option) => {
                const isSelected = power === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`persona-chip ${isSelected ? 'selected power' : 'power'}`}
                    onClick={() => {
                      setPower(option.value)
                      if (errorMessage) {
                        setErrorMessage('')
                      }
                    }}
                  >
                    <span>{option.label}</span>
                    <strong>{option.emoji}</strong>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="persona-field">
            <div className="persona-label">Como eu me comunico</div>
            <HintBox
              compact
              icon="🎙️"
              title="Forma de se comunicar"
              description="Ajusta como a marca responde: de forma mais suave, forte, equilibrada ou adaptativa."
            />
            <div className="persona-style-grid">
              {voiceStyleOptions.map((option) => {
                const isSelected = voiceStyle === option.value

                return (
                  <button key={option.value} type="button" className={`persona-style-card ${isSelected ? 'selected' : ''}`} onClick={() => setVoiceStyle(option.value)}>
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                )
              })}
            </div>
            {voiceStyle === 'irreverent' ? (
              <div className="persona-voice-warning">Esse estilo usa humor e uma linguagem mais ousada. Ative apenas se isso fizer sentido para sua marca.</div>
            ) : null}
          </div>

          <div className="persona-field">
            <div className="persona-label">Como eu atuo com seus clientes</div>
            <HintBox
              compact
              icon="🧠"
              title="Como sua marca ajuda"
              description="Define como a marca age durante a conversa: como vendedora, consultora, estilista, coach ou especialista."
            />
            <div className="persona-style-grid">
              {actModeOptions.map((option) => {
                const isSelected = actMode === option.value

                return (
                  <button key={option.value} type="button" className={`persona-style-card ${isSelected ? 'selected' : ''}`} onClick={() => setActMode(option.value)}>
                    <strong>
                      {option.emoji} {option.label}
                    </strong>
                    <span>{option.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="persona-field">
            <div className="persona-label">Objetivo do negócio agora</div>
            <HintBox
              compact
              icon="🎯"
              title="Foco principal agora"
              description="Ajuda a IA a entender o que sua marca quer priorizar: vender mais, aumentar ticket, girar estoque ou destacar novidades."
            />
            <div className="persona-style-grid">
              {businessGoalOptions.map((option) => {
                const isSelected = businessGoal === option.value

                return (
                  <button key={option.value} type="button" className={`persona-style-card ${isSelected ? 'selected' : ''}`} onClick={() => setBusinessGoal(option.value)}>
                    <strong>
                      {option.emoji} {option.label}
                    </strong>
                    <span>{option.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="persona-preview-card" aria-live="polite">
            <span className="persona-preview-label">Preview vivo</span>
            <p className="persona-preview-text">{voiceStylePreview}</p>
          </div>

          <div className="persona-action-row">
            <button type="button" className="persona-submit" onClick={handleCreatePersona} disabled={!isReady || isActivating}>
              {isActivating ? 'Dando vida à minha Centelha...' : 'Criar minha Centelha'}
            </button>

            <div className="persona-secondary-action">
              <span>Já tem uma conta?</span>
              <button type="button" className="auth-inline-link" onClick={() => navigateTo(hasActiveSession ? '/admin' : '/login')}>
                {hasActiveSession ? 'Ir para painel' : 'Entrar'}
              </button>
            </div>

            {errorMessage ? <p className="persona-error">{errorMessage}</p> : null}
          </div>
        </div>

        <div className="brandsoul-contact">
          <span>Contato</span>
          <a href="mailto:andrew@flowcoregroup.space">andrew@flowcoregroup.space</a>
        </div>
      </motion.section>
    </main>
  )
}
