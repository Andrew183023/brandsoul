import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './app/styles/globals.css'
import App from './App.tsx'
import { hasEntityBirthContinuationPending } from './lib/entityBirth.ts'
import { loadBrandPersona } from './lib/persona'
import { useAuthSession } from './lib/session'
import BrandInteractionPage from './pages/BrandInteractionPage.tsx'
import CreatePersonaPage from './pages/CreatePersonaPage.tsx'
import CustomerChatPage from './pages/CustomerChatPage.tsx'
import DiscoveryPage from './pages/DiscoveryPage.tsx'
import EntityCasePage from './pages/EntityCasePage.tsx'
import EntityExportPage from './pages/EntityExportPage.tsx'
import GlobalFeedPage from './pages/GlobalFeedPage.tsx'
import EntityPublicPage from './pages/EntityPublicPage.tsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import PersonaLabPage from './pages/PersonaLabPage.tsx'
import RegisterPage from './pages/RegisterPage.tsx'
import ResetPasswordPage from './pages/ResetPasswordPage.tsx'

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
        <a href="/discover">Explorar entidades</a>
      </div>
    </main>
  )
}

function LegacyBrandRoute({ brandSlug }: { brandSlug: string }) {
  useEffect(() => {
    console.warn('[LegacyBrandRoute] /brands/:slug is deprecated. Use /entity/:id for new public capabilities.')
  }, [])

  return <CustomerChatPage brandSlug={brandSlug} />
}

function Root() {
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

  const hasSavedPersona = Boolean(loadBrandPersona())
  const hasSession = Boolean(authSession?.token)
  const hasPendingBirthContinuation = hasEntityBirthContinuationPending()
  const showLoginPage = pathname === '/login'
  const showRegisterPage = pathname === '/register'
  const showForgotPasswordPage = pathname === '/forgot-password'
  const showResetPasswordPage = pathname === '/reset-password'
  const showCreatePersonaPage = pathname === '/create' || pathname === '/create-persona'
  const showPersonaLabPage = pathname === '/persona-lab'
  const showDiscoveryPage = pathname === '/discover'
  const showGlobalFeedPage = pathname === '/feed'
  const showBrandInteractionPage = pathname === '/interaction' || pathname === '/centelha-interacao'
  const showAdminPage = pathname === '/admin' || pathname.startsWith('/admin/')
  const publicBrandMatch = pathname.match(/^\/brands\/([^/]+)\/?$/)
  const publicBrandSlug = decodeRouteSegment(publicBrandMatch?.[1])
  const publicEntityCaseMatch = pathname.match(/^\/entity\/([^/]+)\/cases\/([^/]+)\/?$/)
  const publicEntityCaseEntityId = decodeRouteSegment(publicEntityCaseMatch?.[1])
  const publicEntityCaseId = decodeRouteSegment(publicEntityCaseMatch?.[2])
  const publicEntityExportMatch = pathname.match(/^\/entity\/([^/]+)\/export\/([^/]+)\/?$/)
  const publicEntityExportId = decodeRouteSegment(publicEntityExportMatch?.[1])
  const publicExportId = decodeRouteSegment(publicEntityExportMatch?.[2])
  const publicEntityMatch = pathname.match(/^\/entity\/([^/]+)\/?$/)
  const publicEntityId = decodeRouteSegment(publicEntityMatch?.[1])

  useEffect(() => {
    if (showAdminPage && !hasSession) {
      window.history.replaceState({}, '', '/login')
      setPathname('/login')
      return
    }

    if ((showLoginPage || showForgotPasswordPage || showResetPasswordPage) && hasSession && !hasPendingBirthContinuation) {
      window.history.replaceState({}, '', '/admin')
      setPathname('/admin')
      return
    }

    if (showRegisterPage && hasSession && !hasPendingBirthContinuation) {
      window.history.replaceState({}, '', '/admin')
      setPathname('/admin')
    }
  }, [hasPendingBirthContinuation, hasSession, showAdminPage, showForgotPasswordPage, showLoginPage, showRegisterPage, showResetPasswordPage])

  if (showLoginPage) {
    return <LoginPage />
  }

  if (showRegisterPage) {
    return <RegisterPage />
  }

  if (showForgotPasswordPage) {
    return <ForgotPasswordPage />
  }

  if (showResetPasswordPage) {
    return <ResetPasswordPage />
  }

  if (showCreatePersonaPage) {
    return <CreatePersonaPage />
  }

  if (showPersonaLabPage) {
    return <PersonaLabPage />
  }

  if (showDiscoveryPage) {
    return <DiscoveryPage />
  }

  if (showGlobalFeedPage) {
    return <GlobalFeedPage />
  }

  if (showBrandInteractionPage) {
    return <BrandInteractionPage />
  }

  if (showAdminPage) {
    return <App />
  }

  if (publicBrandSlug) {
    if (!isValidPublicRouteSegment(publicBrandSlug)) {
      return <RouteNotFoundPage />
    }

    // Legacy compatibility route only. Public product evolution must target /entity/:id.
    return <LegacyBrandRoute brandSlug={publicBrandSlug} />
  }

  if (publicEntityCaseEntityId && publicEntityCaseId) {
    if (!isValidPublicRouteSegment(publicEntityCaseEntityId) || !isValidPublicRouteSegment(publicEntityCaseId)) {
      return <RouteNotFoundPage />
    }

    return <EntityCasePage entityId={publicEntityCaseEntityId} caseId={publicEntityCaseId} />
  }

  if (publicEntityExportId && publicExportId) {
    if (!isValidPublicRouteSegment(publicEntityExportId) || !isValidPublicRouteSegment(publicExportId)) {
      return <RouteNotFoundPage />
    }

    return <EntityExportPage entityId={publicEntityExportId} exportId={publicExportId} />
  }

  if (publicEntityId) {
    if (!isValidPublicRouteSegment(publicEntityId)) {
      return <RouteNotFoundPage />
    }

    return <EntityPublicPage entityId={publicEntityId} />
  }

  if (!hasSavedPersona) {
    return <CreatePersonaPage />
  }

  return <CustomerChatPage />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
