import { useEffect, useRef } from 'react'

// How far (px) the finger must travel sideways, and how much more sideways
// than up/down, before a touch counts as a swipe instead of a scroll or tap.
const MIN_DISTANCE = 60
const MIN_RATIO = 1.5
const MAX_DURATION = 800
// Touches starting this close to the screen edge are left to the phone's own
// back/forward gesture.
const EDGE = 24

/**
 * Calls onLeft / onRight when the finger swipes across the page. Vertical
 * scrolling and taps work as before; touches inside an open sheet or a text
 * field are ignored.
 */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const handlers = useRef({ onLeft, onRight })
  useEffect(() => {
    handlers.current = { onLeft, onRight }
  })

  useEffect(() => {
    let start: { x: number; y: number; at: number } | null = null
    // The click that some browsers still fire after a swipe must not open a day.
    let swallowClick = false

    function onStart(e: TouchEvent) {
      const target = e.target as Element
      const t = e.touches[0]
      if (
        e.touches.length !== 1 ||
        target.closest('.sheet-backdrop, input, textarea, select') ||
        t.clientX < EDGE ||
        t.clientX > window.innerWidth - EDGE
      ) {
        start = null
        return
      }
      start = { x: t.clientX, y: t.clientY, at: Date.now() }
    }

    function onEnd(e: TouchEvent) {
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const quick = Date.now() - start.at < MAX_DURATION
      start = null
      if (!quick || Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * MIN_RATIO) return
      swallowClick = true
      setTimeout(() => (swallowClick = false), 400)
      if (dx < 0) handlers.current.onLeft()
      else handlers.current.onRight()
    }

    function onClick(e: MouseEvent) {
      if (!swallowClick) return
      swallowClick = false
      e.preventDefault()
      e.stopPropagation()
    }

    const cancel = () => (start = null)
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', cancel)
      document.removeEventListener('click', onClick, true)
    }
  }, [])
}
