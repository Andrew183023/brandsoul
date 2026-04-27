import { motion } from 'framer-motion'
import { useMemo, useState, type FormEvent } from 'react'

import brandsoulLogo from '../assets/brandsoul-logo-original.jpeg'
import BrandSpark from '../lib/components/BrandSpark'
import '../styles/createPersonaPage.css'
import {
  createEntityFromBrandName,
  clearEntityBirthDraft,
  saveEntityBirthDraft,
} from '../lib/entityBirth.ts'
import {
  loadBrandPersona,
  navigateTo,
  type PowerOption,
  type ToneOption,
} from '../lib/persona'
import { useAuthSession } from '../lib/session'

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

const DEFAULT_TONE: ToneOption = 'divertido'
const DEFAULT_POWER: PowerOption = 'atração'

export default function CreatePersonaPage() {
  const authSession = useAuthSession()
  const savedPersona = useMemo(() => loadBrandPersona(), [])
  const [brandName, setBrandName] = useState(savedPersona?.brandName ?? '')
  const [errorMessage, setErrorMessage] = useState('')
  const [isActivating, setIsActivating] = useState(false)

  const hasSession = Boolean(authSession?.token)
  const sparkTone = savedPersona?.tone ?? DEFAULT_TONE
  const sparkPower = savedPersona?.power ?? DEFAULT_POWER
  const trimmedBrandName = brandName.trim()
  const isTyping = trimmedBrandName.length > 0 && !isActivating
  const isReady = trimmedBrandName.length > 0 && !isActivating
  const visualState = isActivating ? 'creating' : isTyping ? 'typing' : 'idle'
  const sparkState = isActivating ? 'speaking' : isTyping ? 'thinking' : 'idle'

  const handleCreatePersona = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!trimmedBrandName) {
      setErrorMessage('Digite o nome da sua marca para começar.')
      return
    }

    setIsActivating(true)
    try {
      playActivationChime()
    } catch {
      // The visual pulse remains active if audio is blocked.
    }

    if (!hasSession) {
      saveEntityBirthDraft(trimmedBrandName)

      window.setTimeout(() => {
        navigateTo('/register')
      }, 760)

      return
    }

    try {
      const payload = await createEntityFromBrandName(trimmedBrandName)
      clearEntityBirthDraft()

      window.setTimeout(() => {
        navigateTo(`/admin/entity/${payload.entityId}/identity`)
      }, 760)
    } catch (error) {
      console.error(error)
      setErrorMessage('Não consegui dar vida à sua marca agora. Tente novamente.')
      setIsActivating(false)
    }
  }

  return (
    <main
      className={`create-brand-page create-brand-page--${visualState} ${isReady ? 'create-brand-page--ready' : ''}`}
    >
      <header className="create-topbar">
        <button
          type="button"
          className="create-topbar-logo"
          aria-label="BrandSoul"
          onClick={() => navigateTo('/')}
        >
          <img src={brandsoulLogo} alt="BrandSoul" className="create-topbar-logo__image" />
        </button>

        <button
          type="button"
          className="create-topbar-login"
          onClick={() => navigateTo(hasSession ? '/admin' : '/login')}
        >
          {hasSession ? 'Admin' : 'Entrar'}
        </button>
      </header>

      <motion.section
        className="create-brand-page__panel"
        initial={{ opacity: 0, scale: 0.985, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <motion.div
          className="create-spark-stage"
          animate={{
            scale: isActivating
              ? [1, 1.08, 1.22, 1.1]
              : isTyping
                ? [1, 1.035, 1]
                : [1, 1.018, 1],
            opacity: isActivating ? [1, 1, 0.96, 1] : [0.94, 1, 0.95],
            filter: isActivating
              ? [
                  'drop-shadow(0 0 26px rgba(249, 115, 22, 0.22))',
                  'drop-shadow(0 0 42px rgba(249, 115, 22, 0.38))',
                  'drop-shadow(0 0 68px rgba(249, 115, 22, 0.52))',
                  'drop-shadow(0 0 54px rgba(249, 115, 22, 0.42))',
                ]
              : isTyping
                ? [
                    'drop-shadow(0 0 26px rgba(249, 115, 22, 0.2))',
                    'drop-shadow(0 0 40px rgba(249, 115, 22, 0.3))',
                    'drop-shadow(0 0 28px rgba(249, 115, 22, 0.22))',
                  ]
                : [
                    'drop-shadow(0 0 20px rgba(249, 115, 22, 0.14))',
                    'drop-shadow(0 0 30px rgba(249, 115, 22, 0.2))',
                    'drop-shadow(0 0 22px rgba(249, 115, 22, 0.16))',
                  ],
          }}
          transition={{ duration: isActivating ? 0.72 : isTyping ? 0.46 : 2.6, ease: 'easeInOut' }}
        >
          <BrandSpark
            brandName={brandName}
            tone={sparkTone}
            power={sparkPower}
            state={sparkState}
            logo={savedPersona?.logo}
          />
        </motion.div>

        <div className="create-brand-page__copy">
          <h1 className="create-brand-page__title">
            <span>A sua marca não precisa só de presença.</span>
            <span>Ela precisa de uma alma.</span>
          </h1>
          <p className="create-brand-page__subtitle">A primeira centelha nasce aqui.</p>
        </div>

        <form className="create-brand-page__form" onSubmit={(event) => void handleCreatePersona(event)}>
          <label className="create-brand-page__field" htmlFor="brandName">
            <span className="create-brand-page__label">Nome da marca</span>
            <input
              id="brandName"
              className="create-brand-page__input"
              value={brandName}
              onChange={(event) => {
                setBrandName(event.target.value)
                if (errorMessage) {
                  setErrorMessage('')
                }
              }}
              placeholder="Como sua marca se chama?"
              autoComplete="off"
              aria-invalid={errorMessage ? 'true' : 'false'}
            />
          </label>

          <button
            type="submit"
            className={`create-brand-page__button ${isReady ? 'create-brand-page__button--ready' : ''}`}
            disabled={!isReady}
          >
            {isActivating ? 'Dando vida...' : 'Dar vida à marca'}
          </button>

          {errorMessage ? <p className="create-brand-page__error">{errorMessage}</p> : null}
        </form>
      </motion.section>
    </main>
  )
}
