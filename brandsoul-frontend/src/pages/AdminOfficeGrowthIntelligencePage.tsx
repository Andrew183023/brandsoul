import { type ReactNode, useEffect, useMemo, useState } from 'react'

import {
  getOfficeGrowthIntelligence,
  type AdminGrowthCapacityProjection,
  type AdminGrowthCoverageProjection,
  type AdminGrowthDemandItem,
  type AdminGrowthIntelligenceResponse,
  type AdminGrowthOpportunity,
  type AdminGrowthPriority,
  type AdminGrowthRecommendation,
  type AdminGrowthScoreProjection,
  type AdminGrowthTerritory,
  type AdminLandingCandidate,
} from '../backend-bridge/api/adminApi'
import AdminOfficeLayout from '../components/AdminOfficeLayout'
import FeedbackBanner from '../components/FeedbackBanner'
import SurfaceCard from '../components/SurfaceCard'

type Props = {
  officeId: string
}

function formatNullableNumber(value: number | null | undefined, suffix = '') {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n/a'
  }

  return `${value}${suffix}`
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatPriority(priority: AdminGrowthPriority | null | undefined) {
  if (!priority) {
    return 'n/a'
  }

  return priority.replace('_', ' ')
}

function formatLabel(value: string | undefined) {
  if (!value) {
    return 'n/a'
  }

  return value.replace(/_/g, ' ')
}

function sortByPriority<T extends { priority: AdminGrowthPriority }>(items: T[]) {
  const rank: Record<AdminGrowthPriority, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }

  return [...items].sort((left, right) => rank[right.priority] - rank[left.priority])
}

function renderDemandItem(item: AdminGrowthDemandItem) {
  return (
    <article key={item.id} className="admin-diagnosis-section admin-form-section">
      <div className="admin-card-header">
        <h3>{item.city}</h3>
        <span>{item.specialty}</span>
      </div>
      <p><strong>Casos:</strong> {item.casesCount}</p>
      <p><strong>Backlog:</strong> {item.backlogCount}</p>
      <p><strong>Leads:</strong> {item.leadsCount}</p>
      <p><strong>Conversão:</strong> {formatPercent(item.conversionRate)}</p>
      <p><strong>Origem:</strong> {item.origin}</p>
      <p><strong>Trend:</strong> {item.trend}</p>
      <p><strong>Risco SLA:</strong> {item.slaRiskScore}</p>
      <p><strong>Resolução média:</strong> {formatNullableNumber(item.averageResolutionHours, 'h')}</p>
    </article>
  )
}

function renderTerritory(item: AdminGrowthTerritory) {
  return (
    <article key={item.id} className="admin-diagnosis-section admin-form-section">
      <div className="admin-card-header">
        <h3>{item.city}</h3>
        <span>{item.coverageStatus}</span>
      </div>
      <p><strong>Demand score:</strong> {item.demandScore}</p>
      <p><strong>Coverage score:</strong> {item.coverageScore}</p>
      <p><strong>Growth score:</strong> {item.growthScore}</p>
      <p><strong>Competition:</strong> {item.competitionScore}</p>
      <p><strong>Trend:</strong> {item.trend}</p>
      <p><strong>Recomendação:</strong> {formatLabel(item.recommendation)}</p>
    </article>
  )
}

function renderCoverage(item: AdminGrowthCoverageProjection) {
  return (
    <article key={item.id} className="admin-diagnosis-section admin-form-section">
      <div className="admin-card-header">
        <h3>{item.city}</h3>
        <span>{item.specialty}</span>
      </div>
      <p><strong>Status:</strong> {item.status}</p>
      <p><strong>Gap:</strong> {formatLabel(item.gapType)}</p>
      <p><strong>Compatíveis:</strong> {item.compatibleProfessionalsCount}</p>
      <p><strong>Ativos:</strong> {item.activeProfessionalsCount}</p>
      <p><strong>Capacidade:</strong> {item.capacityStatus}</p>
      <p><strong>Capacity score:</strong> {item.capacityScore}</p>
    </article>
  )
}

function renderCapacity(item: AdminGrowthCapacityProjection) {
  return (
    <article key={item.id} className="admin-diagnosis-section admin-form-section">
      <div className="admin-card-header">
        <h3>{item.professionalId ?? item.city ?? 'sem referência'}</h3>
        <span>{item.capacityStatus}</span>
      </div>
      <p><strong>Cidade:</strong> {item.city ?? 'n/a'}</p>
      <p><strong>Especialidade:</strong> {item.specialty ?? 'n/a'}</p>
      <p><strong>Abertos:</strong> {item.openCasesCount}</p>
      <p><strong>Fechados:</strong> {item.closedCasesCount}</p>
      <p><strong>Backlog:</strong> {item.backlogCount}</p>
      <p><strong>Workload:</strong> {item.workloadCount}</p>
      <p><strong>Score:</strong> {item.capacityScore}</p>
      <p><strong>Recomendação:</strong> {formatLabel(item.recommendation)}</p>
    </article>
  )
}

function renderScore(item: AdminGrowthScoreProjection) {
  return (
    <article key={item.id} className="admin-diagnosis-section admin-form-section">
      <div className="admin-card-header">
        <h3>{item.city}</h3>
        <span>{item.specialty ?? 'geral'}</span>
      </div>
      <p><strong>Score:</strong> {item.value}</p>
      <p><strong>Prioridade:</strong> {item.priority}</p>
      <p><strong>Confiança:</strong> {item.confidence}</p>
      <p><strong>Demanda:</strong> {item.demandScore}</p>
      <p><strong>Cobertura:</strong> {item.coverageScore}</p>
      <p><strong>Capacidade:</strong> {item.capacityScore}</p>
      <p><strong>SLA:</strong> {item.slaScore}</p>
      <p><strong>Trend:</strong> {item.trendScore}</p>
    </article>
  )
}

function renderRecommendation(item: AdminGrowthRecommendation) {
  return (
    <article key={item.id} className="admin-diagnosis-section admin-form-section">
      <div className="admin-card-header">
        <h3>{item.title}</h3>
        <span>{item.priority}</span>
      </div>
      <p><strong>Tipo:</strong> {formatLabel(item.type)}</p>
      <p><strong>Cidade:</strong> {item.city ?? 'n/a'}</p>
      <p><strong>Especialidade:</strong> {item.specialty ?? 'n/a'}</p>
      <p>{item.description}</p>
      <p><strong>Impacto esperado:</strong> {item.expectedImpact}</p>
    </article>
  )
}

function renderOpportunity(item: AdminGrowthOpportunity) {
  return (
    <article key={item.id} className="admin-diagnosis-section admin-form-section">
      <div className="admin-card-header">
        <h3>{formatLabel(item.type)}</h3>
        <span>{item.priority}</span>
      </div>
      <p><strong>Cidade:</strong> {item.city ?? 'n/a'}</p>
      <p><strong>Especialidade:</strong> {item.specialty ?? 'n/a'}</p>
      <p><strong>Score:</strong> {item.score}</p>
      <p><strong>Confiança:</strong> {item.confidence}</p>
      <p><strong>Impacto esperado:</strong> {item.expectedImpact}</p>
      <p><strong>Justificativa:</strong> {item.justification}</p>
      <p><strong>Ações requeridas:</strong> {item.requiredActions.join(', ') || 'n/a'}</p>
    </article>
  )
}

function renderLandingCandidate(item: AdminLandingCandidate) {
  return (
    <article key={item.id} className="admin-diagnosis-section admin-form-section">
      <div className="admin-card-header">
        <h3>{item.city ?? 'sem cidade'}</h3>
        <span>{item.specialty ?? 'sem especialidade'}</span>
      </div>
      <p><strong>Elegível:</strong> {item.eligible ? 'sim' : 'não'}</p>
      <p><strong>Growth score:</strong> {item.growthScore}</p>
      <p><strong>SEO score:</strong> {item.seoScore}</p>
      <p><strong>Prioridade:</strong> {item.priority}</p>
      <p><strong>Confiança:</strong> {item.confidence}</p>
      <p><strong>Motivo:</strong> {item.reason}</p>
    </article>
  )
}

function renderCollection<T>(
  title: string,
  subtitle: string,
  items: T[],
  renderItem: (item: T) => ReactNode,
  emptyCopy: string,
) {
  return (
    <SurfaceCard tone="admin">
      <div className="admin-card-header">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      <p>{subtitle}</p>
      {items.length === 0 ? (
        <p>{emptyCopy}</p>
      ) : (
        <div className="admin-diagnosis-grid">
          {items.map(renderItem)}
        </div>
      )}
    </SurfaceCard>
  )
}

export default function AdminOfficeGrowthIntelligencePage({ officeId }: Props) {
  const [payload, setPayload] = useState<AdminGrowthIntelligenceResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const nextPayload = await getOfficeGrowthIntelligence(officeId)
        if (!cancelled) {
          setPayload(nextPayload)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Falha ao carregar a inteligência de crescimento.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [officeId])

  const snapshot = payload?.snapshot
  const summary = payload?.summary
  const prioritizedRecommendations = useMemo(
    () => sortByPriority(snapshot?.recommendations ?? []),
    [snapshot],
  )
  const prioritizedOpportunities = useMemo(
    () => sortByPriority(snapshot?.opportunities ?? []),
    [snapshot],
  )
  const prioritizedScores = useMemo(
    () => sortByPriority(snapshot?.scores ?? []),
    [snapshot],
  )
  const coverageGaps = useMemo(
    () => (snapshot?.coverage ?? []).filter((item) => item.gapType !== 'none' && item.gapType !== 'unknown'),
    [snapshot],
  )

  return (
    <AdminOfficeLayout
      officeId={officeId}
      section="inteligencia-crescimento"
      title="Inteligência de Crescimento"
      subtitle="Leitura determinística de demanda, cobertura, capacidade e oportunidades do escritório."
    >
      {error ? <FeedbackBanner tone="error">{error}</FeedbackBanner> : null}
      {isLoading ? <FeedbackBanner>Carregando inteligência de crescimento...</FeedbackBanner> : null}

      {!isLoading && payload && summary && snapshot ? (
        <>
          <SurfaceCard tone="admin">
            <div className="admin-card-header">
              <h2>Leitura canônica FT-07</h2>
              <span>{payload.status}</span>
            </div>
            <p>Superfície somente leitura alimentada exclusivamente por <code>/escritorios/:id/growth-intelligence</code>.</p>
            <p><strong>Gerado em:</strong> {payload.generatedAt}</p>
            <p><strong>Prioridade máxima:</strong> {formatPriority(summary.highestPriority)}</p>
            <p><strong>Profissionais no contexto:</strong> {payload.compatibility.professionalsIncluded ? 'sim' : 'não'}</p>
            <p><strong>Perfil institucional no contexto:</strong> {payload.compatibility.entityProfileIncluded ? 'sim' : 'não'}</p>
          </SurfaceCard>

          <div className="admin-diagnosis-grid">
            <SurfaceCard tone="admin">
              <strong>{summary.totalDemand}</strong>
              <span>demanda total</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{summary.totalTerritories}</strong>
              <span>territórios</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{summary.totalCoverageGaps}</strong>
              <span>gaps de cobertura</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{summary.overloadedProfessionals}</strong>
              <span>profissionais sobrecarregados</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{summary.constrainedProfessionals}</strong>
              <span>capacidade restrita</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{summary.expansionOpportunities}</strong>
              <span>oportunidades</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{summary.landingCandidates}</strong>
              <span>landing candidates</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{summary.eligibleLandingCandidates}</strong>
              <span>landings elegíveis</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{summary.recommendations}</strong>
              <span>recomendações</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{summary.criticalRecommendations}</strong>
              <span>recomendações críticas</span>
            </SurfaceCard>
            <SurfaceCard tone="admin">
              <strong>{summary.averageGrowthScore ?? 'n/a'}</strong>
              <span>score médio</span>
            </SurfaceCard>
          </div>

          {renderCollection(
            'Demanda por cidade e especialidade',
            'Base agregada para leitura de volume, backlog, origem e resolução.',
            snapshot.demand.items,
            renderDemandItem,
            'Nenhum item de demanda foi calculado para este escritório.',
          )}

          {renderCollection(
            'Territórios',
            'Pontuação de demanda, cobertura e crescimento por cidade.',
            snapshot.territories,
            renderTerritory,
            'Nenhum território calculado.',
          )}

          {renderCollection(
            'Coverage Gaps',
            'Somente projeções com lacuna operacional explícita.',
            coverageGaps,
            renderCoverage,
            'Nenhum gap de cobertura ativo.',
          )}

          {renderCollection(
            'Capacity',
            'Capacidade por profissional, cidade ou especialidade.',
            snapshot.capacity,
            renderCapacity,
            'Nenhuma projeção de capacidade disponível.',
          )}

          {renderCollection(
            'Growth Scores',
            'Scores priorizados para leitura de cidade e especialidade.',
            prioritizedScores,
            renderScore,
            'Nenhum growth score calculado.',
          )}

          {renderCollection(
            'Recommendations',
            'Recomendações derivadas do snapshot, sem ações mutáveis nesta UI.',
            prioritizedRecommendations,
            renderRecommendation,
            'Nenhuma recomendação gerada.',
          )}

          {renderCollection(
            'Opportunities',
            'Oportunidades de expansão derivadas do pipeline determinístico.',
            prioritizedOpportunities,
            renderOpportunity,
            'Nenhuma oportunidade disponível.',
          )}

          {renderCollection(
            'Landing Candidates',
            'Camada preparada para futuras landings, sem publicação nesta superfície.',
            snapshot.landingCandidates,
            renderLandingCandidate,
            'Nenhum candidato de landing preparado.',
          )}
        </>
      ) : null}
    </AdminOfficeLayout>
  )
}
