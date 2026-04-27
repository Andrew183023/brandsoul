import React, { type ReactNode } from 'react'

import { motion } from 'framer-motion'

import type { OrchestratorFrame } from '../../../backend-bridge/contracts/OrchestratorFrame'
import type { EntityProfile } from '../../../domain/entity/contracts/EntityProfile'
import type { PersonaLabFinalPersona } from '../../../persona-lab/core/finalPersonaBuilder'
import type { ManifestationIntensity, PersonaLabPreview, PersonaVisualVariant } from '../../../domain/rendering/contracts/types'
import type { SceneExportFormat } from '../../../runtime/pixi/export/sceneExport'
import type { PixiScenePerfSnapshot } from '../../../runtime/pixi/scene/PersonaScene'
import { getFinalPresenceModel, getManifestationFinalQuote } from '../content/ritualCopy'

type RuntimeRender = (
  preview: PersonaLabPreview,
  options?: {
    variant?: PersonaVisualVariant
    intensity?: ManifestationIntensity
    orchestratorFrame?: OrchestratorFrame
    onExportReady?: ((exporter: ((format?: SceneExportFormat) => Promise<void>) | null) => void) | undefined
    onPerformanceUpdate?: ((snapshot: PixiScenePerfSnapshot) => void) | undefined
    entityProfile?: EntityProfile
  },
) => ReactNode

type PersonaLabFinalHeroProps = {
  selectedPreview: PersonaLabPreview
  entityProfile?: EntityProfile
  orchestratorFrame?: OrchestratorFrame
  activeArchetypeConfig: {
    hoverScale: number
  }
  finalPersona?: PersonaLabFinalPersona
  renderRuntime: RuntimeRender
  onExportReady: (exporter: ((format?: SceneExportFormat) => Promise<void>) | null) => void
  onPerformanceUpdate: (snapshot: PixiScenePerfSnapshot) => void
}

function resolveBindingCopy(entityProfile?: EntityProfile) {
  const relational = entityProfile?.relational
  if (!relational) {
    return []
  }

  const copy = [
    relational.binding.attachmentLevel === 'bonded' || relational.binding.attachmentLevel === 'high'
      ? 'vínculo consolidado'
      : relational.binding.attachmentLevel === 'medium'
        ? 'vínculo em formação'
        : 'primeiro vínculo criado',
    relational.imprint.imprintConfidence >= 0.42
      ? 'ela já entende melhor seu estilo'
      : 'ela começou a ler seu estilo',
    relational.value.retentionSignals.shouldProtectContinuity
      ? 'história própria preservada'
      : 'identidade única em formação',
  ]

  return copy
}

export function PersonaLabFinalHero({
  selectedPreview,
  entityProfile,
  orchestratorFrame,
  activeArchetypeConfig,
  finalPersona,
  renderRuntime,
  onExportReady,
  onPerformanceUpdate,
}: PersonaLabFinalHeroProps) {
  const bindingCopy = resolveBindingCopy(entityProfile)
  const finalPresenceModel = getFinalPresenceModel({
    mode: selectedPreview.manifestationMode,
    personaDNA: selectedPreview.personaDNA,
    finalForm: entityProfile?.finalForm,
  })

  return (
    <motion.div
      className={`persona-lab-final-hero presence-${selectedPreview.personaDNA.presenceStyle} temperament-${selectedPreview.personaDNA.temperament}`}
      style={finalPresenceModel.styleVars}
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: 'easeOut' }}
      whileHover={{ scale: activeArchetypeConfig.hoverScale }}
      whileTap={{ scale: Math.max(0.985, activeArchetypeConfig.hoverScale - 0.03) }}
    >
      {renderRuntime(selectedPreview, {
        variant: 'final',
        entityProfile,
        orchestratorFrame,
        onExportReady,
        onPerformanceUpdate,
      })}
      <span className="professional-label">Sua entidade está pronta</span>
      <strong className="persona-lab-final-name">{entityProfile?.finalForm.identity?.name ?? finalPersona?.name}</strong>
      {bindingCopy.length ? (
        <div className="persona-lab-relational-strip" aria-label="Estado de vínculo da entidade">
          {bindingCopy.map((copy) => (
            <span key={copy}>{copy}</span>
          ))}
        </div>
      ) : null}
      <motion.p
        className="persona-lab-final-quote"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.34 }}
      >
        {entityProfile?.finalForm.identity?.openingLine ?? getManifestationFinalQuote(selectedPreview.manifestationMode, selectedPreview.personaDNA)}
      </motion.p>
      <p className="persona-lab-final-impact-copy">{finalPresenceModel.impactCopy}</p>
      <div className="persona-lab-relational-strip persona-lab-final-signal-strip" aria-label="Leitura semântica final da entidade">
        {finalPresenceModel.signals.map((signal) => (
          <span key={signal}>{signal}</span>
        ))}
      </div>
    </motion.div>
  )
}
