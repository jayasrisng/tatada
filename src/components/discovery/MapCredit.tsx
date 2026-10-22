import { useEffect, useState } from 'react'

/** OSM permits collapsing visible attribution after five seconds. Full credits live in Profile. */
export function MapCredit() {
  const [open,setOpen]=useState(true)
  useEffect(()=>{const timer=setTimeout(()=>setOpen(false),6000);return()=>clearTimeout(timer)},[])
  return <span className="map-credit">{open&&<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>}<button className="iconbtn" aria-label="Map credits" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>ⓘ</button></span>
}
