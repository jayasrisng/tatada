import { useEffect, useState } from 'react'
import type { Trip } from '../types'

const W = 800, H = 560
interface AreaData {checkedAt: string; features: {type: string; name: string; class: string; points: [number,number][]}[]}
const maps = new Map<string, Promise<AreaData>>()
/** A local geographic plot: exact destination coordinates and known stops, without invented streets. */
export function AreaMap({ trip }: { trip: Trip }) {
  const [zoom, setZoom] = useState(1)
  const center = trip.destinationPoint
  const [data, setData] = useState<AreaData | null>(null)
  const asset = ['Los Angeles','LAX'].includes(trip.destination) ? 'los-angeles' : trip.destination === 'Yosemite' ? 'yosemite' : undefined
  useEffect(() => {
    let live = true; setData(null)
    if (asset) {
      let request = maps.get(asset)
      if (!request) { request = fetch(`${import.meta.env.BASE_URL}areas/${asset}.json`).then(r=>{if(!r.ok)throw new Error('No map extract');return r.json()}); maps.set(asset,request); request.catch(()=>maps.delete(asset)) }
      request.then(value=>{if(live)setData(value)},()=>{})
    }
    return ()=>{live=false}
  },[asset])
  if (!center) return <p className="small dim">Add a destination location to open its area map.</p>
  const stops = trip.mapPlaces ?? []
  const cos = Math.cos(center.lat * Math.PI / 180)
  const local = (p: {lat:number;lon:number}) => ({x: (p.lon-center.lon)*111.32*cos, y: (center.lat-p.lat)*111.32})
  const spread = Math.max(trip.destination === 'Yosemite' ? 2.5 : asset === 'los-angeles' ? .55 : 2, ...stops.map(p => Math.max(Math.abs(local(p).x), Math.abs(local(p).y))*1.25))
  const scale = Math.min(W, H) / (spread*2) * zoom
  const project = (p: {lat:number;lon:number}) => {const v=local(p);return {x:W/2+v.x*scale,y:H/2+v.y*scale}}
  const spacing = spread > 3 ? 2 : spread > 1 ? 1 : .2
  const grid = Array.from({length:21},(_,i)=>(i-10)*spacing)
  return <section className="area-map" aria-label={`${trip.destination} area map`}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Local area centered on ${trip.destination}, ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`}>
      <defs><clipPath id="area-window"><rect x="0" y="0" width={W} height={H} rx="24" /></clipPath></defs>
      <g clipPath="url(#area-window)"><rect width={W} height={H} className="area-ground" />
        <g className="area-grid">{grid.map(n=><g key={n}><path d={`M${W/2+n*scale},0V${H}`} /><path d={`M0,${H/2+n*scale}H${W}`} /></g>)}</g>
        <g className="area-geography">{data?.features.map((feature,index)=>{const d=feature.points.map(([lat,lon],i)=>{const p=project({lat,lon});return `${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`}).join('');return <path key={index} d={d} className={`area-feature ${feature.type} ${feature.type==='water' && (feature.points[0][0]!==feature.points.at(-1)![0] || feature.points[0][1]!==feature.points.at(-1)![1]) ? 'waterline' : ''} ${feature.class==='footway'?'footway':''}`}><title>{feature.name || feature.class || feature.type}</title></path>})}</g>
        {stops.map((stop,i)=>{const p=project(stop);return <g key={stop.name} className="area-stop"><circle cx={p.x} cy={p.y} r="5" /><text x={p.x+12} y={p.y+(i%2 ? 20 : -10)}>{stop.name}</text></g>})}
        <g className="area-center"><circle cx={W/2} cy={H/2} r="20" /><circle cx={W/2} cy={H/2} r="5" /><text x={W/2} y={H/2-36} textAnchor="middle">{['Los Angeles','LAX'].includes(trip.destination) ? 'Downtown LA' : trip.destination === 'Yosemite' ? 'Yosemite Valley' : trip.destination}</text></g>
      </g>
      <g className="area-scale"><path d={`M28,${H-32}h${Math.min(120,spacing*scale)}m-${Math.min(120,spacing*scale)},-5v10m${Math.min(120,spacing*scale)},-10v10`} /><text x="28" y={H-46}>{(Math.min(120,spacing*scale)/scale).toFixed(1)} km</text><text x={W-30} y="36" textAnchor="end">N ↑</text></g>
    </svg>
    <div className="area-map-footer"><span>{data ? <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> : `${center.lat.toFixed(4)}°, ${center.lon.toFixed(4)}°`}</span><div><button className="iconbtn" aria-label="Zoom into destination area" onClick={()=>setZoom(v=>Math.min(4,v*1.5))} disabled={zoom>=4}>+</button><button className="iconbtn" aria-label="Zoom out of destination area" onClick={()=>setZoom(v=>Math.max(.5,v/1.5))} disabled={zoom<=.5}>−</button></div></div>
  </section>
}
