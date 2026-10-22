import {lazy,Suspense} from 'react'
const Panel=lazy(()=>import('./FoCallPanel').then(m=>({default:m.FoVoice})))
export function FoVoice(){return <Suspense fallback={<span>Loading call…</span>}><Panel/></Suspense>}
