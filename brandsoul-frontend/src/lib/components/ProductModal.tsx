import { useEffect, useMemo, useState } from 'react'

import { resolveCatalogAvailability } from '../catalog'
import type { CatalogItem } from '../../types/catalog'

interface ProductModalProps {
  item: CatalogItem | null
  onClose: () => void
  onPrimaryAction: (item: CatalogItem) => void
  onWhatsAppAction?: (item: CatalogItem) => void
}

export default function ProductModal({ item, onClose, onPrimaryAction, onWhatsAppAction }: ProductModalProps) {
  const imageOptions = useMemo(() => {
    if (!item) {
      return []
    }

    const images = [item.image, ...(item.images ?? [])].filter((value): value is string => Boolean(value))
    return Array.from(new Set(images))
  }, [item])
  const [activeImage, setActiveImage] = useState<string | null>(null)

  useEffect(() => {
    setActiveImage(imageOptions[0] ?? null)
  }, [imageOptions])

  useEffect(() => {
    if (!item) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [item, onClose])

  if (!item) {
    return null
  }

  const availability = resolveCatalogAvailability(item.stock, item.availability)
  const availabilityLabel = availability === 'out' ? 'Esgotado' : availability === 'low' ? 'Poucas unidades' : 'Disponível'

  return (
    <div className="product-modal-overlay" role="dialog" aria-modal="true" aria-label={`Detalhes de ${item.name}`} onClick={onClose}>
      <div className="product-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="product-modal-close" onClick={onClose}>
          Fechar
        </button>

        {activeImage ? (
          <div className="product-modal-media">
            <span className="product-modal-section-label">Imagem</span>
            <img src={activeImage} alt={item.name} className="product-modal-image" />
          </div>
        ) : null}

        {imageOptions.length > 1 ? (
          <div className="product-thumb-grid">
            {imageOptions.map((image, index) => (
              <button key={`${image}-${index}`} type="button" className={`product-thumb-button ${activeImage === image ? 'active' : ''}`} onClick={() => setActiveImage(image)}>
                <img src={image} alt={`Imagem ${index + 1} de ${item.name}`} className="product-thumb" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="product-modal-copy">
          <span className="product-modal-section-label">Informações</span>
          <div className="product-card-topline">
            {item.category ? <span className="product-category">{item.category}</span> : null}
            {item.highlight ? <span className="product-badge">{item.highlight}</span> : null}
            {!item.highlight && item.isPromotion ? <span className="product-badge">Promoção</span> : null}
            {!item.highlight && !item.isPromotion && item.isNewArrival ? <span className="product-badge">Novo</span> : null}
          </div>
          <h3>{item.name}</h3>
          <p>{item.description}</p>
          <span className={`product-availability ${availability}`}>{availabilityLabel}</span>
          {item.price ? <strong className="product-price">{item.price}</strong> : null}
        </div>

        <div className="product-actions product-modal-actions">
          <span className="product-modal-section-label">Conversa</span>
          <button
            type="button"
            className="product-primary-action"
            onClick={() => {
              onPrimaryAction(item)
              onClose()
            }}
            disabled={availability === 'out'}
          >
            {item.ctaLabel ?? 'Quero saber mais'}
          </button>
          {onWhatsAppAction ? (
            <button
              type="button"
              className="product-secondary-action"
              onClick={() => {
                onWhatsAppAction(item)
                onClose()
              }}
            >
              Pedir no WhatsApp
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
