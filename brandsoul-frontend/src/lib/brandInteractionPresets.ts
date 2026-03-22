import type { PowerOption, ToneOption } from './persona'

export type InteractionContext = 'parceria' | 'indicacao' | 'combo' | 'negociacao' | 'colaboracao'
export type InteractionTurns = 2 | 3 | 4

export interface InteractionPersonaPreset {
  brandName: string
  tone: ToneOption
  power: PowerOption
  businessDescription: string
}

export interface BrandInteractionPreset {
  id: string
  name: string
  description: string
  context: InteractionContext
  turns: InteractionTurns
  initiator: InteractionPersonaPreset
  receiver: InteractionPersonaPreset
}

export const brandInteractionPresets: BrandInteractionPreset[] = [
  {
    id: 'restaurante-delivery-operacional',
    name: 'Restaurante + Delivery',
    description: 'Parceria operacional entre restaurante japones e entrega local para ganhar eficiencia e aumentar pedidos.',
    context: 'parceria',
    turns: 4,
    initiator: {
      brandName: 'Sakura House',
      tone: 'inteligente',
      power: 'clareza',
      businessDescription: 'Somos um restaurante japones com foco em combinados, recorrencia local e operacao que quer ganhar eficiencia sem perder qualidade.',
    },
    receiver: {
      brandName: 'Entrega de Bairro',
      tone: 'sério',
      power: 'velocidade',
      businessDescription: 'Somos um servico de entrega local com operacao rapida, cobertura regional e interesse em aumentar volume de pedidos com parceiros de alimentacao.',
    },
  },
  {
    id: 'hamburgueria-bebida-comercial',
    name: 'Hamburgueria + Bebida',
    description: 'Combo comercial entre hamburgueria artesanal e bebida premium para elevar ticket medio.',
    context: 'combo',
    turns: 3,
    initiator: {
      brandName: 'Brasa Craft Burger',
      tone: 'ousado',
      power: 'atração',
      businessDescription: 'Somos uma hamburgueria artesanal com foco em experiencia premium, combos de alto valor e aumento de ticket medio por pedido.',
    },
    receiver: {
      brandName: 'Aurora Drinks',
      tone: 'inteligente',
      power: 'conexão',
      businessDescription: 'Somos uma marca de bebida premium interessada em combos comerciais, visibilidade em pontos de venda e associacao com marcas gastronomicas autorais.',
    },
  },
  {
    id: 'clinica-laboratorio',
    name: 'Clinica + laboratorio',
    description: 'Colaboracao entre clinica odontologica e laboratorio para agilidade e integracao de servicos.',
    context: 'colaboracao',
    turns: 3,
    initiator: {
      brandName: 'Odonto Flux',
      tone: 'inteligente',
      power: 'conexão',
      businessDescription: 'Somos uma clinica odontologica com foco em atendimento agil, experiencia confiavel e integracao de servicos para reduzir friccao do paciente.',
    },
    receiver: {
      brandName: 'Lab Exato',
      tone: 'sério',
      power: 'clareza',
      businessDescription: 'Somos um laboratorio de exames com operacao precisa, resposta rapida e interesse em integrar fluxos com clinicas parceiras.',
    },
  },
  {
    id: 'saas-consultoria',
    name: 'SaaS + Consultoria',
    description: 'Negociacao B2B entre plataforma de gestao empresarial e consultoria estrategica para venda complexa e parceria comercial.',
    context: 'negociacao',
    turns: 4,
    initiator: {
      brandName: 'Atlas ERP Cloud',
      tone: 'ousado',
      power: 'velocidade',
      businessDescription: 'Somos uma plataforma de gestao empresarial com SaaS para operacao financeira, processos e vendas consultivas em contas B2B.',
    },
    receiver: {
      brandName: 'Nexo Strategy',
      tone: 'inteligente',
      power: 'clareza',
      businessDescription: 'Somos uma consultoria estrategica focada em transformacao comercial, projetos complexos e abertura de receita em empresas B2B.',
    },
  },
  {
    id: 'loja-influencer-indicacao',
    name: 'Loja + Parceiro/Influencer',
    description: 'Indicacao entre loja de roupas e marca parceira para aquisicao de clientes e ampliacao de alcance.',
    context: 'indicacao',
    turns: 3,
    initiator: {
      brandName: 'Lume Atelier',
      tone: 'divertido',
      power: 'atração',
      businessDescription: 'Somos uma loja de roupas com foco em colecoes autorais, varejo digital e aquisicao de clientes por curadoria e comunidade.',
    },
    receiver: {
      brandName: 'Maya Select',
      tone: 'ousado',
      power: 'conexão',
      businessDescription: 'Somos uma marca parceira com perfil influencer, audiencia engajada e interesse em indicar produtos para gerar descoberta e conversao.',
    },
  },
]