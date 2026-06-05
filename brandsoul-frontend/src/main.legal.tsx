import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import AppLegal from './AppLegal.tsx'
import './index.css'
import './design-system/foundation/tokens.css'
import './design-system/styles/components.css'
import './app/styles/globals.css'
import './app/styles/motionSystem.css'
import './app/styles/responsiveContracts.css'
import './truth/truthEnforcement.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppLegal />
  </StrictMode>,
)
