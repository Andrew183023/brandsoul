import { useEffect, useMemo, useState } from 'react'

import AdminOfficeLayout from '../components/AdminOfficeLayout'
import SurfaceCard from '../components/SurfaceCard'
import FeedbackBanner from '../components/FeedbackBanner'
import {
  activateRegionalCampaign,
  createCampaignTarget,
  createRegionalCampaign,
  deleteCampaignTarget,
  executeGrowthRecommendation,
  getGrowthEconomicSummary,
  getGrowthInsights,
  getRadiusRecommendation,
  listGrowthRecommendations,
  listRegionalSignals,
  listRegionalCampaigns,
  listCampaignTargets,
  type GrowthEconomicSummary,
  type GrowthInsightRankItem,
  type GrowthInsights,
  type GrowthRecommendation,
  type PopulationDensity,
  type RegionalCampaign,
  type RegionalCampaignTarget,
  type RegionalSignal,
  recalculateRegionalSignals,
} from '../backend-bridge/api/regionalGrowthApi'
import {
  convertRegionalLeadToCase,
  listRegionalLeadsByEntity,
  type RegionalLead,
} from '../backend-bridge/api/regionalLeadApi'

type CampaignTargetDraft = {
  channel: RegionalCampaignTarget['channel']
  audienceName: string
  audienceDescription: string
  intentStage: RegionalCampaignTarget['intentStage']
  searchIntent: NonNullable<RegionalCampaignTarget['searchIntent']>
  populationDensity: PopulationDensity
  recommendedRadiusKm: string
}

function createEmptyTargetDraft(): CampaignTargetDraft {
  return {
    channel: 'google_search',
    audienceName: '',
    audienceDescription: '',
    intentStage: 'consideration',
    searchIntent: 'provider_aware',
    populationDensity: 'medium',
    recommendedRadiusKm: '',
  }
}

export default function AdminOfficeGrowthPage({ officeId }: { officeId: string }) {
  const [campaigns, setCampaigns] = useState<RegionalCampaign[]>([])
  const [leads, setLeads] = useState<RegionalLead[]>([])
  const [signals, setSignals] = useState<RegionalSignal[]>([])
  const [insights, setInsights] = useState<GrowthInsights | null>(null)
  const [economicSummary, setEconomicSummary] = useState<GrowthEconomicSummary | null>(null)
  const [recommendations, setRecommendations] = useState<GrowthRecommendation[]>([])
  const [targetsByCampaign, setTargetsByCampaign] = useState<Record<string, RegionalCampaignTarget[]>>({})
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
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null)
  const [executingRecommendationId, setExecutingRecommendationId] = useState<string | null>(null)
  const [creatingTargetCampaignId, setCreatingTargetCampaignId] = useState<string | null>(null)
  const [deletingTargetId, setDeletingTargetId] = useState<string | null>(null)
  const [suggestingRadiusCampaignId, setSuggestingRadiusCampaignId] = useState<string | null>(null)
  const [isRecalculatingSignals, setIsRecalculatingSignals] = useState(false)
  const [targetDrafts, setTargetDrafts] = useState<Record<string, CampaignTargetDraft>>({})
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  async function loadGrowthData() {
    setIsLoading(true)
    setActionError(null)

    try {
      const [campaignPayload, leadPayload, signalPayload, insightsPayload, economicSummaryPayload, recommendationPayload] = await Promise.all([
        listRegionalCampaigns(),
        listRegionalLeadsByEntity(officeId),
        listRegionalSignals(officeId),
        getGrowthInsights(officeId),
        getGrowthEconomicSummary(officeId),
        listGrowthRecommendations(officeId),
      ])
      const officeCampaigns = campaignPayload.filter((campaign) => campaign.entityId === officeId)
      const targetEntries = await Promise.all(
        officeCampaigns.map(async (campaign) => [campaign.id, await listCampaignTargets(campaign.id)] as const),
      )

      setCampaigns(officeCampaigns)
      setLeads(leadPayload)
      setSignals(signalPayload)
      setInsights(insightsPayload)
      setEconomicSummary(economicSummaryPayload)
      setRecommendations(recommendationPayload)
      setTargetsByCampaign(Object.fromEntries(targetEntries))
      setTargetDrafts((current) => {
        const next: Record<string, CampaignTargetDraft> = {}
        for (const campaign of officeCampaigns) {
          next[campaign.id] = current[campaign.id] ?? createEmptyTargetDraft()
        }
        return next
      })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao carregar dados de crescimento.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleRecalculateSignals() {
    setActionError(null)
    setActionSuccess(null)
    setIsRecalculatingSignals(true)

    try {
      const nextSignals = await recalculateRegionalSignals(officeId)
      const nextInsights = await getGrowthInsights(officeId)
      const nextEconomicSummary = await getGrowthEconomicSummary(officeId)
      const nextRecommendations = await listGrowthRecommendations(officeId)
      setSignals(nextSignals)
      setInsights(nextInsights)
      setEconomicSummary(nextEconomicSummary)
      setRecommendations(nextRecommendations)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao recalcular sinais.')
    } finally {
      setIsRecalculatingSignals(false)
    }
  }

  useEffect(() => {
    void loadGrowthData()
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
    setActionSuccess(null)
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

      await loadGrowthData()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao criar campanha.')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleActivate(campaignId: string) {
    setActionError(null)
    setActionSuccess(null)

    try {
      await activateRegionalCampaign(campaignId)
      await loadGrowthData()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao ativar campanha.')
    }
  }

  async function handleConvertLead(leadId: string) {
    setActionError(null)
    setActionSuccess(null)
    setConvertingLeadId(leadId)

    try {
      await convertRegionalLeadToCase(leadId)
      await loadGrowthData()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao converter lead em caso.')
    } finally {
      setConvertingLeadId(null)
    }
  }

  function describeLeadOrigin(lead: RegionalLead) {
    if (lead.utmSource || lead.utmCampaign) {
      return [lead.utmSource, lead.utmCampaign].filter(Boolean).join(' / ')
    }

    if (lead.referrer) {
      return lead.referrer
    }

    return 'origem direta'
  }

  function renderInsightRank(title: string, items: GrowthInsightRankItem[]) {
    return (
      <SurfaceCard tone="admin">
        <h2>{title}</h2>
        {items.length === 0 ? (
          <p>Sem dados suficientes ainda.</p>
        ) : (
          <div className="admin-form-section">
            {items.slice(0, 5).map((item) => (
              <p key={`${title}-${item.label}`}>
                <strong>{item.label}:</strong> {item.score}
              </p>
            ))}
          </div>
        )}
      </SurfaceCard>
    )
  }

  async function handleSuggestRadius(campaign: RegionalCampaign) {
    setActionError(null)
    setActionSuccess(null)
    setSuggestingRadiusCampaignId(campaign.id)

    try {
      const draft = targetDrafts[campaign.id] ?? createEmptyTargetDraft()
      const specialty = campaign.specialties[0] ?? draft.audienceName
      const recommendation = await getRadiusRecommendation(specialty, draft.populationDensity)
      setTargetDrafts((current) => ({
        ...current,
        [campaign.id]: {
          ...(current[campaign.id] ?? createEmptyTargetDraft()),
          recommendedRadiusKm: String(recommendation.recommendedRadiusKm),
        },
      }))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao sugerir raio.')
    } finally {
      setSuggestingRadiusCampaignId(null)
    }
  }

  async function handleCreateTarget(campaignId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)
    setActionSuccess(null)
    setCreatingTargetCampaignId(campaignId)

    try {
      const draft = targetDrafts[campaignId] ?? createEmptyTargetDraft()
      await createCampaignTarget(campaignId, {
        channel: draft.channel,
        audienceName: draft.audienceName.trim(),
        audienceDescription: draft.audienceDescription.trim() || undefined,
        intentStage: draft.intentStage,
        searchIntent: draft.searchIntent,
        recommendedRadiusKm: Number(draft.recommendedRadiusKm),
      })
      setTargetDrafts((current) => ({
        ...current,
        [campaignId]: createEmptyTargetDraft(),
      }))
      await loadGrowthData()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao criar público da campanha.')
    } finally {
      setCreatingTargetCampaignId(null)
    }
  }

  async function handleDeleteTarget(targetId: string) {
    setActionError(null)
    setActionSuccess(null)
    setDeletingTargetId(targetId)

    try {
      await deleteCampaignTarget(targetId)
      await loadGrowthData()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao remover público da campanha.')
    } finally {
      setDeletingTargetId(null)
    }
  }

  async function handleExecuteRecommendation(recommendation: GrowthRecommendation) {
    setActionError(null)
    setActionSuccess(null)
    setExecutingRecommendationId(recommendation.id)

    try {
      const result = await executeGrowthRecommendation(officeId, recommendation.id)
      await loadGrowthData()
      setActionSuccess(`Oportunidade executada: campanha "${result.campaign.campaignName}" criada em draft.`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha ao executar oportunidade.')
    } finally {
      setExecutingRecommendationId(null)
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
      {actionSuccess ? <FeedbackBanner tone="success">{actionSuccess}</FeedbackBanner> : null}

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

      <SurfaceCard tone="admin">
        <div className="admin-card-header">
          <h2>Leads regionais recentes</h2>
          <a className="admin-button admin-button--ghost" href={`/admin/escritorios/${officeId}/casos`}>
            Ir para casos
          </a>
        </div>

        {leads.length === 0 ? (
          <p>Nenhum lead regional capturado ainda.</p>
        ) : (
          <div className="admin-grid">
            {leads.map((lead) => (
              <SurfaceCard key={lead.id} tone="admin">
                <div className="admin-card-header">
                  <h2>{lead.name}</h2>
                  <span>{lead.status}</span>
                </div>

                <p><strong>Telefone:</strong> {lead.phone}</p>
                <p><strong>Cidade:</strong> {lead.city}</p>
                <p><strong>Especialidade:</strong> {lead.specialty}</p>
                <p><strong>Urgência:</strong> {lead.urgency}</p>
                <p><strong>Origem:</strong> {describeLeadOrigin(lead)}</p>
                <p><strong>Resumo:</strong> {lead.caseSummary}</p>

                <div className="admin-actions">
                  {lead.convertedCaseId ? (
                    <a className="admin-button" href={`/admin/escritorios/${officeId}/casos`}>
                      Ver caso convertido
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="admin-button"
                      disabled={convertingLeadId === lead.id}
                      onClick={() => void handleConvertLead(lead.id)}
                    >
                      {convertingLeadId === lead.id ? 'Convertendo...' : 'Converter em caso'}
                    </button>
                  )}
                </div>
              </SurfaceCard>
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard tone="admin">
        <div className="admin-card-header">
          <h2>Inteligência Growth</h2>
        </div>

        {!insights || insights.totalSignals === 0 ? (
          <p>Inteligência Growth será exibida após recalcular sinais.</p>
        ) : (
          <>
            <div className="admin-diagnosis-grid">
              <SurfaceCard tone="admin">
                <strong>{insights.totalSignals}</strong>
                <span>sinais detectados</span>
              </SurfaceCard>
              <SurfaceCard tone="admin">
                <strong>{insights.totalVisits}</strong>
                <span>visitas</span>
              </SurfaceCard>
              <SurfaceCard tone="admin">
                <strong>{insights.totalLeads}</strong>
                <span>leads</span>
              </SurfaceCard>
              <SurfaceCard tone="admin">
                <strong>{insights.totalCases}</strong>
                <span>casos</span>
              </SurfaceCard>
              <SurfaceCard tone="admin">
                <strong>{(insights.leadToCaseRate * 100).toFixed(1)}%</strong>
                <span>lead → caso</span>
              </SurfaceCard>
              <SurfaceCard tone="admin">
                <strong>{insights.expansionScore}</strong>
                <span>score de expansão</span>
              </SurfaceCard>
            </div>

            <div className="admin-grid">
              {renderInsightRank('Top cidades', insights.topCities)}
              {renderInsightRank('Top especialidades', insights.topSpecialties)}
              {renderInsightRank('Top canais', insights.topChannels)}
              {renderInsightRank('Top públicos', insights.topAudiences)}
              {renderInsightRank('Top intenções', insights.topIntentStages)}
              {renderInsightRank('Top search intents', insights.topSearchIntents)}
            </div>
          </>
        )}
      </SurfaceCard>

      <SurfaceCard tone="admin">
        <div className="admin-card-header">
          <h2>Economic Intelligence</h2>
        </div>

        {!economicSummary || (
          economicSummary.totalAttributedRevenue === 0
          && economicSummary.totalEconomicMemories === 0
          && economicSummary.totalOpportunities === 0
        ) ? (
          <p>Sem memória econômica suficiente ainda.</p>
        ) : (
          <div className="admin-diagnosis-grid">
            <SurfaceCard tone="admin">
              <strong>R$ {economicSummary.totalAttributedRevenue.toFixed(2)}</strong>
              <span>receita atribuída</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{(economicSummary.averageConversionRate * 100).toFixed(1)}%</strong>
              <span>conversão média</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{economicSummary.totalEconomicMemories}</strong>
              <span>memórias econômicas</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{economicSummary.totalOpportunities}</strong>
              <span>oportunidades econômicas</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{economicSummary.averageOpportunityScore.toFixed(1)}</strong>
              <span>score médio de oportunidade</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{economicSummary.topRevenueCategory ?? 'n/a'}</strong>
              <span>top categoria econômica</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{economicSummary.topRevenueSignal ?? 'n/a'}</strong>
              <span>top sinal econômico</span>
            </SurfaceCard>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard tone="admin">
        <div className="admin-card-header">
          <h2>Recomendações de Expansão</h2>
        </div>

        {recommendations.length === 0 ? (
          <p>Nenhuma recomendação disponível ainda. Recalcule os sinais.</p>
        ) : (
          <div className="admin-grid">
            {recommendations.map((recommendation) => (
              <SurfaceCard key={recommendation.id} tone="admin">
                <div className="admin-card-header">
                  <h2>{recommendation.city}</h2>
                  <span>{recommendation.priority}</span>
                </div>
                <p><strong>Especialidade:</strong> {recommendation.specialty}</p>
                <p><strong>Canal recomendado:</strong> {recommendation.recommendedChannel ?? 'n/a'}</p>
                <p><strong>Público recomendado:</strong> {recommendation.recommendedAudience ?? 'n/a'}</p>
                <p><strong>Intenção recomendada:</strong> {recommendation.recommendedIntentStage ?? 'n/a'}</p>
                <p><strong>Search intent:</strong> {recommendation.recommendedSearchIntent ?? 'n/a'}</p>
                <p><strong>Raio recomendado:</strong> {typeof recommendation.recommendedRadiusKm === 'number' ? `${recommendation.recommendedRadiusKm}km` : 'n/a'}</p>
                <p><strong>Orçamento diário sugerido:</strong> R$ {recommendation.recommendedBudgetDaily}</p>
                <p><strong>Motivo:</strong> {recommendation.reason}</p>
                <div className="admin-actions">
                  <button
                    type="button"
                    className="admin-button"
                    disabled={executingRecommendationId === recommendation.id}
                    onClick={() => void handleExecuteRecommendation(recommendation)}
                  >
                    {executingRecommendationId === recommendation.id ? 'Executando...' : 'Executar oportunidade'}
                  </button>
                </div>
              </SurfaceCard>
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard tone="admin">
        <div className="admin-card-header">
          <h2>Oportunidades Detectadas</h2>
          <button
            type="button"
            className="admin-button"
            disabled={isRecalculatingSignals}
            onClick={() => void handleRecalculateSignals()}
          >
            {isRecalculatingSignals ? 'Recalculando sinais...' : 'Recalcular sinais'}
          </button>
        </div>

        {signals.length === 0 ? (
          <p>Nenhuma oportunidade detectada ainda.</p>
        ) : (
          <div className="admin-grid">
            {signals
              .slice()
              .sort((left, right) => right.signalScore - left.signalScore)
              .map((signal) => (
                <SurfaceCard key={signal.id} tone="admin">
                  <div className="admin-card-header">
                    <h2>{signal.city}</h2>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {signal.signalScore <= 1 && signal.leads === 0 && signal.cases === 0 ? (
                        <span>Bootstrap</span>
                      ) : null}
                      <span>score {signal.signalScore}</span>
                    </div>
                  </div>
                  <p><strong>Especialidade:</strong> {signal.specialty}</p>
                  <p><strong>Visitas:</strong> {signal.visits}</p>
                  <p><strong>Leads:</strong> {signal.leads}</p>
                  <p><strong>Casos:</strong> {signal.cases}</p>
                  <p><strong>Leads urgentes:</strong> {signal.urgentLeads}</p>
                  <p><strong>Urgency score:</strong> {signal.urgencyScore}</p>
                  {signal.signalScore <= 1 && signal.leads === 0 && signal.cases === 0 ? (
                    <p>Oportunidade inicial baseada na campanha.</p>
                  ) : null}
                  {signal.bestChannel ? <p><strong>Canal recomendado:</strong> {signal.bestChannel}</p> : null}
                  {signal.bestAudienceName ? <p><strong>Público recomendado:</strong> {signal.bestAudienceName}</p> : null}
                  {signal.bestIntentStage ? <p><strong>Intenção recomendada:</strong> {signal.bestIntentStage}</p> : null}
                  {signal.bestSearchIntent ? <p><strong>Search intent:</strong> {signal.bestSearchIntent}</p> : null}
                  {typeof signal.bestRecommendedRadiusKm === 'number' ? (
                    <p><strong>Raio recomendado:</strong> {signal.bestRecommendedRadiusKm}km</p>
                  ) : null}
                </SurfaceCard>
              ))}
          </div>
        )}
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

              <div className="admin-form-section">
                <h3>Campaign Targets</h3>
                {(targetsByCampaign[campaign.id] ?? []).length === 0 ? (
                  <p>Nenhum público-alvo configurado ainda.</p>
                ) : (
                  <div className="admin-grid">
                    {(targetsByCampaign[campaign.id] ?? []).map((target) => (
                      <SurfaceCard key={target.id} tone="admin">
                        <div className="admin-card-header">
                          <h2>{target.audienceName}</h2>
                          <span>{target.channel}</span>
                        </div>
                        <p><strong>Intenção:</strong> {target.intentStage}</p>
                        <p><strong>Search intent:</strong> {target.searchIntent ?? 'n/a'}</p>
                        <p><strong>Raio:</strong> {target.recommendedRadiusKm} km</p>
                        {target.audienceDescription ? <p>{target.audienceDescription}</p> : null}
                        <div className="admin-actions">
                          <button
                            type="button"
                            className="admin-button admin-button--ghost"
                            disabled={deletingTargetId === target.id}
                            onClick={() => void handleDeleteTarget(target.id)}
                          >
                            {deletingTargetId === target.id ? 'Removendo...' : 'Remover target'}
                          </button>
                        </div>
                      </SurfaceCard>
                    ))}
                  </div>
                )}

                <form className="admin-form-section" onSubmit={(event) => void handleCreateTarget(campaign.id, event)}>
                  <label className="admin-field">
                    <span>Canal</span>
                    <select
                      value={(targetDrafts[campaign.id] ?? createEmptyTargetDraft()).channel}
                      onChange={(event) => setTargetDrafts((current) => ({
                        ...current,
                        [campaign.id]: {
                          ...(current[campaign.id] ?? createEmptyTargetDraft()),
                          channel: event.target.value as RegionalCampaignTarget['channel'],
                        },
                      }))}
                    >
                      <option value="google_search">Google Search</option>
                      <option value="google_local">Google Local</option>
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                    </select>
                  </label>

                  <label className="admin-field">
                    <span>Público</span>
                    <input
                      value={(targetDrafts[campaign.id] ?? createEmptyTargetDraft()).audienceName}
                      onChange={(event) => setTargetDrafts((current) => ({
                        ...current,
                        [campaign.id]: {
                          ...(current[campaign.id] ?? createEmptyTargetDraft()),
                          audienceName: event.target.value,
                        },
                      }))}
                      placeholder="Ex.: Trabalhadores CLT com rescisão recente"
                      required
                    />
                  </label>

                  <label className="admin-field">
                    <span>Descrição do público</span>
                    <textarea
                      value={(targetDrafts[campaign.id] ?? createEmptyTargetDraft()).audienceDescription}
                      onChange={(event) => setTargetDrafts((current) => ({
                        ...current,
                        [campaign.id]: {
                          ...(current[campaign.id] ?? createEmptyTargetDraft()),
                          audienceDescription: event.target.value,
                        },
                      }))}
                      rows={3}
                    />
                  </label>

                  <div className="admin-diagnosis-grid">
                    <label className="admin-field">
                      <span>Intent Stage</span>
                      <select
                        value={(targetDrafts[campaign.id] ?? createEmptyTargetDraft()).intentStage}
                        onChange={(event) => setTargetDrafts((current) => ({
                          ...current,
                          [campaign.id]: {
                            ...(current[campaign.id] ?? createEmptyTargetDraft()),
                            intentStage: event.target.value as RegionalCampaignTarget['intentStage'],
                          },
                        }))}
                      >
                        <option value="awareness">Awareness</option>
                        <option value="consideration">Consideration</option>
                        <option value="decision">Decision</option>
                      </select>
                    </label>

                    <label className="admin-field">
                      <span>Search Intent</span>
                      <select
                        value={(targetDrafts[campaign.id] ?? createEmptyTargetDraft()).searchIntent}
                        onChange={(event) => setTargetDrafts((current) => ({
                          ...current,
                          [campaign.id]: {
                            ...(current[campaign.id] ?? createEmptyTargetDraft()),
                            searchIntent: event.target.value as NonNullable<RegionalCampaignTarget['searchIntent']>,
                          },
                        }))}
                      >
                        <option value="problem_aware">Problem aware</option>
                        <option value="solution_aware">Solution aware</option>
                        <option value="provider_aware">Provider aware</option>
                        <option value="ready_to_hire">Ready to hire</option>
                      </select>
                    </label>

                    <label className="admin-field">
                      <span>Densidade populacional</span>
                      <select
                        value={(targetDrafts[campaign.id] ?? createEmptyTargetDraft()).populationDensity}
                        onChange={(event) => setTargetDrafts((current) => ({
                          ...current,
                          [campaign.id]: {
                            ...(current[campaign.id] ?? createEmptyTargetDraft()),
                            populationDensity: event.target.value as PopulationDensity,
                          },
                        }))}
                      >
                        <option value="large">Grande</option>
                        <option value="medium">Média</option>
                        <option value="small">Pequena</option>
                      </select>
                    </label>

                    <label className="admin-field">
                      <span>Raio recomendado (km)</span>
                      <input
                        type="number"
                        min={1}
                        value={(targetDrafts[campaign.id] ?? createEmptyTargetDraft()).recommendedRadiusKm}
                        onChange={(event) => setTargetDrafts((current) => ({
                          ...current,
                          [campaign.id]: {
                            ...(current[campaign.id] ?? createEmptyTargetDraft()),
                            recommendedRadiusKm: event.target.value,
                          },
                        }))}
                        required
                      />
                    </label>
                  </div>

                  <div className="admin-actions">
                    <button
                      type="button"
                      className="admin-button admin-button--ghost"
                      disabled={suggestingRadiusCampaignId === campaign.id}
                      onClick={() => void handleSuggestRadius(campaign)}
                    >
                      {suggestingRadiusCampaignId === campaign.id ? 'Sugerindo...' : 'Sugerir raio'}
                    </button>
                    <button
                      type="submit"
                      className="admin-button"
                      disabled={creatingTargetCampaignId === campaign.id}
                    >
                      {creatingTargetCampaignId === campaign.id ? 'Salvando target...' : 'Salvar target'}
                    </button>
                  </div>
                </form>
              </div>

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
