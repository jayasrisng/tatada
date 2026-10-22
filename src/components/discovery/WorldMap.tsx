import { useEffect, useRef, useState } from 'react'
import { geoNaturalEarth1, geoPath, geoGraticule10, geoCentroid } from 'd3-geo'
import { countryCaption } from '../../travel/captions'
import { countryCode } from '../../travel/countries'

const W = 1000, H = 560
const projection = geoNaturalEarth1().fitExtent([[18, 22], [W - 18, H - 22]], { type: 'Sphere' })
const path = geoPath(projection).digits(1)
interface Shape { code?: string; name: string; d: string; center: [number, number] }
let cached: Promise<Shape[]> | undefined
function loadShapes() {
  cached ??= Promise.all([import('topojson-client'), import('world-atlas/countries-110m.json')]).then(([topo, atlas]) => {
    const data = atlas.default
    const fc = topo.feature(data as never, data.objects.countries as never) as unknown as GeoJSON.FeatureCollection
    return fc.features.filter((f) => f.id !== '010').map((f) => ({ code: countryCode(String(f.properties?.name)), name: String(f.properties?.name), d: path(f) ?? '', center: projection(geoCentroid(f)) ?? [W / 2, H / 2] }))
  }).catch((error) => { cached = undefined; throw error })
  return cached
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const bound = (v: { x: number; y: number; k: number }) => ({ k: v.k, x: clamp(v.x, W * (1 - v.k), 0), y: clamp(v.y, H * (1 - v.k), 0) })

/** Local vector geography. No tile requests, inferred location, or decorative trip markers. */
export function WorldMap({ visited, planned, points = [], focus, label = 'World map of your travels' }: {
  focus?: { point?: {lat: number; lon: number}; country?: string; label: string }; visited: Set<string>; planned: Set<string>; star?: string; points?: { lat: number; lon: number }[]; label?: string; onSelect?: () => void
}) {
  const [shapes, setShapes] = useState<Shape[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<Shape | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; originX: number; originY: number; moved: boolean; country: string | null } | null>(null)
  useEffect(() => { let live = true; loadShapes().then((s) => { if (live) setShapes(s) }, () => { if (live) setFailed(true) }); return () => { live = false } }, [])
  useEffect(() => {
    if (!focus) { setView({x: 0, y: 0, k: 1}); return }
    const country = shapes?.find(s => s.code === focus.country)
    const center = focus.point ? projection([focus.point.lon, focus.point.lat]) : country?.center
    if (center) { const k = focus.point ? 5 : 3; setView(bound({k, x: W/2 - center[0]*k, y: H/2 - center[1]*k})); setSelected(country ?? null) }
  }, [shapes, focus?.point?.lat, focus?.point?.lon, focus?.country, focus?.label])
  const zoom = (factor: number) => setView((v) => {
    const k = clamp(v.k * factor, 1, 5), ratio = k / v.k
    return bound({ k, x: W / 2 - (W / 2 - v.x) * ratio, y: H / 2 - (H / 2 - v.y) * ratio })
  })
  if (failed) return <p role="status">The map couldn't load. Your country list is still available.</p>
  return <section className="atlas" aria-label={label}>
    <svg ref={svg} className="world-map" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${label}. ${visited.size} visited countries. Use the zoom controls; drag to explore.`} tabIndex={0}
      onKeyDown={(e) => {
        if (['+', '='].includes(e.key)) { e.preventDefault(); zoom(1.5) }
        else if (e.key === '-') { e.preventDefault(); zoom(1 / 1.5) }
        else if (e.key === 'Home') { e.preventDefault(); setView({ x: 0, y: 0, k: 1 }) }
        else if (e.key.startsWith('Arrow')) { e.preventDefault(); setView((v) => bound({ ...v, x: v.x + (e.key === 'ArrowRight' ? -80 : e.key === 'ArrowLeft' ? 80 : 0), y: v.y + (e.key === 'ArrowDown' ? -80 : e.key === 'ArrowUp' ? 80 : 0) })) }
      }}
      onPointerDown={(e) => { const rect = e.currentTarget.getBoundingClientRect(); drag.current = { x: e.clientX, y: e.clientY, originX: view.x, originY: view.y, moved: false, country: (e.target as Element).getAttribute('data-country') }; if (view.k > 1 && rect.width) e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => {
        const d = drag.current, rect = e.currentTarget.getBoundingClientRect()
        if (!d || !rect.width) return
        const dx = e.clientX - d.x, dy = e.clientY - d.y
        if (Math.hypot(dx, dy) > 6) d.moved = true
        if (view.k > 1) setView((v) => bound({ ...v, x: d.originX + dx * W / rect.width, y: d.originY + dy * H / rect.height }))
      }}
      onPointerUp={() => { /* Keep moved until click has fired, to avoid selecting after a pan. */ }}
      onPointerCancel={() => { drag.current = null }}
      onClick={(e) => {
        if (drag.current?.moved) { drag.current = null; return }
        const code = (e.target as Element).getAttribute('data-country') ?? drag.current?.country
        const next = shapes?.find((s) => (s.code ?? s.name) === code)
        if (next) setSelected(next)
        drag.current = null
      }}>
      <g className="map-viewport" transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
        <path className="wm-ocean" d={path({ type: 'Sphere' }) ?? ''} />
        <path className="wm-grid" d={path(geoGraticule10()) ?? ''} />
        <g className="wm-land">{(shapes ?? []).map((s) => <path key={`${s.code ?? ''}:${s.name}`} data-country={s.code ?? s.name} d={s.d} className={[s.code && visited.has(s.code) ? 'visited' : s.code && planned.has(s.code) ? 'planned' : '', selected?.name === s.name ? 'selected' : ''].join(' ')}><title>{s.name}{s.code && visited.has(s.code) ? ' · visited' : s.code && planned.has(s.code) ? ' · planned' : ''}</title></path>)}</g>
        <g className="wm-points">{points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180).map((p, i) => { const projected = projection([p.lon, p.lat]); return projected ? <circle key={i} cx={projected[0]} cy={projected[1]} r={3 / Math.sqrt(view.k)} /> : null })}</g>
      </g>
    </svg>
    <div className="atlas-tools" role="group" aria-label="Map controls"><button onClick={() => zoom(1.5)} disabled={view.k >= 5} aria-label="Zoom in">+</button><button onClick={() => zoom(1 / 1.5)} disabled={view.k <= 1} aria-label="Zoom out">−</button><button onClick={() => { setView({ x: 0, y: 0, k: 1 }); setSelected(null) }} aria-label="Reset world map">world</button></div>
    <p className="atlas-caption small" role="status">{focus ? focus.label : selected ? `${selected.name} · ${countryCaption(selected.code, selected.name)}` : shapes ? '' : 'Drawing your world…'}</p>
  </section>
}
