import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadBrandPersona } from './lib/persona'
import { isAuthenticated } from './lib/session'
import BrandInteractionPage from './pages/BrandInteractionPage.tsx'
import CreatePersonaPage from './pages/CreatePersonaPage.tsx'
import CustomerChatPage from './pages/CustomerChatPage.tsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import RegisterPage from './pages/RegisterPage.tsx'
import ResetPasswordPage from './pages/ResetPasswordPage.tsx'

function Root() {
  const [pathname, setPathname] = useState(window.location.pathname)

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
  const hasSession = isAuthenticated()
  const showLoginPage = pathname === '/login'
  const showRegisterPage = pathname === '/register'
  const showForgotPasswordPage = pathname === '/forgot-password'
  const showResetPasswordPage = pathname === '/reset-password'
  const showCreatePersonaPage = pathname === '/create' || pathname === '/create-persona'
  const showBrandInteractionPage = pathname === '/interaction' || pathname === '/centelha-interacao'
  const showAdminPage = pathname === '/admin'
  const publicBrandMatch = pathname.match(/^\/brands\/([^/]+)\/?$/)
  const publicBrandSlug = publicBrandMatch ? decodeURIComponent(publicBrandMatch[1]) : null

  useEffect(() => {
    if (showAdminPage && !hasSession) {
      window.history.replaceState({}, '', '/login')
      setPathname('/login')
      return
    }

    if ((showLoginPage || showRegisterPage || showForgotPasswordPage || showResetPasswordPage) && hasSession) {
      window.history.replaceState({}, '', '/admin')
      setPathname('/admin')
    }
  }, [hasSession, showAdminPage, showForgotPasswordPage, showLoginPage, showRegisterPage, showResetPasswordPage])

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

  if (showBrandInteractionPage) {
    return <BrandInteractionPage />
  }

  if (showAdminPage) {
    return <App />
  }

  if (publicBrandSlug) {
    return <CustomerChatPage brandSlug={publicBrandSlug} />
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
