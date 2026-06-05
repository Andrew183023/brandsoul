import PublicShell from '../app/shells/PublicShell'
import { Button, Card, Section, TrustRibbon } from '../lib/designSystem'
import { LEGAL_ROUTES } from '../app/routes/legalRoutes'
import '../styles/transparencyPage.css'

const TRANSPARENCY_TOPICS = [
  {
    kicker: 'Como funciona',
    title: 'Como a plataforma funciona',
    description: 'A BrandSoul organiza a busca e a triagem. O escritório responde pelo atendimento jurídico e pela orientação profissional.',
    bullets: [
      'A plataforma não decide mérito jurídico e não substitui análise profissional.',
      'A busca existe para reduzir opacidade de cobertura, disponibilidade e expectativa de retorno.',
      'O cliente continua escolhendo livremente com qual escritório quer seguir.',
    ],
  },
  {
    kicker: 'Triagem',
    title: 'Como a triagem funciona',
    description: 'A triagem organiza contexto, urgência percebida, objetivo e canal de contato antes do primeiro retorno do escritório.',
    bullets: [
      'Cada etapa reduz retrabalho e melhora previsibilidade para cliente e escritório.',
      'A triagem não equivale a parecer jurídico, consulta formal ou decisão sobre o caso.',
      'O escritório analisa o material recebido e decide continuidade, prioridade e atendimento.',
    ],
  },
  {
    kicker: 'Aparicao na busca',
    title: 'Como os escritórios aparecem',
    description: 'Os escritórios aparecem com base em cobertura declarada, disponibilidade informada, estado de publicação e confiança do dado exibido.',
    bullets: [
      'A busca leva em conta contexto, cobertura regional, especialidade, disponibilidade e SLA.',
      'Resultados sem explicação clara não deveriam aparecer na busca.',
      'A plataforma mostra sinais de confiança para diferenciar dado confirmado de estimado.',
    ],
  },
  {
    kicker: 'Disponibilidade',
    title: 'Como disponibilidade funciona',
    description: 'Disponibilidade pública mostra a situação informada pelo escritório naquele momento, não uma promessa absoluta de aceite do caso.',
    bullets: [
      'Quando confirmada, ela indica leitura mais confiável da capacidade atual.',
      'Quando estimada, ela indica continuidade ativa, mas com margem maior de variação.',
      'A decisão final sobre aceite e prioridade continua com o escritório.',
    ],
  },
  {
    kicker: 'SLA',
    title: 'Como SLA funciona',
    description: 'O SLA mostrado representa a expectativa de primeiro retorno informada pelo escritório.',
    bullets: [
      'SLA não significa resolução do caso no prazo exibido.',
      'Ele serve para orientar quando o primeiro retorno tende a acontecer.',
      'Se alguma informação estiver em atualização, a página indica isso com clareza.',
    ],
  },
  {
    kicker: 'Cobertura',
    title: 'Como cobertura funciona',
    description: 'Cobertura mostra onde e em quais frentes jurídicas o escritório declara atuar publicamente.',
    bullets: [
      'Cobertura regional e áreas jurídicas ajudam a evitar descoberta vaga ou imprecisa.',
      'Cobertura visível não substitui validação do caso concreto pelo escritório.',
      'A plataforma exibe cobertura com estado de confiança quando necessário.',
    ],
  },
  {
    kicker: 'Limites',
    title: 'Limites da plataforma',
    description: 'A BrandSoul organiza fluxo, transparência e continuidade. Ela não presta serviço jurídico e não delibera sobre aceitação, estratégia ou resultado.',
    bullets: [
      'A plataforma não promete desfecho jurídico.',
      'A plataforma não recomenda automaticamente qual escritório é melhor para o mérito do caso.',
      'A responsabilidade profissional pelo atendimento permanece com o escritório.',
    ],
  },
  {
    kicker: 'Papeis',
    title: 'BrandSoul e escritório: quem faz o que',
    description: 'A separação de papéis precisa ser explícita para gerar confiança e evitar interpretação errada do serviço.',
    bullets: [
      'BrandSoul: organiza a busca, os critérios, o contexto e a triagem.',
      'Escritório: avalia, responde, orienta e conduz o atendimento jurídico.',
      'Cliente: escolhe com quem seguir e decide se quer iniciar triagem ou contato.',
    ],
  },
]

const TRUST_POINTS = [
  'Critérios de aparição visíveis.',
  'Disponibilidade e SLA com indicação clara de confiança.',
  'Separação clara entre plataforma e escritório.',
  'Triagem como organização de contexto, não como orientação jurídica automática.',
]

export default function TransparencyPage() {
  return (
    <PublicShell>
      <section className="transparency-page motion-page" aria-label="Página de transparência">
        <Section
          kicker="Transparência"
          title="Como a BrandSoul Legal organiza a busca e a triagem"
          subtitle="Esta página existe para deixar papéis, limites e critérios completamente visíveis antes de qualquer decisão."
          className="motion-reveal"
        >
          <TrustRibbon />
          <div className="transparency-page__hero-grid">
            <Card as="article" className="transparency-page__hero-card">
              <p className="transparency-page__eyebrow">Princípio central</p>
              <h2>Transparência não é detalhe. É parte da experiência.</h2>
              <p>
                A BrandSoul mostra como a busca funciona, como a triagem acontece, o que o SLA quer dizer e onde a
                plataforma para.
              </p>
            </Card>

            <Card as="article" className="transparency-page__hero-card transparency-page__hero-card--signal">
              <p className="transparency-page__eyebrow">O que você vê na prática</p>
              <ul className="transparency-page__trust-list">
                {TRUST_POINTS.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="transparency-page__actions">
            <Button onClick={() => window.location.assign(LEGAL_ROUTES.public.buscar)}>Ir para a busca</Button>
            <Button variant="secondary" onClick={() => window.location.assign(LEGAL_ROUTES.public.paraEscritorios)}>
              Ver para escritórios
            </Button>
          </div>
        </Section>

        <section className="transparency-page__grid motion-reveal">
          {TRANSPARENCY_TOPICS.map((topic) => (
            <Card key={topic.title} as="article" className="transparency-page__topic-card">
              <p className="transparency-page__eyebrow">{topic.kicker}</p>
              <h3>{topic.title}</h3>
              <p>{topic.description}</p>
              <ul className="transparency-page__bullet-list">
                {topic.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </Card>
          ))}
        </section>

        <Card as="section" className="transparency-page__footer-card motion-surface">
          <p className="transparency-page__eyebrow">Resumo executivo</p>
          <h2>Em uma frase</h2>
          <p>
            A BrandSoul organiza a descoberta e a triagem com critérios claros; o escritório assume a resposta e o atendimento jurídico.
          </p>
        </Card>
      </section>
    </PublicShell>
  )
}
