import type { BrandSoulVisualRuntimePatch } from '../../domain/rendering/contracts/BrandSoulVisualRuntimePatch'

type PixiPresenceMiniProps = {
  renderSpec?: Record<string, unknown>
  visualRuntimePatch?: BrandSoulVisualRuntimePatch
}

export default function PixiPresenceMini({ renderSpec, visualRuntimePatch }: PixiPresenceMiniProps) {
  const summary = typeof renderSpec?.['mode'] === 'string'
    ? String(renderSpec['mode'])
    : 'visual-runtime'
  const intensity = visualRuntimePatch?.metadata?.visualIntensity ?? 'balanced'

  return (
    <div className="entity-public-presence-visual__fallback" aria-label="visual-presence-mini">
      <span>{summary}</span>
      <small>{intensity}</small>
    </div>
  )
}
