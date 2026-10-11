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

/** Shrinks a picked photo to a JPEG no larger than MAX_SIDE on its long side. */
async function shrink(file: File): Promise<Blob> {
  const src = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', QUALITY),
    )
  } finally {
    URL.revokeObjectURL(src)
  }
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
    async (file: File) => {
      const blob = await shrink(file)
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
