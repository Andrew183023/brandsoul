import type { CatalogItem } from '../../types/catalog'
import { resolveCatalogAvailability } from '../catalog'

interface ProductCardProps {
  item: CatalogItem
  primaryLabel?: string
  onPrimaryAction: (item: CatalogItem) => void
  onOpen?: (item: CatalogItem) => void
  onWhatsAppAction?: (item: CatalogItem) => void
}

export default function ProductCard({ item, primaryLabel, onPrimaryAction, onOpen, onWhatsAppAction }: ProductCardProps) {
  const availability = resolveCatalogAvailability(item.stock, item.availability)
  const availabilityLabel = availability === 'out' ? 'Esgotado' : availability === 'low' ? 'Poucas unidades' : 'Disponivel'
  const displayImage = item.image ?? item.images?.[0]

  return (
    <article className="product-card" onClick={() => onOpen?.(item)} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}>
      {displayImage ? (
        <div className="product-card-media">
          <img src={displayImage} alt={item.name} className="product-card-image" />
        </div>
      ) : null}

      <div className="product-card-copy">
        <div className="product-card-topline">
          {item.category ? <span className="product-category">{item.category}</span> : null}
          {item.highlight ? <span className="product-badge">{item.highlight}</span> : null}
          {!item.highlight && item.isPromotion ? <span className="product-badge">Promocao</span> : null}
          {!item.highlight && !item.isPromotion && item.isNewArrival ? <span className="product-badge">Novo</span> : null}
        </div>
        <h3>{item.name}</h3>
        <p>{item.description}</p>
        <span className={`product-availability ${availability}`}>{availabilityLabel}</span>
      </div>

      <div className="product-card-footer">
        {item.price ? <span className="product-price">{item.price}</span> : <span className="product-price subtle">Fale comigo para ver detalhes</span>}
        <div className="product-actions">
          <button
            type="button"
            className="product-primary-action"
            onClick={(event) => {
              event.stopPropagation()
              onPrimaryAction(item)
            }}
            disabled={availability === 'out'}
          >
            {primaryLabel ?? item.ctaLabel ?? 'Quero saber mais'}
          </button>
          {onWhatsAppAction ? (
            <button
              type="button"
              className="product-secondary-action"
              onClick={(event) => {
                event.stopPropagation()
                onWhatsAppAction(item)
              }}
            >
              Pedir no WhatsApp
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
