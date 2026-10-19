import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/caveat/500.css'
import '@fontsource/caveat/700.css'
import '@fontsource/patrick-hand/400.css'
import '@fontsource/cabin-sketch/700.css'
import './styles/global.css'
import './styles/brand.css'
import { ServerProvider } from './state/server'
import { AuthGate } from './components/AuthGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServerProvider>
      <AuthGate />
    </ServerProvider>
  </StrictMode>,
)
