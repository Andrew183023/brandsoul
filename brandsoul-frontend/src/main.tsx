import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadBrandPersona } from './lib/persona'
import BrandInteractionPage from './pages/BrandInteractionPage.tsx'
import CreatePersonaPage from './pages/CreatePersonaPage.tsx'
import CustomerChatPage from './pages/CustomerChatPage.tsx'

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
  const showCreatePersonaPage = pathname === '/create' || pathname === '/create-persona' || !hasSavedPersona
  const showBrandInteractionPage = pathname === '/interaction' || pathname === '/centelha-interacao'
  const showAdminPage = pathname === '/admin'

  if (showCreatePersonaPage) {
    return <CreatePersonaPage />
  }

  if (showBrandInteractionPage) {
    return <BrandInteractionPage />
  }

  if (showAdminPage) {
    return <App />
  }

  return <CustomerChatPage />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
