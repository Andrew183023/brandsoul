import type { CatalogItem } from '../types/catalog'

interface ProductCardProps {
  item: CatalogItem
  primaryLabel?: string
  onPrimaryAction: (item: CatalogItem) => void
  whatsappHref?: string | null
}

export default function ProductCard({ item, primaryLabel, onPrimaryAction, whatsappHref = null }: ProductCardProps) {
  return (
    <article className="product-card">
      <div className="product-card-copy">
        <div className="product-card-topline">
          {item.category ? <span className="product-category">{item.category}</span> : null}
          {item.highlight ? <span className="product-badge">{item.highlight}</span> : null}
        </div>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </div>

      <div className="product-card-footer">
        {item.price ? <span className="product-price">{item.price}</span> : <span className="product-price subtle">Fale comigo para ver detalhes</span>}
        <div className="product-actions">
          <button type="button" className="product-primary-action" onClick={() => onPrimaryAction(item)}>
            {primaryLabel ?? item.ctaLabel ?? 'Quero saber mais'}
          </button>
          {whatsappHref ? (
            <a className="product-secondary-action" href={whatsappHref} target="_blank" rel="noreferrer">
              Pedir no WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </article>
  )
}
