import { useEffect, useMemo, useState } from 'react'

import AdminOfficeLayout from '../components/AdminOfficeLayout'
import SurfaceCard from '../components/SurfaceCard'
import FeedbackBanner from '../components/FeedbackBanner'
import {
  activateRegionalCampaign,
  createRegionalCampaign,
  listRegionalCampaigns,
  type RegionalCampaign,
} from '../backend-bridge/api/regionalGrowthApi'

export default function AdminOfficeGrowthPage({ officeId }: { officeId: string }) {
  const [campaigns, setCampaigns] = useState<RegionalCampaign[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    campaignName: '',
    city: '',
    state: '',
    specialty: '',
    objective: 'lead_capture' as const,
  })
  const [isCreating, setIsCreating] = useState(false)

  async function loadCampaigns() {
    setIsLoading(true)
    setActionError(null)

    try {
      const payload = await listRegionalCampaigns()
      setCampaigns(payload.filter((campaign) => campaign.entityId === officeId))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao carregar campanhas.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadCampaigns()
  }, [officeId])

  const summary = useMemo(() => {
    return campaigns.reduce(
      (acc, campaign) => ({
        active: acc.active + (campaign.status === 'active' ? 1 : 0),
        visits: acc.visits + campaign.clicks,
        leads: acc.leads + campaign.leadsReceived,
        conversions: acc.conversions + campaign.conversions,
        seoPages: acc.seoPages + (campaign.seoPagesGenerated ? 1 : 0),
      }),
      { active: 0, visits: 0, leads: 0, conversions: 0, seoPages: 0 },
    )
  }, [campaigns])

  async function handleCreateCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)
    setIsCreating(true)

    try {
      await createRegionalCampaign({
        entityId: officeId,
        campaignName: draft.campaignName.trim(),
        cities: draft.city.trim() ? [draft.city.trim()] : [],
        states: draft.state.trim() ? [draft.state.trim()] : [],
        specialties: draft.specialty.trim() ? [draft.specialty.trim()] : [],
        objective: draft.objective,
      })

      setDraft({
        campaignName: '',
        city: '',
        state: '',
        specialty: '',
        objective: 'lead_capture',
      })

      await loadCampaigns()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao criar campanha.')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleActivate(campaignId: string) {
    setActionError(null)

    try {
      await activateRegionalCampaign(campaignId)
      await loadCampaigns()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao ativar campanha.')
    }
  }

  return (
    <AdminOfficeLayout
      officeId={officeId}
      section="crescimento"
      title="Crescimento regional"
      subtitle="Campanhas locais, páginas SEO e geração de demanda para o escritório."
    >
      {actionError ? <FeedbackBanner tone="error">{actionError}</FeedbackBanner> : null}

      <div className="admin-diagnosis-grid">
        <SurfaceCard tone="admin">
          <strong>{summary.active}</strong>
          <span>campanhas ativas</span>
        </SurfaceCard>
        <SurfaceCard tone="admin">
          <strong>{summary.seoPages}</strong>
          <span>grupos SEO gerados</span>
        </SurfaceCard>
        <SurfaceCard tone="admin">
          <strong>{summary.visits}</strong>
          <span>visitas SEO</span>
        </SurfaceCard>
        <SurfaceCard tone="admin">
          <strong>{summary.leads}</strong>
          <span>leads regionais</span>
        </SurfaceCard>
        <SurfaceCard tone="admin">
          <strong>{summary.conversions}</strong>
          <span>conversões</span>
        </SurfaceCard>
      </div>

      <SurfaceCard tone="admin">
        <h2>Criar campanha regional</h2>
        <p>Defina uma cidade, especialidade e objetivo. Ao ativar, o Growth gera a landing SEO automaticamente.</p>

        <form className="admin-form-section" onSubmit={(event) => void handleCreateCampaign(event)}>
          <label className="admin-field">
            <span>Nome da campanha</span>
            <input
              value={draft.campaignName}
              onChange={(event) => setDraft((current) => ({ ...current, campaignName: event.target.value }))}
              placeholder="Ex.: Trabalhista em Belo Horizonte"
              required
            />
          </label>

          <div className="admin-diagnosis-grid">
            <label className="admin-field">
              <span>Cidade</span>
              <input
                value={draft.city}
                onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))}
                placeholder="Belo Horizonte"
                required
              />
            </label>

            <label className="admin-field">
              <span>Estado</span>
              <input
                value={draft.state}
                onChange={(event) => setDraft((current) => ({ ...current, state: event.target.value }))}
                placeholder="MG"
              />
            </label>

            <label className="admin-field">
              <span>Especialidade</span>
              <input
                value={draft.specialty}
                onChange={(event) => setDraft((current) => ({ ...current, specialty: event.target.value }))}
                placeholder="trabalhista"
                required
              />
            </label>

            <label className="admin-field">
              <span>Objetivo</span>
              <select
                value={draft.objective}
                onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value as typeof draft.objective }))}
              >
                <option value="lead_capture">Captura de leads</option>
                <option value="visibility">Visibilidade</option>
                <option value="emergency_24h">Emergência 24h</option>
                <option value="institutional">Institucional</option>
              </select>
            </label>
          </div>

          <div className="admin-actions">
            <button type="submit" className="admin-button" disabled={isCreating}>
              {isCreating ? 'Criando...' : 'Criar campanha'}
            </button>
          </div>
        </form>
      </SurfaceCard>

      {isLoading ? (
        <FeedbackBanner>Carregando motor regional...</FeedbackBanner>
      ) : campaigns.length === 0 ? (
        <SurfaceCard tone="admin">
          <h2>Nenhuma campanha regional ainda</h2>
          <p>
            A infraestrutura Growth já está ativa. O próximo passo é criar um
            construtor de campanha para cidade, especialidade e objetivo.
          </p>
        </SurfaceCard>
      ) : (
        <div className="admin-grid">
          {campaigns.map((campaign) => (
            <SurfaceCard key={campaign.id} tone="admin">
              <div className="admin-card-header">
                <h2>{campaign.campaignName}</h2>
                <span>{campaign.status}</span>
              </div>

              <p>{campaign.cities.join(', ') || 'Sem cidades definidas'}</p>
              <p>{campaign.specialties.join(', ') || 'Sem especialidades definidas'}</p>

              <div className="admin-actions">
                {campaign.status !== 'active' ? (
                  <button type="button" className="admin-button" onClick={() => void handleActivate(campaign.id)}>
                    Ativar e gerar SEO
                  </button>
                ) : null}
                <a className="admin-button admin-button--ghost" href="/sitemap.xml" target="_blank" rel="noreferrer">
                  Ver sitemap
                </a>
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}
    </AdminOfficeLayout>
  )
}
