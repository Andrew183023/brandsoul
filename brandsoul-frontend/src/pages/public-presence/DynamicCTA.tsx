import type { PublicPresenceResponse } from '../../domain/entity/contracts/PublicPresenceResponse'

type DynamicCTAProps = {
  cta: PublicPresenceResponse['cta']
  onFollow: () => void
  onShare: () => void
}

export function DynamicCTA({ cta, onFollow, onShare }: DynamicCTAProps) {
  if (cta.type === 'follow') {
    return (
      <button type="button" className="entity-public-button entity-public-button--primary" onClick={onFollow}>
        {cta.label}
      </button>
    )
  }

  if (cta.type === 'share') {
    return (
      <button type="button" className="entity-public-button entity-public-button--primary" onClick={onShare}>
        {cta.label}
      </button>
    )
  }

  const href = cta.type === 'explore'
    ? '#entity-public-trajectory'
    : '#entity-public-interaction'

  return (
    <a className="entity-public-button entity-public-button--primary" href={href}>
      {cta.label}
    </a>
  )
}

export default DynamicCTA
