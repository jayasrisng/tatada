import { useRef, useState } from 'react'
import type { Garment } from '../../types'
import { garmentImage } from '../../style/images'

/* Individual transparent garment images are layered on a front-facing figure.
 * Uploaded reference photos use a color silhouette, never a person-photo texture.
 * Turning the board is decorative: this is a 2D outfit preview, not a fit simulation.
 */

const SHAPES = {
  top: 'M70 92 L130 92 L146 104 L156 150 L142 154 L134 124 L136 196 L64 196 L66 124 L58 154 L44 150 L54 104 Z',
  dress: 'M72 92 L128 92 L140 104 L150 150 L138 154 L130 126 L156 292 L44 292 L70 126 L62 154 L50 150 L60 104 Z',
  pants: 'M64 190 L136 190 L134 312 L106 312 L100 214 L94 312 L66 312 Z',
  shorts: 'M64 190 L136 190 L138 238 L104 238 L100 214 L96 238 L62 238 Z',
  layerL: 'M60 90 L90 90 L88 206 L54 206 L56 120 L40 176 L28 172 L48 102 Z',
  layerR: 'M110 90 L140 90 L152 102 L172 172 L160 176 L144 120 L146 206 L112 206 Z',
} as const

export function Avatar({ outfit, size = 220, still = false }: { outfit: Garment[]; size?: number; still?: boolean }) {
  const [turn, setTurn] = useState(0)
  const drag = useRef<{ x: number; t: number } | null>(null)
  const slot = (c: Garment['category']) => outfit.find((g) => g.category === c)
  const dress = slot('dress')
  const top = dress ? undefined : slot('top')
  const bottom = dress ? undefined : slot('bottom')
  const layer = slot('layer')
  const shoes = slot('shoes')
  const short = bottom && /short|skirt/i.test(bottom.name)
  const extracted = (g: Garment) => g.source === 'photo' || g.isolated === true
  const piece = (g: Garment, x: number, y: number, width: number, height: number, fallback: string) =>
    g.image && extracted(g)
      ? <image href={garmentImage(g.image)} x={x} y={y} width={width} height={height} preserveAspectRatio="none" />
      : <path d={fallback} fill={g.color} className="avatar-cloth" />

  return (
    <div
      className={`avatar-3d ${still ? 'still' : ''}`}
      style={{ width: size, height: size * 1.6 }}
      onPointerDown={(e) => {
        if (still) return
        drag.current = { x: e.clientX, t: turn }
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
      }}
      onPointerMove={(e) => drag.current && setTurn(Math.max(-55, Math.min(55, drag.current.t + (e.clientX - drag.current.x) / 2)))}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      role="img"
      aria-label={outfit.length ? `Outfit figure wearing ${outfit.map((g) => g.name).join(', ')}` : 'Stick figure'}
    >
      <div className="avatar-body" style={{ transform: `rotateY(${turn}deg)` }}>
        <svg viewBox="0 0 200 340" width="100%" height="100%">
          <ellipse className="avatar-shadow" cx="100" cy="330" rx="54" ry="7" />
          <g className="avatar-ink" style={{ filter: 'var(--stroke-filter)' }}>
            <circle cx="100" cy="50" r="24" className="avatar-skin" />
            <path className="avatar-face" d="M90 46q3-4 6 0M104 46q3-4 6 0M92 58q8 7 16 0" />
            <path className="avatar-bone" d="M100 74V190M100 96L50 160M100 96L150 160M100 190L82 318M100 190L118 318" />
          </g>
          {/* Transparent product silhouettes retain their actual collars, sleeves and hems. */}
          <g>
            {bottom && piece(bottom, 63, 186, 74, short ? 55 : 128, short ? SHAPES.shorts : SHAPES.pants)}
            {top && piece(top, 43, 90, 114, 109, SHAPES.top)}
            {dress && piece(dress, 43, 90, 114, 218, SHAPES.dress)}
            {layer && piece(layer, 28, 88, 144, 123, `${SHAPES.layerL} ${SHAPES.layerR}`)}
            {shoes && (shoes.image && extracted(shoes)
              ? <image href={garmentImage(shoes.image)} x="57" y="300" width="86" height="32" preserveAspectRatio="none" />
              : <g fill={shoes.color}><ellipse cx="78" cy="320" rx="15" ry="8" /><ellipse cx="122" cy="320" rx="15" ry="8" /></g>)}
          </g>
        </svg>
      </div>
    </div>
  )
}
