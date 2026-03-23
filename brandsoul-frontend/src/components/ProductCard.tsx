import type { CatalogItem } from '../types/catalog'
import { resolveCatalogAvailability } from '../lib/catalog'

interface ProductCardProps {
  item: CatalogItem
  primaryLabel?: string
  onPrimaryAction: (item: CatalogItem) => void
  onOpen?: (item: CatalogItem) => void
  whatsappHref?: string | null
}

export default function ProductCard({ item, primaryLabel, onPrimaryAction, onOpen, whatsappHref = null }: ProductCardProps) {
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
          {whatsappHref ? (
            <a
              className="product-secondary-action"
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              Pedir no WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </article>
  )
}
