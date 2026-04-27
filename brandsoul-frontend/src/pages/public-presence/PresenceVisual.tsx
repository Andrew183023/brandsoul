import PixiPresenceMini from '../../app/dashboard/PixiPresenceMini'
import type { BrandSoulVisualRuntimePatch } from '../../domain/rendering/contracts/BrandSoulVisualRuntimePatch'
import type { PublicPresenceResponse } from '../../domain/entity/contracts/PublicPresenceResponse'
import type { PublicPresenceCognitiveIndicator } from './services/deriveCognitivePresenceIndicator'

type PresenceVisualProps = {
  presence: PublicPresenceResponse
  visualRuntimePatch?: BrandSoulVisualRuntimePatch
  cognitiveIndicator?: PublicPresenceCognitiveIndicator
}

export function PresenceVisual({ presence, visualRuntimePatch, cognitiveIndicator }: PresenceVisualProps) {
  return (
    <div
      className={`entity-public-presence-visual entity-public-presence-visual--${presence.visual.presenceHealth.trend}`}
      style={{
        ['--entity-public-intensity' as string]: presence.visual.intensity.toFixed(2),
      }}
    >
      <div className="entity-public-presence-visual__glow" />
      {cognitiveIndicator ? (
        <div className="entity-public-presence-indicator" aria-label="estado cognitivo atual da presenca">
          <span className="entity-public-presence-indicator__label">{cognitiveIndicator.presenceLabel}</span>
          <div className="entity-public-presence-indicator__meta">
            <span>{cognitiveIndicator.intentLabel}</span>
            <span>{cognitiveIndicator.actionLabel}</span>
          </div>
        </div>
      ) : null}
      <div className="entity-public-presence-visual__frame">
        {presence.visual.frameRenderSpec ? (
          <PixiPresenceMini renderSpec={presence.visual.frameRenderSpec} visualRuntimePatch={visualRuntimePatch} />
        ) : presence.entity.avatarExportRef ? (
          <img
            className="entity-public-presence-visual__image"
            src={presence.entity.avatarExportRef}
            alt={presence.entity.name}
          />
        ) : (
          <div className="entity-public-presence-visual__fallback">
            <span>{presence.entity.name.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default PresenceVisual
