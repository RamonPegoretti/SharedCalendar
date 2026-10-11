import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react'

/**
 * Colors on the wheel: the hue goes round the edge and fades to grey in the
 * middle. Lightness is fixed so every pick stays readable on dark, light and
 * photo backgrounds.
 */
const GREY = [153, 153, 153]

function hueRgb(h: number) {
  // hsl(h, 90%, 60%)
  const s = 0.9
  const l = 0.6
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  return [0, 8, 4].map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))))
}

/** The color at a hue (0–360, 0 = top) and distance from the middle (0–1). */
function colorAt(h: number, r: number) {
  const rgb = hueRgb(h).map((c, i) => Math.round(GREY[i] + (c - GREY[i]) * r))
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
}

/** Where on the wheel a color sits (the closest spot, for colors picked elsewhere). */
function spotOf(hex: string) {
  const target = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  let best = { h: 0, r: 0, d: Infinity }
  for (let h = 0; h < 360; h += 2) {
    const full = hueRgb(h)
    for (let r = 0; r <= 1; r += 0.02) {
      const d = full.reduce((sum, c, i) => sum + (GREY[i] + (c - GREY[i]) * r - target[i]) ** 2, 0)
      if (d < best.d) best = { h, r, d }
    }
  }
  return best
}

const STOPS = Array.from({ length: 13 }, (_, i) => `hsl(${i * 30} 90% 60%)`).join(', ')

interface Props {
  value: string
  onChange: (color: string) => void
  label: string
}

/** A round color picker: tap or drag anywhere on it. */
export default function ColorWheel({ value, onChange, label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const spot = useMemo(() => spotOf(value), [value])

  function pick(e: PointerEvent<HTMLDivElement>) {
    const box = ref.current!.getBoundingClientRect()
    const dx = e.clientX - (box.left + box.width / 2)
    const dy = e.clientY - (box.top + box.height / 2)
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    const r = Math.min(1, Math.hypot(dx, dy) / (box.width / 2))
    onChange(colorAt(h, r))
  }

  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, [number, number]> = {
      ArrowRight: [10, 0],
      ArrowLeft: [-10, 0],
      ArrowUp: [0, 0.1],
      ArrowDown: [0, -0.1],
    }
    const move = step[e.key]
    if (!move) return
    e.preventDefault()
    onChange(colorAt((spot.h + move[0] + 360) % 360, Math.min(1, Math.max(0, spot.r + move[1]))))
  }

  const angle = (spot.h * Math.PI) / 180
  return (
    <div
      ref={ref}
      className="color-wheel"
      style={{ background: `radial-gradient(closest-side, rgb(${GREY.join(' ')}), transparent), conic-gradient(${STOPS})` }}
      role="slider"
      aria-label={label}
      aria-valuetext={value}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        pick(e)
      }}
      onPointerMove={(e) => e.buttons && pick(e)}
      onKeyDown={key}
    >
      <span
        className="color-wheel-thumb"
        style={{
          background: value,
          left: `${50 + 50 * spot.r * Math.sin(angle)}%`,
          top: `${50 - 50 * spot.r * Math.cos(angle)}%`,
        }}
      />
    </div>
  )
}
