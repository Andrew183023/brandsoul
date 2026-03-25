import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'

import type { PowerOption, ToneOption } from '../persona'

type SparkState = 'idle' | 'thinking' | 'speaking'

interface SparkProps {
  tone: ToneOption
  power: PowerOption
  state: SparkState
}

const getSparkStyle = (tone: ToneOption, power: PowerOption) => {
  const base = {
    core: '#FF7A3C',
    glow: '#FFB36B',
    aura: '#FFD166',
  }

  if (tone === 'divertido') {
    base.core = '#FF9F1C'
    base.glow = '#FFD166'
    base.aura = '#FFE29A'
  }

  if (tone === 'sério') {
    base.core = '#3B82F6'
    base.glow = '#60A5FA'
    base.aura = '#93C5FD'
  }

  if (tone === 'inteligente') {
    base.core = '#8B5CF6'
    base.glow = '#A78BFA'
    base.aura = '#C4B5FD'
  }

  if (tone === 'ousado') {
    base.core = '#EF4444'
    base.glow = '#F87171'
    base.aura = '#FCA5A5'
  }

  if (power === 'atração') {
    base.glow = '#FF3CAC'
  }

  if (power === 'clareza') {
    base.glow = '#38BDF8'
  }

  if (power === 'velocidade') {
    base.glow = '#FACC15'
  }

  if (power === 'conexão') {
    base.glow = '#34D399'
  }

  return base
}

const getAnimationByTone = (tone: ToneOption) => {
  if (tone === 'divertido') {
    return {
      scale: [1, 1.08, 0.98, 1.05, 1],
      rotate: [0, 2, -2, 1, 0],
    }
  }

  if (tone === 'sério') {
    return {
      scale: [1, 1.02, 1],
      rotate: [0, 0, 0],
    }
  }

  if (tone === 'inteligente') {
    return {
      scale: [1, 1.03, 1.01, 1],
      rotate: [0, 1, -1, 0],
    }
  }

  if (tone === 'ousado') {
    return {
      scale: [1, 1.12, 0.95, 1.1, 1],
      rotate: [0, 3, -3, 2, 0],
    }
  }

  return {
    scale: [1, 1.05, 1],
    rotate: [0, 0, 0],
  }
}

const getIntensityByPower = (power: PowerOption) => {
  if (power === 'atração') return 1.4
  if (power === 'velocidade') return 1.6
  if (power === 'clareza') return 1.1
  if (power === 'conexão') return 1.2

  return 1.2
}

function getStateBehavior(state: SparkState) {
  if (state === 'thinking') {
    return {
      duration: 1.55,
      multiplier: 1.08,
      drift: 1.35,
    }
  }

  if (state === 'speaking') {
    return {
      duration: 1.05,
      multiplier: 1.18,
      drift: 1.5,
    }
  }

  return {
    duration: 2,
    multiplier: 1,
    drift: 0.7,
  }
}

function getSparkStyles(
  style: ReturnType<typeof getSparkStyle>,
  intensity: number,
): Record<'shell' | 'halo' | 'aura' | 'ring' | 'core' | 'scan', CSSProperties> {
  return {
    shell: {
      filter: `drop-shadow(0 0 ${20 * intensity}px ${style.aura})`,
    },
    halo: {
      background: `radial-gradient(circle, ${style.aura}44 0%, ${style.glow}20 52%, transparent 76%)`,
    },
    aura: {
      background: `radial-gradient(circle at 50% 50%, ${style.aura}d9 0%, ${style.glow}78 42%, transparent 76%)`,
    },
    ring: {
      borderColor: `${style.aura}55`,
      boxShadow: `inset 0 0 ${12 * intensity}px ${style.aura}, 0 0 ${18 * intensity}px ${style.glow}`,
    },
    core: {
      background: `radial-gradient(circle at 35% 35%, ${style.aura}, ${style.glow} 42%, ${style.core} 76%, #150d15 100%)`,
      boxShadow: `0 0 ${40 * intensity}px ${style.glow}`,
    },
    scan: {
      background: `linear-gradient(90deg, transparent, ${style.aura}22, ${style.glow}, ${style.aura}22, transparent)`,
      boxShadow: `0 0 ${22 * intensity}px ${style.glow}`,
    },
  }
}

export default function Spark({ tone, power, state }: SparkProps) {
  const style = getSparkStyle(tone, power)
  const animation = getAnimationByTone(tone)
  const intensity = getIntensityByPower(power)
  const stateBehavior = getStateBehavior(state)
  const sparkStyles = getSparkStyles(style, intensity)

  const shellScale = animation.scale.map((value) =>
    Number((value * stateBehavior.multiplier).toFixed(3)),
  )

  return (
    <motion.div
      className="spark-shell"
      style={sparkStyles.shell}
      animate={{
        scale: shellScale,
        rotate: animation.rotate,
        x: [0, 1.3 * stateBehavior.drift, -1 * stateBehavior.drift, 0.55 * stateBehavior.drift, 0],
        y: [0, -1.1 * stateBehavior.drift, 0.8 * stateBehavior.drift, -0.45 * stateBehavior.drift, 0],
      }}
      transition={{
        duration: stateBehavior.duration,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      aria-label={`Centelha em estado ${state}`}
      role="img"
    >
      <div className="spark-grid" />

      <motion.div
        className="spark-halo"
        style={sparkStyles.halo}
        animate={{
          scale: [1, 1.04 * intensity, 0.99, 1.06 * intensity, 1],
          opacity: [0.18, 0.28 * intensity, 0.2, 0.36 * intensity, 0.18],
        }}
        transition={{
          duration: stateBehavior.duration + 0.35,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="spark-aura"
        style={sparkStyles.aura}
        animate={{
          scale: [1, 1.05 * intensity, 0.985, 1.07 * intensity, 1],
          opacity: [0.62, 0.82, 0.7, 0.9, 0.62],
          x: [0, 0.7 * stateBehavior.drift, -0.5 * stateBehavior.drift, 0.25 * stateBehavior.drift, 0],
          y: [0, -0.55 * stateBehavior.drift, 0.35 * stateBehavior.drift, -0.15 * stateBehavior.drift, 0],
        }}
        transition={{
          duration: stateBehavior.duration,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="spark-ring"
        style={sparkStyles.ring}
        animate={{
          scale: [1, 1.02 * intensity, 0.995, 1.04 * intensity, 1],
          opacity: [0.24, 0.44 * intensity, 0.26, 0.5 * intensity, 0.24],
          rotate: [0, 4 * stateBehavior.drift, -3 * stateBehavior.drift, 2 * stateBehavior.drift, 0],
        }}
        transition={{
          duration: stateBehavior.duration + 0.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="spark-core"
        style={sparkStyles.core}
        animate={{
          scale: [1, 1.06 * intensity, 0.99, 1.09 * intensity, 1],
          x: [0, -0.45 * stateBehavior.drift, 0.35 * stateBehavior.drift, -0.15 * stateBehavior.drift, 0],
          y: [0, 0.4 * stateBehavior.drift, -0.3 * stateBehavior.drift, 0.15 * stateBehavior.drift, 0],
          boxShadow: [
            `0 0 ${28 * intensity}px ${style.glow}, 0 0 ${62 * intensity}px ${style.aura}`,
            `0 0 ${36 * intensity}px ${style.glow}, 0 0 ${90 * intensity}px ${style.aura}`,
            `0 0 ${30 * intensity}px ${style.glow}, 0 0 ${72 * intensity}px ${style.aura}`,
            `0 0 ${42 * intensity}px ${style.glow}, 0 0 ${104 * intensity}px ${style.aura}`,
            `0 0 ${28 * intensity}px ${style.glow}, 0 0 ${62 * intensity}px ${style.aura}`,
          ],
        }}
        transition={{
          duration: stateBehavior.duration - 0.05,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="spark-scan"
        style={sparkStyles.scan}
        animate={{
          x: ['-12%', '10%', '-4%', '8%', '-12%'],
          scaleX: [0.9, 1.05 * intensity, 0.96, 1.12 * intensity, 0.9],
          opacity: [0.12, 0.32 * intensity, 0.16, 0.44 * intensity, 0.12],
        }}
        transition={{
          duration: stateBehavior.duration + 0.1,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </motion.div>
  )
}
