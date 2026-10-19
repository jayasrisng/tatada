import { useEffect, useState } from 'react'
import { countryCode } from '../travel/countries'

/*
 * Tatada's own chalk world map: Natural Earth 1:110m country shapes drawn as
 * SVG paths (no map tiles, no network). Visited countries are filled, planned
 * ones dashed. Small countries without a shape at this scale only appear in
 * the lists. Shapes load in a separate chunk the first time a map is shown.
 */
const W = 1000, TOP = 80, BOTTOM = -56, H = Math.round((W * (TOP - BOTTOM)) / 360)
const x = (lon: number) => ((lon + 180) / 360) * W
const y = (lat: number) => ((TOP - lat) / (TOP - BOTTOM)) * H

interface Shape { code?: string; name: string; d: string; center: [number, number] }
let cached: Promise<Shape[]> | undefined
function loadShapes() {
  cached ??= Promise.all([import('topojson-client'), import('world-atlas/countries-110m.json')]).then(([topo, atlas]) => {
    const data = (atlas as { default?: unknown }).default ?? atlas
    const fc = topo.feature(data as never, (data as { objects: { countries: never } }).objects.countries) as unknown as { features: { id?: string; properties: { name: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } | null }[] }
    return fc.features.filter((f) => f.geometry && f.id !== '010').map((f) => {
      const polys = (f.geometry!.type === 'Polygon' ? [f.geometry!.coordinates] : f.geometry!.coordinates) as number[][][][]
      // Star position: middle of the largest outer ring (so Alaska doesn't pull the US star north-west).
      const main = polys.map((p) => p[0]).sort((a, b) => b.length - a.length)[0]
      const lons = main.map((p) => p[0]), lats = main.map((p) => p[1])
      const center: [number, number] = [x((Math.min(...lons) + Math.max(...lons)) / 2), y((Math.min(...lats) + Math.max(...lats)) / 2)]
      const d = polys.flatMap((poly) => poly.map((ring) => {
        let path = '', prev: number | undefined
        for (const [lon, lat] of ring) {
          // Start a new sub-path instead of drawing a line across the antimeridian.
          path += `${prev === undefined || Math.abs(lon - prev) > 180 ? 'M' : 'L'}${x(lon).toFixed(1)},${y(Math.max(BOTTOM, lat)).toFixed(1)}`
          prev = lon
        }
        return `${path}Z`
      })).join('')
      return { code: countryCode(f.properties.name), name: f.properties.name, d, center }
    })
  })
  return cached
}

const STAR = 'M0,-14 L4,-4 L14,-4 L6,3 L9,13 L0,7 L-9,13 L-6,3 L-14,-4 L-4,-4 Z'

export function WorldMap({ visited, planned, star, points = [], label = 'World map of your travels', onSelect }: {
  visited: Set<string>
  planned: Set<string>
  /** Country of the trip happening now or next: marked with the Tatada star. */
  star?: string
  points?: { lat: number; lon: number }[]
  label?: string
  onSelect?: () => void
}) {
  const [shapes, setShapes] = useState<Shape[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { let live = true; loadShapes().then((s) => live && setShapes(s), () => live && setFailed(true)); return () => { live = false } }, [])
  if (failed) return <p className="dim small">The map couldn't load. Your lists below are unaffected.</p>
  const summary = `${visited.size} visited${planned.size ? `, ${[...planned].filter((c) => !visited.has(c)).length} planned` : ''}`
  return (
    <svg className={`world-map ${onSelect ? 'tappable' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${summary}`} onClick={onSelect}>
      <g className="wm-land">
        {(shapes ?? []).map((s, i) => (
          <path key={i} d={s.d} className={s.code && visited.has(s.code) ? 'visited' : s.code && planned.has(s.code) ? 'planned' : undefined}>
            <title>{s.name}</title>
          </path>
        ))}
      </g>
      <g className="wm-points">{points.map((p, i) => <circle key={i} cx={x(p.lon)} cy={y(p.lat)} r={4} />)}</g>
      {star && shapes?.find((s) => s.code === star) && (() => { const [cx, cy] = shapes.find((s) => s.code === star)!.center; return <path className="wm-star" d={STAR} transform={`translate(${cx.toFixed(1)},${cy.toFixed(1)})`} /> })()}
    </svg>
  )
}
