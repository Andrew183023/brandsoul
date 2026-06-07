import { useEffect, useState } from 'react'

import {
  getOfficeBusinessConfig,
  listOfficeCases,
  listOfficeProfessionals,
  type AdminLegalCase,
  type OfficeBusinessConfig,
  type OfficeProfessional,
} from '../backend-bridge/api/adminApi'
import AdminOfficeLayout from '../components/AdminOfficeLayout'
import FeedbackBanner from '../components/FeedbackBanner'
import SurfaceCard from '../components/SurfaceCard'

type OverviewSection = 'visao-geral' | 'triagem' | 'equipe' | 'cobertura' | 'disponibilidade' | 'perfil-publico' | 'publicacao' | 'configuracoes'

const SECTION_META: Record<OverviewSection, { title: string; subtitle: string }> = {
  'visao-geral': {
    title: 'Visao geral do escritorio',
    subtitle: 'Resumo da prontidao juridica, publicacao e operacao do escritorio.',
  },
  triagem: {
    title: 'Triagem',
    subtitle: 'Resumo operacional da entrada de casos.',
  },
  equipe: {
    title: 'Equipe',
    subtitle: 'Profissionais publicos e responsavel atual do escritorio.',
  },
  cobertura: {
    title: 'Cobertura',
    subtitle: 'Areas juridicas e cidades atendidas.',
  },
  disponibilidade: {
    title: 'Disponibilidade',
    subtitle: 'SLA e disponibilidade publica do escritorio.',
  },
  'perfil-publico': {
    title: 'Perfil publico',
    subtitle: 'Dados centrais que aparecem no perfil publico do escritorio.',
  },
  publicacao: {
    title: 'Publicacao',
    subtitle: 'Estado do material publico e evidencias disponiveis.',
  },
  configuracoes: {
    title: 'Configuracoes',
    subtitle: 'Configuracao canônica do escritorio juridico.',
  },
}

type Props = {
  officeId: string
  section: OverviewSection
}

export default function AdminOfficeOverviewPage({ officeId, section }: Props) {
  const [config, setConfig] = useState<OfficeBusinessConfig | null>(null)
  const [professionals, setProfessionals] = useState<OfficeProfessional[]>([])
  const [cases, setCases] = useState<AdminLegalCase[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const [configPayload, professionalsPayload, casesPayload] = await Promise.all([
          getOfficeBusinessConfig(officeId),
          listOfficeProfessionals(officeId).catch(() => ({ professionals: [] as OfficeProfessional[] })),
          listOfficeCases(officeId).catch(() => ({ cases: [] as AdminLegalCase[] })),
        ])

        if (cancelled) {
          return
        }

        setConfig(configPayload.businessConfig)
        setProfessionals(professionalsPayload.professionals)
        setCases(casesPayload.cases)
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Falha ao carregar o escritorio.')
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

  const meta = SECTION_META[section]
  const responsible = professionals.find((professional) => professional.isResponsible)
  const openCases = cases.filter((item) => item.status !== 'closed').length

  return (
    <AdminOfficeLayout officeId={officeId} section={section} title={meta.title} subtitle={meta.subtitle}>
      {error ? <FeedbackBanner tone="error">{error}</FeedbackBanner> : null}
      {isLoading ? <FeedbackBanner>Carregando escritorio...</FeedbackBanner> : null}

      {!isLoading ? (
        <div className="admin-grid">
          <SurfaceCard tone="admin">
            <div className="admin-card-header">
              <h2>Escritorio</h2>
              <span>{officeId}</span>
            </div>
            <p>{config?.officeName ?? 'Escritorio juridico sem nome publico definido.'}</p>
            <p>{config?.institutionalDescription ?? config?.description ?? 'Descricao institucional ainda nao publicada.'}</p>
          </SurfaceCard>

          <SurfaceCard tone="admin">
            <div className="admin-card-header">
              <h2>Equipe</h2>
              <span>{professionals.length} profissionais</span>
            </div>
            <p>{responsible ? `Responsavel: ${responsible.displayName}` : 'Nenhum responsavel definido ainda.'}</p>
            <p>{professionals.filter((item) => item.isPublic).length} profissionais publicos</p>
          </SurfaceCard>

          <SurfaceCard tone="admin">
            <div className="admin-card-header">
              <h2>Casos</h2>
              <span>{cases.length} total</span>
            </div>
            <p>{openCases} casos abertos ou em andamento.</p>
          </SurfaceCard>

          <SurfaceCard tone="admin">
            <div className="admin-card-header">
              <h2>Cobertura</h2>
              <span>{(config?.legalAreas ?? []).length} areas</span>
            </div>
            <p>Areas: {(config?.legalAreas ?? []).join(', ') || 'Nao definidas.'}</p>
            <p>Cidades: {(config?.servedCities ?? []).join(', ') || 'Nao definidas.'}</p>
          </SurfaceCard>
        </div>
      ) : null}
    </AdminOfficeLayout>
  )
}
