import { Suspense, lazy, useEffect, useState } from 'react'

import { LEGAL_ROUTES, parseClientPortalFromPublicPath, parseOfficeIdFromPublicPath } from './app/routes/legalRoutes'
import { captureAdminAuthContinuation, consumeSafeLegalAdminContinuationReturnTo } from './lib/authContinuation'
import { hasInstitutionalOnboardingContinuationPending } from './lib/institutionalOnboarding'
import { useAuthSession } from './lib/session'

const LegalAdminApp = lazy(() => import('./app/LegalAdminApp.tsx'))
const InstitutionalOnboardingWizardPage = lazy(() => import('./pages/InstitutionalOnboardingWizardPage.tsx'))
const DiscoveryPage = lazy(() => import('./pages/DiscoveryPage.tsx'))
const HomePublicPage = lazy(() => import('./pages/HomePublicPage.tsx'))
const OfficeProfilePage = lazy(() => import('./pages/OfficeProfilePage.tsx'))
const SeoLandingPage = lazy(() => import('./pages/growth/SeoLandingPage.tsx'))
const ClientPortalPage = lazy(() => import('./pages/ClientPortalPage.tsx'))
const TransparencyPage = lazy(() => import('./pages/TransparencyPage.tsx'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.tsx'))
const LoginPage = lazy(() => import('./pages/LoginPage.tsx'))
const RegisterPage = lazy(() => import('./pages/RegisterPage.tsx'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.tsx'))

function decodeRouteSegment(value?: string | null) {
  return value ? decodeURIComponent(value) : null
}

function isValidPublicRouteSegment(value?: string | null) {
  return Boolean(value && !value.startsWith(':'))
}

function RouteNotFoundPage() {
  return (
    <main className="discovery-shell discovery-shell--loading">
      <div className="discovery-panel">
        <p>Rota publica invalida.</p>
        <a href="/buscar">Buscar escritorios</a>
      </div>
    </main>
  )
}

function RouteLoadingPage() {
  return (
    <main className="discovery-shell discovery-shell--loading">
      <div className="discovery-panel">
        <p>Carregando...</p>
      </div>
    </main>
  )
}

function LegalRoot() {
  const [pathname, setPathname] = useState(window.location.pathname)
  const authSession = useAuthSession()

  useEffect(() => {
    const handleLocationChange = () => {
      setPathname(window.location.pathname)
    }

    window.addEventListener('popstate', handleLocationChange)

    return () => {
      window.removeEventListener('popstate', handleLocationChange)
    }
  }, [])

  const hasSession = Boolean(authSession?.token)
  const hasPendingOnboardingContinuation = hasInstitutionalOnboardingContinuationPending()
  const showLoginPage = pathname === LEGAL_ROUTES.auth.login
  const showForgotPasswordPage = pathname === LEGAL_ROUTES.auth.forgotPassword
  const showResetPasswordPage = pathname === LEGAL_ROUTES.auth.resetPassword
  const showOnboardingPage = pathname === LEGAL_ROUTES.onboarding.base
    || pathname === LEGAL_ROUTES.onboarding.conta
    || pathname === LEGAL_ROUTES.onboarding.ativacao
  const showHomePage = pathname === LEGAL_ROUTES.public.home
  const showDiscoveryPage = pathname === LEGAL_ROUTES.public.buscar || pathname === LEGAL_ROUTES.public.escritorios
  const showTransparencyPage = pathname === LEGAL_ROUTES.public.transparencia
  const showForOfficesPage = pathname === LEGAL_ROUTES.public.paraEscritorios
  const showAdminPage = pathname === '/admin'
    || pathname.startsWith('/admin/')

  const seoLandingMatch = pathname.match(/^\/p\/([^/]+)\/([^/]+)\/?$/)
  const seoLandingRoute = seoLandingMatch
    ? {
        city: decodeRouteSegment(seoLandingMatch[1]),
        specialty: decodeRouteSegment(seoLandingMatch[2]),
      }
    : null

  const officeIdFromCanonicalPath = parseOfficeIdFromPublicPath(pathname)
  const clientPortalRoute = parseClientPortalFromPublicPath(pathname)

  useEffect(() => {
    if (showAdminPage && !hasSession) {
      const intendedPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
      captureAdminAuthContinuation(intendedPath)
      window.history.replaceState({}, '', LEGAL_ROUTES.auth.login)
      setPathname(LEGAL_ROUTES.auth.login)
      return
    }

    if ((showLoginPage || showForgotPasswordPage || showResetPasswordPage) && hasSession && !hasPendingOnboardingContinuation) {
      const destination = consumeSafeLegalAdminContinuationReturnTo(LEGAL_ROUTES.admin.home)
      console.log({
        event: 'legal-auth-post-login-redirect',
        pathname,
        destination,
        hasPendingOnboardingContinuation,
      })
      window.history.replaceState({}, '', destination)
      setPathname(destination)
      return
    }

  }, [
    hasPendingOnboardingContinuation,
    hasSession,
    pathname,
    showAdminPage,
    showForgotPasswordPage,
    showLoginPage,
    showOnboardingPage,
    showResetPasswordPage,
  ])

  if (showLoginPage) {
    return <LoginPage />
  }

  if (showOnboardingPage) {
    if (pathname === LEGAL_ROUTES.onboarding.ativacao) {
      return <InstitutionalOnboardingWizardPage />
    }

    return <RegisterPage />
  }

  if (showForgotPasswordPage) {
    return <ForgotPasswordPage />
  }

  if (showResetPasswordPage) {
    return <ResetPasswordPage />
  }

  if (showHomePage) {
    return <HomePublicPage />
  }

  if (showDiscoveryPage) {
    return <DiscoveryPage />
  }

  if (showTransparencyPage) {
    return <TransparencyPage />
  }

  if (showForOfficesPage) {
    return <HomePublicPage />
  }

  if (showAdminPage) {
    return <LegalAdminApp />
  }

  if (clientPortalRoute) {
    const portalCaseId = clientPortalRoute.caseId
    const portalToken = clientPortalRoute.token

    if (portalCaseId === null || portalToken === null) {
      return <RouteNotFoundPage />
    }

    if (!isValidPublicRouteSegment(portalCaseId) || !isValidPublicRouteSegment(portalToken)) {
      return <RouteNotFoundPage />
    }

    return <ClientPortalPage caseId={portalCaseId} token={portalToken} />
  }

  if (seoLandingRoute) {
    if (!seoLandingRoute.city || !seoLandingRoute.specialty || !isValidPublicRouteSegment(seoLandingRoute.city) || !isValidPublicRouteSegment(seoLandingRoute.specialty)) {
      return <RouteNotFoundPage />
    }

    return (
      <Suspense fallback={<RouteLoadingPage />}>
        <SeoLandingPage city={seoLandingRoute.city} specialty={seoLandingRoute.specialty} />
      </Suspense>
    )
  }

  if (officeIdFromCanonicalPath) {
    if (!isValidPublicRouteSegment(officeIdFromCanonicalPath)) {
      return <RouteNotFoundPage />
    }

    return <OfficeProfilePage officeId={officeIdFromCanonicalPath} />
  }

  return <HomePublicPage />
}

export default function AppLegal() {
  return (
    <Suspense fallback={<RouteLoadingPage />}>
      <LegalRoot />
    </Suspense>
  )
}
