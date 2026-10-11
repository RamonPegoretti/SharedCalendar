import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cropPhoto, loadPhoto } from '../lib/background'

interface Props {
  file: File
  onCancel: () => void
  onConfirm: (photo: Blob) => void
}

/** Where the photo sits on screen: its zoom and its top-left corner. */
interface View {
  scale: number
  x: number
  y: number
}

const MAX_ZOOM = 5
// Tiles drawn over the photo so it's clear how it will sit behind the month.
const PREVIEW_TILES = 35

/**
 * Full-screen preview of a picked photo: drag to move it, pinch (or scroll, or
 * use the slider) to zoom, then confirm. The screen is the frame, so what you
 * see is what becomes the background.
 */
export default function PhotoCropper({ file, onCancel, onConfirm }: Props) {
  const { t } = useTranslation()
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  useEffect(() => {
    let photo: HTMLImageElement | null = null
    let cancelled = false
    loadPhoto(file).then(
      (loaded) => {
        photo = loaded
        if (cancelled) return URL.revokeObjectURL(loaded.src)
        const { w, h } = frameSize()
        const scale = coverScale(loaded, w, h)
        setView({ scale, x: (w - loaded.naturalWidth * scale) / 2, y: (h - loaded.naturalHeight * scale) / 2 })
        setImg(loaded)
      },
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
      if (photo) URL.revokeObjectURL(photo.src)
    }
  }, [file])

  function frameSize() {
    const r = frame.current?.getBoundingClientRect()
    return { w: r?.width ?? window.innerWidth, h: r?.height ?? window.innerHeight }
  }

  /** Keeps the photo covering the whole screen, with no empty edges. */
  function clamp(next: View): View {
    if (!img) return next
    const { w, h } = frameSize()
    const min = coverScale(img, w, h)
    const scale = Math.min(Math.max(next.scale, min), min * MAX_ZOOM)
    const pw = img.naturalWidth * scale
    const ph = img.naturalHeight * scale
    return {
      scale,
      x: Math.min(0, Math.max(w - pw, next.x)),
      y: Math.min(0, Math.max(h - ph, next.y)),
    }
  }

  /** Zooms by `factor` keeping the point (cx, cy) under the finger still. */
  function zoomAt(v: View, factor: number, cx: number, cy: number): View {
    const scale = v.scale * factor
    return { scale, x: cx - (cx - v.x) * factor, y: cy - (cy - v.y) * factor }
  }

  function onPointerDown(e: PointerEvent) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // not every browser lets a touch be captured; moves still arrive here
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }

  function onPointerMove(e: PointerEvent) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p)
    const now = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, now)
    setView((v) => {
      if (others.length === 0) return clamp({ ...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y })
      // Two fingers: zoom by how much they spread, around the point between them.
      const o = others[0]
      const before = Math.hypot(prev.x - o.x, prev.y - o.y)
      const after = Math.hypot(now.x - o.x, now.y - o.y)
      if (before < 1) return v
      const midBefore = { x: (prev.x + o.x) / 2, y: (prev.y + o.y) / 2 }
      const midAfter = { x: (now.x + o.x) / 2, y: (now.y + o.y) / 2 }
      const zoomed = zoomAt(v, after / before, midBefore.x, midBefore.y)
      return clamp({ ...zoomed, x: zoomed.x + midAfter.x - midBefore.x, y: zoomed.y + midAfter.y - midBefore.y })
    })
  }

  function onPointerUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId)
  }

  function onWheel(e: WheelEvent) {
    const r = e.currentTarget.getBoundingClientRect()
    const factor = Math.exp(-e.deltaY * 0.002)
    setView((v) => clamp(zoomAt(v, factor, e.clientX - r.left, e.clientY - r.top)))
  }

  // The slider runs from "fills the screen" (1) to MAX_ZOOM, zooming around the middle.
  const min = img ? coverScale(img, frameSize().w, frameSize().h) : 1
  function onSlide(zoom: number) {
    const { w, h } = frameSize()
    setView((v) => clamp(zoomAt(v, (zoom * min) / v.scale, w / 2, h / 2)))
  }

  async function confirm() {
    if (!img) return
    setBusy(true)
    const { w, h } = frameSize()
    const crop = { x: -view.x / view.scale, y: -view.y / view.scale, width: w / view.scale, height: h / view.scale }
    const dpr = window.devicePixelRatio || 1
    try {
      onConfirm(await cropPhoto(img, crop, w * dpr, h * dpr))
    } catch {
      setBusy(false)
      setFailed(true)
    }
  }

  return (
    // Clicks stay here so they don't close the settings sheet underneath.
    <div className="cropper" role="dialog" aria-label={t('settings.backgroundAdjust')} onClick={(e) => e.stopPropagation()}>
      <div
        ref={frame}
        className="cropper-frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {img && (
          <img
            src={img.src}
            alt=""
            draggable={false}
            style={{
              width: img.naturalWidth,
              height: img.naturalHeight,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            }}
          />
        )}
        <div className="cropper-preview" aria-hidden="true">
          {Array.from({ length: PREVIEW_TILES }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>

      <p className="cropper-hint">{failed ? t('settings.backgroundError') : t('settings.backgroundAdjust')}</p>

      <div className="cropper-bar">
        <input
          type="range"
          className="cropper-zoom"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view.scale / min}
          onChange={(e) => onSlide(Number(e.target.value))}
          aria-label={t('settings.backgroundZoom')}
          disabled={!img}
        />
        <div className="cropper-buttons">
          <button type="button" className="pill" onClick={onCancel}>
            {t('settings.backgroundCancel')}
          </button>
          <button type="button" className="primary" onClick={() => void confirm()} disabled={!img || busy}>
            {t('settings.backgroundConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The smallest zoom at which the photo still fills a w x h frame. */
function coverScale(img: HTMLImageElement, w: number, h: number) {
  return Math.max(w / img.naturalWidth, h / img.naturalHeight)
}
