import type { PublicPresenceResponse } from '../../domain/entity/contracts/PublicPresenceResponse'

type RelationshipStateBannerProps = {
  relational: PublicPresenceResponse['relational']
  presenceHealth: PublicPresenceResponse['visual']['presenceHealth']
}

export function RelationshipStateBanner({ relational, presenceHealth }: RelationshipStateBannerProps) {
  return (
    <div className={`entity-public-relationship entity-public-relationship--${presenceHealth.trend}`}>
      <span className="entity-public-relationship__eyebrow">estado atual</span>
      <strong>{relational.relationshipLabel}</strong>
      <p>{presenceHealth.summary}</p>
    </div>
  )
}

export default RelationshipStateBanner
