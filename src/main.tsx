import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/caveat/500.css'
import '@fontsource/caveat/700.css'
import '@fontsource/patrick-hand/400.css'
import '@fontsource/cabin-sketch/700.css'
import './styles/global.css'
import { App } from './App'
import { StoreProvider } from './state/store'
import { UIProvider } from './state/ui'
import { ServerProvider } from './state/server'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <ServerProvider>
        <UIProvider>
          <App />
        </UIProvider>
      </ServerProvider>
    </StoreProvider>
  </StrictMode>,
)
