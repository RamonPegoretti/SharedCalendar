import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Each person's background photo is a private file in their own folder.
const BUCKET = 'backgrounds'
const pathFor = (userId: string) => `${userId}/background.jpg`
const cacheKey = (userId: string) => `background:${userId}`

// Long side of the stored photo: sharp on a phone, small to download.
const MAX_SIDE = 1600
const QUALITY = 0.82

function cached(userId: string): string | null {
  try {
    return localStorage.getItem(cacheKey(userId))
  } catch {
    return null
  }
}

function remember(userId: string, url: string | null) {
  try {
    if (url) localStorage.setItem(cacheKey(userId), url)
    else localStorage.removeItem(cacheKey(userId))
  } catch {
    // storage full or unavailable: the photo just loads from the server next time
  }
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** Opens a picked photo so it can be shown and cropped. */
export async function loadPhoto(file: Blob): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = URL.createObjectURL(file)
  await img.decode()
  return img
}

/** The part of the photo to keep, in the photo's own pixels. */
export interface Crop {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Cuts the chosen part out of the photo as a JPEG shaped like `width` x
 * `height`, no larger than MAX_SIDE on its long side and never enlarged.
 */
export async function cropPhoto(img: HTMLImageElement, crop: Crop, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height), crop.width / width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', QUALITY),
  )
}

/**
 * The signed-in person's background photo, as a URL ready for CSS.
 * Shows the copy saved on this device at once, then checks the server.
 */
export function useBackground(userId: string) {
  const [url, setUrl] = useState<string | null>(() => cached(userId))

  useEffect(() => {
    let cancelled = false
    supabase.storage
      .from(BUCKET)
      .download(pathFor(userId), {}, { cache: 'no-store' })
      .then(async ({ data, error }) => {
        if (cancelled) return
        if (data) {
          const next = await toDataUrl(data)
          if (cancelled) return
          remember(userId, next)
          setUrl(next)
        } else if (error && 'status' in error && (error.status === 400 || error.status === 404)) {
          // No photo on the account (removed on another device, or never set).
          remember(userId, null)
          setUrl(null)
        }
        // Any other error (offline): keep the copy on this device.
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const choose = useCallback(
    async (blob: Blob) => {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(pathFor(userId), blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '0' })
      if (error) throw error
      const next = await toDataUrl(blob)
      remember(userId, next)
      setUrl(next)
    },
    [userId],
  )

  const remove = useCallback(async () => {
    const { error } = await supabase.storage.from(BUCKET).remove([pathFor(userId)])
    if (error) throw error
    remember(userId, null)
    setUrl(null)
  }, [userId])

  return { url, choose, remove }
}

export type Background = ReturnType<typeof useBackground>
