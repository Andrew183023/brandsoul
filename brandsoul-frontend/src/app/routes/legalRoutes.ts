export type AdminOfficeSection =
  | 'visao-geral'
  | 'casos'
  | 'triagem'
  | 'equipe'
  | 'cobertura'
  | 'disponibilidade'
  | 'perfil-publico'
  | 'publicacao'
  | 'crescimento'
  | 'inteligencia-crescimento'
  | 'configuracoes'

export const LEGAL_ROUTES = {
  public: {
    home: '/',
    buscar: '/buscar',
    transparencia: '/transparencia',
    escritorios: '/escritorios',
    paraEscritorios: '/para-escritorios',
    portal: (caseId: string, token: string) => `/portal/${encodeURIComponent(caseId)}/${encodeURIComponent(token)}`,
    escritorioPerfil: (officeId: string) => `/escritorios/${encodeURIComponent(officeId)}`,
    escritorioTriagem: (officeId: string) => `/escritorios/${encodeURIComponent(officeId)}/triagem`,
  },
  admin: {
    home: '/admin',
    escritorio: (officeId: string, section: AdminOfficeSection) => `/admin/escritorios/${encodeURIComponent(officeId)}/${section}`,
  },
  onboarding: {
    base: '/onboarding/escritorio',
    conta: '/onboarding/escritorio/conta',
    ativacao: '/onboarding/escritorio/ativacao',
  },
  auth: {
    login: '/login',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
  },
} as const

function decodeRouteSegment(value?: string | null) {
  return value ? decodeURIComponent(value) : null
}

export function parseOfficeIdFromPublicPath(pathname: string) {
  const profileMatch = pathname.match(/^\/escritorios\/([^/]+)\/?$/)
  if (profileMatch) {
    return decodeRouteSegment(profileMatch[1])
  }

  const triageMatch = pathname.match(/^\/escritorios\/([^/]+)\/triagem\/?$/)
  if (triageMatch) {
    return decodeRouteSegment(triageMatch[1])
  }

  return null
}

export function parseClientPortalFromPublicPath(pathname: string) {
  const portalMatch = pathname.match(/^\/portal\/([^/]+)\/([^/]+)\/?$/)
  if (!portalMatch) {
    return null
  }

  return {
    caseId: decodeRouteSegment(portalMatch[1]),
    token: decodeRouteSegment(portalMatch[2]),
  }
}
