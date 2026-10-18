import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TravelPhoto } from '../types'
import { validPoint } from '../discovery/places'

export default function TravelMap({ photos }: { photos: TravelPhoto[] }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const map = L.map(host.current, { scrollWheelZoom: false }).setView([20, 0], 2)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 18 }).addTo(map)
    const points: L.LatLngTuple[] = []
    for (const photo of photos) {
      if (photo.lat === undefined || photo.lon === undefined || !validPoint({ lat: photo.lat, lon: photo.lon })) continue
      const point: L.LatLngTuple = [photo.lat, photo.lon]
      points.push(point)
      const label = document.createElement('span')
      label.textContent = `${photo.city}, ${photo.country} · ${photo.capturedAt.slice(0, 10)}`
      L.circleMarker(point, { radius: 7, color: '#225aba', fillOpacity: 0.8 }).bindPopup(label).addTo(map)
    }
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 12 })
    return () => { map.remove() }
  }, [photos])
  return <div className="travel-map" ref={host} role="region" aria-label="Map of places from your photos" />
}
