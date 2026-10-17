import { useEffect } from 'react'
import { useStore } from './state/store'
import { go, useRoute } from './state/ui'
import { ChalkDefs } from './components/Doodle'
import { TabBar } from './components/TabBar'
import { MagicSheet } from './components/MagicSheet'
import { Home } from './screens/Home'
import { Trips } from './screens/Trips'
import { TripWorkspace } from './screens/TripWorkspace'
import { NewTrip } from './screens/NewTrip'
import { Tasks } from './screens/Tasks'
import { Style } from './screens/Style'
import { PrintView } from './screens/PrintView'
import { Welcome } from './screens/Welcome'

export function App() {
  const route = useRoute()
  const { state } = useStore()
  const [root, id, tab, sub] = route

  useEffect(() => {
    if (!state.onboarded && root !== 'welcome') go('/welcome')
  }, [state.onboarded, root])

  let screen
  switch (root) {
    case undefined:
      screen = <Home />
      break
    case 'trips':
      screen = <Trips />
      break
    case 'trip':
      screen = tab === 'print' ? <PrintView id={id} doc={sub} /> : <TripWorkspace id={id} tab={tab} />
      break
    case 'new':
      screen = <NewTrip />
      break
    case 'tasks':
      screen = <Tasks />
      break
    case 'style':
      screen = <Style />
      break
    case 'welcome':
      screen = <Welcome />
      break
    default:
      screen = <Home />
  }

  const chromeless = root === 'welcome' || root === 'new' || tab === 'print'
  const current = root === 'trip' ? 'trips' : (root ?? '')

  return (
    <div className="frame">
      <ChalkDefs />
      <main className={`app ${chromeless ? 'chromeless' : ''}`}>{screen}</main>
      {!chromeless && <TabBar current={current} tripId={root === 'trip' ? id : undefined} />}
      <MagicSheet />
    </div>
  )
}
