import type { CatalogItem } from '../types/catalog'

export const mockCatalog: CatalogItem[] = [
  {
    id: 'combo-destaque',
    title: 'Combo Especial da Casa',
    description: 'Uma selecao pensada para quem quer provar o que eu tenho de mais pedido sem complicar a escolha.',
    price: 'R$ 59,90',
    ctaLabel: 'Quero saber mais',
    highlight: 'Mais pedido',
    category: 'combos',
  },
  {
    id: 'experiencia-premium',
    title: 'Experiencia Premium',
    description: 'Uma opcao mais completa para quem quer subir o nivel da pedida ou do atendimento.',
    price: 'R$ 89,90',
    ctaLabel: 'Quero saber mais',
    highlight: 'Destaque',
    category: 'premium',
  },
  {
    id: 'pedido-rapido',
    title: 'Pedido Rapido',
    description: 'Uma escolha direta para quem quer resolver isso agora com praticidade e sem perder qualidade.',
    price: 'A partir de R$ 29,90',
    ctaLabel: 'Quero saber mais',
    highlight: 'Agil',
    category: 'entrada',
  },
  {
    id: 'opcao-personalizada',
    title: 'Opcao Personalizada',
    description: 'Se voce quer algo mais ajustado ao seu gosto, eu posso te mostrar o que faz mais sentido.',
    ctaLabel: 'Quero saber mais',
    highlight: 'Flexivel',
    category: 'personalizado',
  },
]
