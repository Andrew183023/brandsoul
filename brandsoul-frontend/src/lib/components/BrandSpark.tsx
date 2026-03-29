import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { extractDominantLogoColor } from '../logoColor'
import type { PowerOption, ToneOption } from '../persona'
import Spark from './Spark'

type SparkState = 'idle' | 'thinking' | 'speaking'
type BrandSparkProfile = 'fluid' | 'pulse' | 'calm'

interface BrandSparkProps {
  brandName?: string
  tone: ToneOption
  power: PowerOption
  state: SparkState
  logo?: string
}

function hashBrandName(value?: string) {
  return Array.from((value ?? '').trim()).reduce((accumulator, character) => (accumulator * 31 + character.charCodeAt(0)) % 9973, 0)
}

function resolveBrandSparkProfile(tone: ToneOption, power: PowerOption, logoColor?: string): BrandSparkProfile {
  if (tone === 'ousado' || power === 'velocidade') {
    return 'pulse'
  }

  if (tone === 'sério' || power === 'clareza') {
    return 'calm'
  }

  if (logoColor?.startsWith('#2') || logoColor?.startsWith('#3') || power === 'conexão') {
    return 'fluid'
  }

  return 'fluid'
}

function getSparkBehavior(tone: ToneOption) {
  switch (tone) {
    case 'divertido':
      return { blur: 28, speed: 6.2, scale: 1.02 }
    case 'ousado':
      return { blur: 18, speed: 4.8, scale: 1.035 }
    case 'sério':
      return { blur: 14, speed: 7.4, scale: 1.004 }
    case 'inteligente':
      return { blur: 17, speed: 6.8, scale: 1.012 }
    default:
      return { blur: 18, speed: 6.6, scale: 1.01 }
  }
}

function getSparkStateStyles(state: SparkState) {
  if (state === 'thinking') {
    return { scale: 0.986, glow: 0.6 }
  }

  if (state === 'speaking') {
    return { scale: 1.03, glow: 0.8 }
  }

  return { scale: 1, glow: 0.4 }
}

function resolveMotionPreset(profile: BrandSparkProfile, tone: ToneOption, state: SparkState, brandSeed: number) {
  const behavior = getSparkBehavior(tone)
  const stateStyles = getSparkStateStyles(state)
  const variation = brandSeed % 10
  const speedShift = variation * 0.08
  const drift = 0.8 + variation * 0.07

  if (profile === 'pulse') {
    return {
      shell: {
        scale: [1, 1.012, stateStyles.scale, behavior.scale + 0.01, 1],
      },
      core: {
        scale: [0.985, 1.016, 0.972, 1.02, 0.985],
        borderRadius: ['44% 56% 42% 58% / 46% 40% 60% 54%', '58% 42% 54% 46% / 40% 58% 42% 60%', '42% 58% 60% 40% / 56% 38% 62% 44%', '54% 46% 44% 56% / 42% 60% 40% 58%', '44% 56% 42% 58% / 46% 40% 60% 54%'],
        rotate: [0, 2.2, -1.7, 1, 0],
        x: [0, 1.1 * drift, -0.9 * drift, 0.55 * drift, 0],
        y: [0, -0.9 * drift, 0.7 * drift, -0.45 * drift, 0],
      },
      duration: behavior.speed - 1.8 + speedShift,
      behavior,
      stateStyles,
      variation,
    }
  }

  if (profile === 'calm') {
    return {
      shell: {
        scale: [1, 1.004, stateStyles.scale, behavior.scale, 1],
      },
      core: {
        scale: [0.992, 1.006, 0.986, 1.01, 0.992],
        borderRadius: ['50% 50% 48% 52% / 52% 48% 52% 48%', '52% 48% 50% 50% / 48% 52% 48% 52%', '48% 52% 54% 46% / 50% 46% 54% 50%', '51% 49% 47% 53% / 54% 50% 50% 46%', '50% 50% 48% 52% / 52% 48% 52% 48%'],
        rotate: [0, 0.8, -0.6, 0.25, 0],
        x: [0, 0.55 * drift, -0.45 * drift, 0.2 * drift, 0],
        y: [0, -0.4 * drift, 0.3 * drift, -0.15 * drift, 0],
      },
      duration: behavior.speed + 0.5 + speedShift,
      behavior,
      stateStyles,
      variation,
    }
  }

  return {
    shell: {
      scale: [1, 1.008, stateStyles.scale, behavior.scale, 1],
    },
    core: {
      scale: [0.986, 1.012, 0.972, 1.016, 0.986],
      borderRadius: ['42% 58% 50% 50% / 44% 40% 60% 56%', '56% 44% 46% 54% / 40% 56% 44% 60%', '46% 54% 58% 42% / 52% 42% 58% 48%', '54% 46% 42% 58% / 46% 60% 40% 54%', '42% 58% 50% 50% / 44% 40% 60% 56%'],
      rotate: [0, 1.5, -1.2, 0.6, 0],
      x: [0, 0.8 * drift, -0.7 * drift, 0.35 * drift, 0],
      y: [0, -0.7 * drift, 0.55 * drift, -0.25 * drift, 0],
    },
    duration: behavior.speed + speedShift,
    behavior,
    stateStyles,
    variation,
  }
}

export default function BrandSpark({ brandName, tone, power, state, logo }: BrandSparkProps) {
  const [logoDominantColor, setLogoDominantColor] = useState<string | undefined>(undefined)

  useEffect(() => {
    let isMounted = true

    void (async () => {
      const nextColor = await extractDominantLogoColor(logo)
      if (isMounted) {
        setLogoDominantColor(nextColor)
      }
    })()

    return () => {
      isMounted = false
    }
  }, [logo])

  const brandSeed = useMemo(() => hashBrandName(brandName), [brandName])
  const profile = useMemo(() => resolveBrandSparkProfile(tone, power, logoDominantColor), [logoDominantColor, power, tone])
  const motionPreset = useMemo(() => resolveMotionPreset(profile, tone, state, brandSeed), [brandSeed, profile, state, tone])
  const sparkStyle = useMemo(
    () =>
      ({
        '--brand-spark-logo': logoDominantColor ?? 'rgba(255,255,255,0.18)',
        '--brand-spark-blur': `${motionPreset.behavior.blur}px`,
        '--brand-spark-glow': String(motionPreset.stateStyles.glow),
        '--brand-spark-variation': String(motionPreset.variation),
      }) as CSSProperties,
    [logoDominantColor, motionPreset.behavior.blur, motionPreset.stateStyles.glow, motionPreset.variation],
  )

  return (
    <div className="brand-spark-frame">
      <motion.div
        className={`brand-spark-shell brand-spark-shell--${profile} brand-spark-shell--${state}`}
        style={sparkStyle}
        animate={motionPreset.shell}
        transition={{
          duration: motionPreset.duration + 0.25,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <Spark state={state} tone={tone} power={power} />
        <div className="brand-spark-overlay" aria-hidden="true">
          <div className="brand-spark-accent" />
          <motion.div
            className="brand-spark-nucleus"
            animate={motionPreset.core}
            transition={{
              duration: motionPreset.duration,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </div>
      </motion.div>
    </div>
  )
}
