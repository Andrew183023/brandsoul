import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'

import Spark from '../components/Spark'
import { loadCatalogItems, normalizeCatalogItem, saveCatalogItems } from '../lib/catalog'
import { readFileAsDataUrl, readFilesAsDataUrls } from '../lib/media'
import {
  BUSINESS_DESCRIPTION_MAX_LENGTH,
  BRAND_KNOWLEDGE_MAX_LENGTH,
  loadBrandPersona,
  navigateTo,
  powerOptions,
  saveBrandPersona,
  toneOptions,
  type PowerOption,
  type ToneOption,
  type VoiceStyleOption,
  voiceStyleOptions,
} from '../lib/persona'
import type { CatalogAvailability, CatalogItem } from '../types/catalog'
import '../App.css'

interface CatalogDraft {
  name: string
  description: string
  image: string
  images: string[]
  stock: string
  availability: CatalogAvailability
  price: string
  highlight: string
  category: string
}

function createEmptyCatalogDraft(): CatalogDraft {
  return {
    name: '',
    description: '',
    image: '',
    images: [],
    stock: '',
    availability: 'available',
    price: '',
    highlight: '',
    category: '',
  }
}

export default function CreatePersonaPage() {
  const savedPersona = useMemo(() => loadBrandPersona(), [])
  const savedCatalog = useMemo(() => loadCatalogItems(), [])
  const [brandName, setBrandName] = useState(savedPersona?.brandName ?? '')
  const [logo, setLogo] = useState(savedPersona?.logo ?? '')
  const [businessDescription, setBusinessDescription] = useState(savedPersona?.businessDescription ?? '')
  const [institutionalImage, setInstitutionalImage] = useState(savedPersona?.institutionalImage ?? '')
  const [openingStart, setOpeningStart] = useState(savedPersona?.openingHours?.start ?? '')
  const [openingEnd, setOpeningEnd] = useState(savedPersona?.openingHours?.end ?? '')
  const [address, setAddress] = useState(savedPersona?.address ?? '')
  const [city, setCity] = useState(savedPersona?.city ?? '')
  const [state, setState] = useState(savedPersona?.state ?? '')
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean | undefined>(savedPersona?.deliveryAvailable)
  const [businessHours, setBusinessHours] = useState(savedPersona?.businessHours ?? '')
  const [serviceRegion, setServiceRegion] = useState(savedPersona?.serviceRegion ?? '')
  const [brandHighlight, setBrandHighlight] = useState(savedPersona?.brandHighlight ?? '')
  const [whatsapp, setWhatsapp] = useState(savedPersona?.whatsapp ?? savedPersona?.contactInfo ?? '')
  const [email, setEmail] = useState(savedPersona?.email ?? '')
  const [instagram, setInstagram] = useState(savedPersona?.instagram ?? '')
  const [facebook, setFacebook] = useState(savedPersona?.facebook ?? '')
  const [tiktok, setTiktok] = useState(savedPersona?.tiktok ?? '')
  const [site, setSite] = useState(savedPersona?.site ?? '')
  const [tone, setTone] = useState<ToneOption | null>(savedPersona?.tone ?? null)
  const [power, setPower] = useState<PowerOption | null>(savedPersona?.power ?? null)
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyleOption>(savedPersona?.voiceStyle ?? 'balanced')
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>(savedCatalog)
  const [catalogDraft, setCatalogDraft] = useState<CatalogDraft>(createEmptyCatalogDraft())
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const isReady = Boolean(brandName.trim() && tone && power)

  const sparkTone = useMemo(() => tone ?? 'divertido', [tone])
  const sparkPower = useMemo(() => power ?? 'atração', [power])
  const businessDescriptionLength = businessDescription.trim().length

  const handleCatalogDraftChange = <K extends keyof CatalogDraft>(field: K, value: CatalogDraft[K]) => {
    setCatalogDraft((currentDraft) => ({ ...currentDraft, [field]: value }))
  }

  const handleCatalogSave = () => {
    const normalizedItem = normalizeCatalogItem({
      id: editingCatalogId ?? undefined,
      name: catalogDraft.name,
      description: catalogDraft.description,
      image: catalogDraft.image,
      images: catalogDraft.images,
      stock: catalogDraft.stock ? Number(catalogDraft.stock) : undefined,
      availability: catalogDraft.availability,
      price: catalogDraft.price,
      highlight: catalogDraft.highlight,
      category: catalogDraft.category,
    })

    if (!normalizedItem) {
      setErrorMessage('Preencha nome e descricao do item para salvar o catalogo.')
      return
    }

    setCatalogItems((currentItems) => {
      const nextItems =
        editingCatalogId !== null
          ? currentItems.map((item) => (item.id === editingCatalogId ? normalizedItem : item))
          : [...currentItems, normalizedItem].slice(0, 6)

      return nextItems
    })
    setCatalogDraft(createEmptyCatalogDraft())
    setEditingCatalogId(null)
    if (errorMessage) {
      setErrorMessage('')
    }
  }

  const handleCatalogEdit = (item: CatalogItem) => {
    setEditingCatalogId(item.id)
    setCatalogDraft({
      name: item.name,
      description: item.description,
      image: item.image ?? '',
      images: item.images ?? [],
      stock: typeof item.stock === 'number' ? String(item.stock) : '',
      availability: item.availability ?? 'available',
      price: item.price ?? '',
      highlight: item.highlight ?? '',
      category: item.category ?? '',
    })
  }

  const handleCatalogRemove = (itemId: string) => {
    setCatalogItems((currentItems) => currentItems.filter((item) => item.id !== itemId))
    if (editingCatalogId === itemId) {
      setEditingCatalogId(null)
      setCatalogDraft(createEmptyCatalogDraft())
    }
  }

  const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    setLogo(await readFileAsDataUrl(selectedFile))
    event.target.value = ''
  }

  const handleInstitutionalImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    setInstitutionalImage(await readFileAsDataUrl(selectedFile))
    event.target.value = ''
  }

  const handleCatalogImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    const nextImage = await readFileAsDataUrl(selectedFile)
    setCatalogDraft((currentDraft) => ({ ...currentDraft, image: nextImage }))
    event.target.value = ''
  }

  const handleCatalogAdditionalImagesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles || selectedFiles.length === 0) {
      return
    }

    const nextImages = await readFilesAsDataUrls(selectedFiles, 3)
    setCatalogDraft((currentDraft) => ({ ...currentDraft, images: nextImages }))
    event.target.value = ''
  }

  const handleCreatePersona = () => {
    const trimmedBrandName = brandName.trim()
    if (!trimmedBrandName || !tone || !power) {
      setErrorMessage('Preencha o nome da marca e escolha a personalidade e a energia.')
      return
    }

    saveBrandPersona({
      brandName: trimmedBrandName,
      logo: logo || undefined,
      tone,
      power,
      voiceStyle,
      businessDescription: businessDescription.trim() || undefined,
      institutionalImage: institutionalImage || undefined,
      openingHours: openingStart && openingEnd ? { start: openingStart, end: openingEnd } : undefined,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      deliveryAvailable,
      businessHours: businessHours.trim() || undefined,
      serviceRegion: serviceRegion.trim() || undefined,
      brandHighlight: brandHighlight.trim() || undefined,
      whatsapp: whatsapp.trim() || undefined,
      email: email.trim() || undefined,
      instagram: instagram.trim() || undefined,
      facebook: facebook.trim() || undefined,
      tiktok: tiktok.trim() || undefined,
      site: site.trim() || undefined,
      contactInfo: whatsapp.trim() || undefined,
    })
    saveCatalogItems(catalogItems)

    navigateTo('/admin')
  }

  return (
    <main className="persona-page-shell">
      <motion.section
        className="persona-page-panel"
        initial={{ opacity: 0, scale: 0.98, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <div className="persona-copy-block">
          <div className="eyebrow">Nascimento da Centelha</div>
          <h1 className="persona-title">
            A sua marca não precisa só de presença.
            <br />
            Ela precisa de uma alma.
          </h1>
          <p className="persona-subtitle">Crie a Centelha que vai dar vida à sua marca.</p>
        </div>

        <div className="persona-spark-wrap">
          <Spark state="idle" tone={sparkTone} power={sparkPower} />
        </div>

        <div className="persona-experience-form">
          <div className="persona-field">
            <label className="persona-label" htmlFor="brandName">
              Nome da marca
            </label>
            <input
              id="brandName"
              className="persona-input"
              value={brandName}
              onChange={(event) => {
                setBrandName(event.target.value)
                if (errorMessage) {
                  setErrorMessage('')
                }
              }}
              placeholder="Como sua marca se chama?"
              autoComplete="off"
            />
          </div>

          <div className="persona-field">
            <label className="persona-label" htmlFor="logoUpload">
              Logo da marca
            </label>
            <div className="admin-image-panel compact">
              <div className="brand-logo-upload-preview">
                {logo ? <img src={logo} alt={`Logo de ${brandName || 'marca'}`} className="brand-logo-image" /> : <div className="brand-logo-fallback">{(brandName || 'BS').slice(0, 2).toUpperCase()}</div>}
              </div>
              <label className="persona-field admin-upload-field" htmlFor="logoUpload">
                <span className="persona-label">Arquivo da logo</span>
                <input id="logoUpload" className="persona-input" type="file" accept="image/*" onChange={handleLogoChange} />
              </label>
            </div>
          </div>

          <div className="persona-field">
            <label className="persona-label" htmlFor="businessDescription">
              O que a sua marca faz?
            </label>
            <textarea
              id="businessDescription"
              className="persona-input persona-textarea"
              value={businessDescription}
              onChange={(event) => setBusinessDescription(event.target.value.slice(0, BUSINESS_DESCRIPTION_MAX_LENGTH))}
              placeholder="Ex: vendemos roupas femininas, somos uma clínica odontológica, temos um restaurante japonês"
              rows={3}
              maxLength={BUSINESS_DESCRIPTION_MAX_LENGTH}
            />
            <div className="persona-field-meta" aria-live="polite">
              <span className="persona-field-hint">Contexto curto para deixar a Centelha mais específica logo na abertura.</span>
              <span className="persona-counter">
                {businessDescriptionLength}/{BUSINESS_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          </div>

          <section className="persona-knowledge-section" aria-label="Informações da marca opcionais">
            <div className="persona-knowledge-copy">
              <div className="persona-label">Informações da marca (opcional)</div>
              <p>Detalhes rápidos para deixar a Centelha mais útil sem transformar a experiência em formulário.</p>
            </div>

            <div className="persona-field">
              <div className="persona-label">Atende por delivery?</div>
              <div className="persona-toggle-row">
                <button
                  type="button"
                  className={`persona-toggle ${deliveryAvailable === true ? 'selected' : ''}`}
                  onClick={() => setDeliveryAvailable(true)}
                >
                  Sim
                </button>
                <button
                  type="button"
                  className={`persona-toggle ${deliveryAvailable === false ? 'selected' : ''}`}
                  onClick={() => setDeliveryAvailable(false)}
                >
                  Não
                </button>
                <button
                  type="button"
                  className={`persona-toggle subtle ${deliveryAvailable === undefined ? 'selected' : ''}`}
                  onClick={() => setDeliveryAvailable(undefined)}
                >
                  Agora não
                </button>
              </div>
            </div>

            <div className="persona-knowledge-grid">
              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="openingStart">
                  <span>🕘</span>
                  <span>Abertura</span>
                </label>
                <input id="openingStart" className="persona-input" type="time" value={openingStart} onChange={(event) => setOpeningStart(event.target.value)} />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="openingEnd">
                  <span>🕕</span>
                  <span>Fechamento</span>
                </label>
                <input id="openingEnd" className="persona-input" type="time" value={openingEnd} onChange={(event) => setOpeningEnd(event.target.value)} />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="businessHours">
                  <span>⏰</span>
                  <span>Horário de funcionamento</span>
                </label>
                <input
                  id="businessHours"
                  className="persona-input"
                  value={businessHours}
                  onChange={(event) => setBusinessHours(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: 18h às 23h"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="serviceRegion">
                  <span>📍</span>
                  <span>Região de atendimento</span>
                </label>
                <input
                  id="serviceRegion"
                  className="persona-input"
                  value={serviceRegion}
                  onChange={(event) => setServiceRegion(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: Belo Horizonte"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="brandHighlight">
                  <span>⭐</span>
                  <span>Diferencial da marca</span>
                </label>
                <input
                  id="brandHighlight"
                  className="persona-input"
                  value={brandHighlight}
                  onChange={(event) => setBrandHighlight(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: sushi artesanal premium"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="whatsapp">
                  <span>💬</span>
                  <span>WhatsApp</span>
                </label>
                <input
                  id="whatsapp"
                  className="persona-input"
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: (31) 99999-0000 ou https://wa.me/5531999990000"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>
            </div>

            <div className="persona-knowledge-grid">
              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="address">
                  <span>📍</span>
                  <span>Endereco</span>
                </label>
                <input
                  id="address"
                  className="persona-input"
                  value={address}
                  onChange={(event) => setAddress(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: Rua X, 123"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="city">
                  <span>🏙️</span>
                  <span>Cidade</span>
                </label>
                <input
                  id="city"
                  className="persona-input"
                  value={city}
                  onChange={(event) => setCity(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: Belo Horizonte"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="state">
                  <span>🧭</span>
                  <span>Estado</span>
                </label>
                <input
                  id="state"
                  className="persona-input"
                  value={state}
                  onChange={(event) => setState(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: MG"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="email">
                  <span>✉️</span>
                  <span>Email</span>
                </label>
                <input
                  id="email"
                  className="persona-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: contato@suaempresa.com"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="instagram">
                  <span>📸</span>
                  <span>Instagram</span>
                </label>
                <input
                  id="instagram"
                  className="persona-input"
                  value={instagram}
                  onChange={(event) => setInstagram(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: @vistaverde"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="facebook">
                  <span>f</span>
                  <span>Facebook</span>
                </label>
                <input
                  id="facebook"
                  className="persona-input"
                  value={facebook}
                  onChange={(event) => setFacebook(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: /vistaverde"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="tiktok">
                  <span>♪</span>
                  <span>TikTok</span>
                </label>
                <input
                  id="tiktok"
                  className="persona-input"
                  value={tiktok}
                  onChange={(event) => setTiktok(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: @vistaverde"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>

              <div className="persona-field">
                <label className="persona-label persona-inline-label" htmlFor="site">
                  <span>🔗</span>
                  <span>Site</span>
                </label>
                <input
                  id="site"
                  className="persona-input"
                  value={site}
                  onChange={(event) => setSite(event.target.value.slice(0, BRAND_KNOWLEDGE_MAX_LENGTH))}
                  placeholder="Ex: https://suaempresa.com"
                  autoComplete="off"
                  maxLength={BRAND_KNOWLEDGE_MAX_LENGTH}
                />
              </div>
            </div>

            <div className="admin-image-panel compact">
              <div className="admin-image-preview-shell product">
                {institutionalImage ? <img src={institutionalImage} alt={`Imagem institucional de ${brandName || 'marca'}`} className="admin-image-preview" /> : <div className="admin-image-placeholder">Imagem institucional</div>}
              </div>
              <label className="persona-field admin-upload-field">
                <span className="persona-label">Foto institucional</span>
                <input className="persona-input" type="file" accept="image/*" onChange={handleInstitutionalImageChange} />
              </label>
            </div>
          </section>

          <section className="persona-knowledge-section" aria-label="Catalogo inicial">
            <div className="persona-knowledge-copy">
              <div className="persona-label">Catalogo inicial</div>
              <p>Monte uma vitrine simples agora. Se preferir, voce pode ajustar isso depois no admin.</p>
            </div>

            <div className="persona-knowledge-grid">
              <div className="persona-field">
                <label className="persona-label" htmlFor="catalogTitle">
                  Nome do item
                </label>
                <input
                  id="catalogTitle"
                  className="persona-input"
                  value={catalogDraft.name}
                  onChange={(event) => handleCatalogDraftChange('name', event.target.value)}
                  placeholder="Ex: Selecao Essencial"
                  autoComplete="off"
                />
              </div>

              <div className="persona-field">
                <label className="persona-label" htmlFor="catalogCategory">
                  Categoria
                </label>
                <input
                  id="catalogCategory"
                  className="persona-input"
                  value={catalogDraft.category}
                  onChange={(event) => handleCatalogDraftChange('category', event.target.value)}
                  placeholder="Ex: Selecao"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="persona-field">
              <label className="persona-label" htmlFor="catalogDescription">
                Descricao
              </label>
              <textarea
                id="catalogDescription"
                className="persona-input persona-textarea"
                value={catalogDraft.description}
                onChange={(event) => handleCatalogDraftChange('description', event.target.value)}
                placeholder="Ex: Uma opcao completa para quem quer encontrar a melhor escolha com facilidade."
                rows={3}
              />
            </div>

            <div className="persona-knowledge-grid">
              <div className="persona-field">
                <label className="persona-label" htmlFor="catalogPrice">
                  Preco
                </label>
                <input
                  id="catalogPrice"
                  className="persona-input"
                  value={catalogDraft.price}
                  onChange={(event) => handleCatalogDraftChange('price', event.target.value)}
                  placeholder="Ex: R$ 59,90"
                  autoComplete="off"
                />
              </div>

              <div className="persona-field">
                <label className="persona-label" htmlFor="catalogHighlight">
                  Selo
                </label>
                <input
                  id="catalogHighlight"
                  className="persona-input"
                  value={catalogDraft.highlight}
                  onChange={(event) => handleCatalogDraftChange('highlight', event.target.value)}
                  placeholder="Ex: Mais pedido"
                  autoComplete="off"
                />
              </div>

              <div className="persona-field">
                <label className="persona-label" htmlFor="catalogStock">
                  Estoque
                </label>
                <input
                  id="catalogStock"
                  className="persona-input"
                  type="number"
                  min="0"
                  value={catalogDraft.stock}
                  onChange={(event) => handleCatalogDraftChange('stock', event.target.value)}
                  placeholder="Ex: 8"
                />
              </div>

              <div className="persona-field">
                <label className="persona-label" htmlFor="catalogAvailability">
                  Disponibilidade
                </label>
                <select
                  id="catalogAvailability"
                  className="persona-input"
                  value={catalogDraft.availability}
                  onChange={(event) => handleCatalogDraftChange('availability', event.target.value as CatalogAvailability)}
                >
                  <option value="available">Disponivel</option>
                  <option value="low">Poucas unidades</option>
                  <option value="out">Esgotado</option>
                </select>
              </div>
            </div>

            <div className="admin-image-panel compact">
              <div className="admin-image-preview-shell product">
                {catalogDraft.image ? <img src={catalogDraft.image} alt={catalogDraft.name || 'Imagem do item'} className="admin-image-preview" /> : <div className="admin-image-placeholder">Imagem principal</div>}
              </div>
              <div className="persona-field admin-upload-stack">
                <label className="persona-field admin-upload-field">
                  <span className="persona-label">Imagem principal</span>
                  <input className="persona-input" type="file" accept="image/*" onChange={handleCatalogImageChange} />
                </label>
                <label className="persona-field admin-upload-field">
                  <span className="persona-label">Imagens adicionais</span>
                  <input className="persona-input" type="file" accept="image/*" multiple onChange={handleCatalogAdditionalImagesChange} />
                </label>
                {catalogDraft.images.length > 0 ? (
                  <div className="product-thumb-grid">
                    {catalogDraft.images.map((image, index) => (
                      <img key={`${image}-${index}`} src={image} alt={`Imagem adicional ${index + 1}`} className="product-thumb" />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="persona-action-row">
              <button type="button" className="persona-submit" onClick={handleCatalogSave}>
                {editingCatalogId ? 'Atualizar item' : 'Adicionar item'}
              </button>
              {editingCatalogId ? (
                <button
                  type="button"
                  className="persona-toggle subtle"
                  onClick={() => {
                    setEditingCatalogId(null)
                    setCatalogDraft(createEmptyCatalogDraft())
                  }}
                >
                  Cancelar edicao
                </button>
              ) : null}
            </div>

            {catalogItems.length > 0 ? (
              <div className="admin-catalog-list">
                {catalogItems.map((item) => (
                  <article key={item.id} className="admin-catalog-item">
                    <div className="admin-catalog-item-copy">
                      <strong>{item.name}</strong>
                      <span>{item.description}</span>
                    </div>
                    <div className="admin-catalog-actions">
                      <button type="button" className="chat-header-button subtle" onClick={() => handleCatalogEdit(item)}>
                        Editar
                      </button>
                      <button type="button" className="chat-header-button subtle" onClick={() => handleCatalogRemove(item.id)}>
                        Remover
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <div className="persona-field">
            <div className="persona-label">Personalidade</div>
            <div className="persona-chip-grid">
              {toneOptions.map((option) => {
                const isSelected = tone === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`persona-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setTone(option.value)
                      if (errorMessage) {
                        setErrorMessage('')
                      }
                    }}
                  >
                    <span>{option.label}</span>
                    <strong>{option.emoji}</strong>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="persona-field">
            <div className="persona-label">Energia</div>
            <div className="persona-chip-grid">
              {powerOptions.map((option) => {
                const isSelected = power === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`persona-chip ${isSelected ? 'selected power' : 'power'}`}
                    onClick={() => {
                      setPower(option.value)
                      if (errorMessage) {
                        setErrorMessage('')
                      }
                    }}
                  >
                    <span>{option.label}</span>
                    <strong>{option.emoji}</strong>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="persona-field">
            <div className="persona-label">Como eu me comunico</div>
            <div className="persona-style-grid">
              {voiceStyleOptions.map((option) => {
                const isSelected = voiceStyle === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`persona-style-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setVoiceStyle(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                )
              })}
            </div>
            {voiceStyle === 'irreverent' ? (
              <div className="persona-voice-warning">
                Esse estilo usa humor e uma linguagem mais ousada. Ative apenas se isso fizer sentido para sua marca.
              </div>
            ) : null}
          </div>

          <div className="persona-action-row">
            <button
              type="button"
              className="persona-submit"
              onClick={handleCreatePersona}
              disabled={!isReady}
            >
              Dar vida à minha Centelha
            </button>

            {errorMessage ? <p className="persona-error">{errorMessage}</p> : null}
          </div>
        </div>
      </motion.section>
    </main>
  )
}
