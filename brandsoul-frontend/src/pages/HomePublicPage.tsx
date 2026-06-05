import { useEffect, useState, type FormEvent } from 'react';

import { LEGAL_ROUTES } from '../app/routes/legalRoutes';
import PublicShell from '../app/shells/PublicShell';
import {
  Button,
  Card,
  EmptyState,
  Input,
  LoadingContractView,
  Section,
  TransparencyPanel,
  TrustRibbon,
} from '../lib/designSystem';
import {
  completeOnboardingStep,
  dismissOnboardingFlow,
  readOnboardingFlowState,
  registerOnboardingFirstSuccess,
  type OnboardingFlowState,
} from '../lib/onboardingContinuity';
import '../styles/homePublicPage.css';

type CoverageRegion = {
  id: string;
  name: string;
  specialties: string;
  sla: string;
};

const COVERAGE_PREVIEW: CoverageRegion[] = [
  { id: 'sp-capital', name: 'São Paulo - Capital', specialties: 'Trabalhista, Cível, Empresarial', sla: 'Resposta inicial em até 2h' },
  { id: 'rio-capital', name: 'Rio de Janeiro - Capital', specialties: 'Cível, Consumidor, Família', sla: 'Resposta inicial em até 3h' },
  { id: 'bh-metropolitana', name: 'Belo Horizonte - Metropolitana', specialties: 'Trabalhista, Contratos, Família', sla: 'Resposta inicial em até 4h' },
];

const HOW_IT_WORKS_STEPS = [
  {
    title: 'Descreva sua necessidade',
    description: 'Você informa contexto, urgência e localidade em linguagem simples.',
  },
  {
    title: 'Compare com transparência',
    description: 'A busca mostra critérios, cobertura, disponibilidade e SLA de cada escritório.',
  },
  {
    title: 'Escolha livremente',
    description: 'Você decide com quem seguir. A plataforma não recomenda mérito jurídico automaticamente.',
  },
  {
    title: 'Inicie triagem segura',
    description: 'Sua triagem segue para análise profissional do escritório escolhido.',
  },
];

const OFFICE_ONBOARDING_STEPS = [
  {
    id: 'office-create-access',
    title: 'Criar acesso do escritório',
    detail: 'Abra o cadastro para começar a publicar as informações do escritório.',
  },
  {
    id: 'office-configure-coverage',
    title: 'Definir cobertura e SLA',
    detail: 'Defina regiões atendidas e prazo inicial de resposta antes do primeiro contato.',
  },
  {
    id: 'office-open-panel',
    title: 'Abrir a cabine do escritório',
    detail: 'Acompanhe casos, triagens e prioridades do dia a dia em um só lugar.',
  },
];

function normalizeSearchQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export default function HomePublicPage() {
  const [query, setQuery] = useState('');
  const [isCoverageLoading, setIsCoverageLoading] = useState(true);
  const [coveragePreview, setCoveragePreview] = useState<CoverageRegion[]>([]);
  const [officeOnboardingState, setOfficeOnboardingState] = useState<OnboardingFlowState>(() => readOnboardingFlowState('office-setup'));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCoveragePreview(COVERAGE_PREVIEW);
      setIsCoverageLoading(false);
      registerOnboardingFirstSuccess('office-setup');
      setOfficeOnboardingState(readOnboardingFlowState('office-setup'));
    }, 420);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = normalizeSearchQuery(query);

    const nextUrl = normalizedQuery.length > 0
      ? `${LEGAL_ROUTES.public.buscar}?q=${encodeURIComponent(normalizedQuery)}`
      : LEGAL_ROUTES.public.buscar;

    window.location.assign(nextUrl);
  }

  function handleOfficeOnboardingAdvance(stepIndex: number) {
    const step = OFFICE_ONBOARDING_STEPS[stepIndex];
    if (!step) {
      return;
    }

    completeOnboardingStep('office-setup', step.id, stepIndex + 1);
    setOfficeOnboardingState(readOnboardingFlowState('office-setup'));

    if (step.id === 'office-create-access') {
      window.location.assign(LEGAL_ROUTES.onboarding.conta);
      return;
    }

    if (step.id === 'office-configure-coverage') {
      window.location.assign(LEGAL_ROUTES.auth.login);
      return;
    }

    window.location.assign(LEGAL_ROUTES.admin.home);
  }

  function handleDismissOfficeOnboarding() {
    dismissOnboardingFlow('office-setup');
    setOfficeOnboardingState(readOnboardingFlowState('office-setup'));
  }

  const officeCurrentStep = Math.min(officeOnboardingState.currentStep, OFFICE_ONBOARDING_STEPS.length - 1);
  const officeNextStep = OFFICE_ONBOARDING_STEPS[officeCurrentStep];

  return (
    <PublicShell>
      <section className="home-public" aria-label="Página inicial da BrandSoul Legal">
        <Section
          kicker="Busca jurídica clara"
          title="Encontre escritórios com cobertura, disponibilidade e prazo de resposta visíveis"
          subtitle="A plataforma organiza a busca e a triagem. Você escolhe com qual escritório quer seguir."
          className="home-public__hero home-public__animate-in"
        >
          <TrustRibbon />

          <form className="home-public__search" onSubmit={handleSearchSubmit}>
            <label htmlFor="home-search" className="home-public__search-label">
              Como podemos começar sua busca?
            </label>
            <div className="home-public__search-row">
              <Input
                id="home-search"
                name="home-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex: preciso de apoio trabalhista em São Paulo"
                aria-describedby="home-search-help"
              />
              <Button type="submit">Buscar escritórios</Button>
            </div>
            <p id="home-search-help" className="home-public__search-help">
              A plataforma organiza. Você escolhe. O escritório responde.
            </p>
          </form>
        </Section>

        <Section
          kicker="Como funciona"
          title="Jornada clara do primeiro contato ao envio da triagem"
          subtitle="Sem marketplace oculto, sem recomendação automática de mérito jurídico."
          className="home-public__animate-in"
        >
          <div className="home-public__steps-grid">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <Card key={step.title} as="article" className="home-public__step-card">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </Card>
            ))}
          </div>
        </Section>

        <Section
          kicker="Confiança"
          title="Clareza em cada etapa da busca"
          subtitle="Você entende por que cada escritório apareceu e o que esperar antes de iniciar a triagem."
          className="home-public__trust home-public__animate-in"
        >
          <div className="home-public__trust-grid">
            <Card tone="subtle" as="article" className="ds-trust-panel">
              <h3>Critérios visíveis</h3>
              <p>Os resultados mostram cobertura, disponibilidade e prazo de resposta em linguagem simples.</p>
            </Card>
            <Card tone="subtle" as="article" className="ds-trust-panel">
              <h3>Papeis definidos</h3>
              <p>Você escolhe o escritório. A plataforma organiza o fluxo. O atendimento jurídico fica com o escritório responsável.</p>
            </Card>
            <Card tone="subtle" as="article" className="ds-trust-panel">
              <h3>Próximo passo claro</h3>
              <p>Mesmo quando algo está sendo atualizado, a página mostra como seguir sem perder o contexto da busca.</p>
            </Card>
          </div>

          <TransparencyPanel
            summary="Transparência faz parte da busca desde o primeiro contato."
            criteria={[
              'Por que um escritório apareceu na busca',
              'Quais dados estão confirmados ou estimados',
              'Como disponibilidade, cobertura e SLA influenciam a ordenação',
            ]}
            details={<p>Para entender todos os critérios, consulte a página de transparência.</p>}
          />
          <div className="home-public__row-actions ds-cta-cluster">
            <Button variant="secondary" onClick={() => window.location.assign(LEGAL_ROUTES.public.transparencia)}>
              Entender os critérios
            </Button>
          </div>
        </Section>

        <Section
          kicker="Cobertura regional"
          title="Regiões com disponibilidade visível"
          subtitle="Uma leitura inicial das regiões e áreas jurídicas já disponíveis na plataforma."
          className="home-public__animate-in"
        >
          {isCoverageLoading ? (
            <LoadingContractView
              label="Carregando cobertura inicial"
              details="Estamos organizando as informações regionais para sua busca."
            />
          ) : coveragePreview.length === 0 ? (
            <EmptyState
              title="Cobertura regional temporariamente indisponível"
              description="Você ainda pode iniciar uma busca mais ampla e ver os escritórios disponíveis."
              actionLabel="Buscar escritórios"
              onAction={() => window.location.assign(LEGAL_ROUTES.public.buscar)}
            />
          ) : (
            <div className="home-public__coverage-grid">
              {coveragePreview.map((region) => (
                <Card key={region.id} as="article" className="home-public__coverage-card">
                  <h3>{region.name}</h3>
                  <p>{region.specialties}</p>
                  <p className="home-public__meta">{region.sla}</p>
                </Card>
              ))}
            </div>
          )}
        </Section>

        <Section
          kicker="Para escritórios"
          title="Organize cobertura, triagem e publicação do escritório"
          subtitle="Um fluxo claro para preparar o perfil público e acompanhar a operação do escritório."
          className="home-public__offices home-public__animate-in"
        >
          {!officeOnboardingState.dismissed ? (
            <Card as="article" className="home-public__onboarding-card" tone="subtle">
              <p className="home-public__onboarding-kicker">Guia inicial do escritório</p>
              <h3>Comece em 3 passos simples</h3>
              <p>
                O progresso fica salvo para você continuar depois, sem recomeçar.
              </p>
              <ol className="home-public__onboarding-steps" aria-label="Etapas de ativação do escritório">
                {OFFICE_ONBOARDING_STEPS.map((step, index) => {
                  const isDone = officeOnboardingState.completedSteps.includes(step.id);
                  const isCurrent = officeCurrentStep === index;
                  return (
                    <li key={step.id} className={[isDone ? 'is-done' : '', isCurrent ? 'is-current' : ''].filter(Boolean).join(' ')}>
                      <strong>{step.title}</strong>
                      <span>{step.detail}</span>
                    </li>
                  );
                })}
              </ol>
              <div className="home-public__row-actions ds-cta-cluster">
                <Button onClick={() => handleOfficeOnboardingAdvance(officeCurrentStep)}>
                  {officeNextStep?.id === 'office-open-panel' ? 'Abrir cabine do escritório' : 'Continuar cadastro'}
                </Button>
                <Button variant="ghost" onClick={handleDismissOfficeOnboarding}>
                  Ocultar guia agora
                </Button>
              </div>
            </Card>
          ) : null}

          <Card as="article" className="home-public__onboarding-success" tone="subtle">
            <h3>Primeira etapa concluída</h3>
            <p>
              O primeiro marco acontece quando o escritório define cobertura, prazo inicial de resposta e acesso à cabine.
            </p>
            <p className="home-public__meta">
              {officeOnboardingState.firstSuccessAt
                ? `Primeira etapa registrada em ${new Date(officeOnboardingState.firstSuccessAt).toLocaleDateString('pt-BR')}.`
                : 'Ainda sem etapa registrada. Complete o guia para fechar o primeiro ciclo.'}
            </p>
          </Card>

          <EmptyState
            title="Seu escritório ainda está na fase inicial de configuração"
            description="Você já pode preparar cobertura, canais e prazo de resposta antes de publicar o perfil."
            guidance={[
              'Crie o acesso do escritório para iniciar a configuração.',
              'Defina cobertura regional e prazo inicial de resposta antes do primeiro atendimento.',
              'Use a cabine para acompanhar triagens, casos e publicação.',
            ]}
            actionLabel="Começar cadastro do escritório"
            onAction={() => window.location.assign(LEGAL_ROUTES.onboarding.conta)}
            secondaryActionLabel="Entrar na cabine"
            onSecondaryAction={() => window.location.assign(LEGAL_ROUTES.auth.login)}
          />
          <div className="home-public__row-actions ds-cta-cluster">
            <Button variant="secondary" onClick={() => window.location.assign(LEGAL_ROUTES.public.transparencia)}>
              Ver como a plataforma funciona
            </Button>
          </div>
        </Section>

        <footer className="home-public__footer" aria-label="Rodapé institucional">
          <p>
            A BrandSoul Legal organiza a busca por escritórios com critérios claros e triagem estruturada.
          </p>
          <p>
            A plataforma organiza. Você escolhe. O escritório responde.
          </p>
        </footer>
      </section>
    </PublicShell>
  );
}
