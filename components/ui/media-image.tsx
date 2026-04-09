"use client"

import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"

import { getMedia } from "@/lib/api/media/media"
import { cn } from "@/lib/utils"

type MediaImageProps = {
  mediaId?: string
  alt: string
  className?: string
  fallback?: ReactNode
  fill?: boolean
}

type LoadedMediaState = {
  mediaId?: string
  url: string | null
}

export function MediaImage({
  mediaId,
  alt,
  className,
  fallback,
  fill = false,
}: Readonly<MediaImageProps>) {
  const [loadedMedia, setLoadedMedia] = useState<LoadedMediaState>({
    mediaId: undefined,
    url: null,
  })

  useEffect(() => {
    let isMounted = true

    if (!mediaId) {
      return () => {
        isMounted = false
      }
    }

    getMedia()
      .getMediaUrl(mediaId)
      .then((nextUrl) => {
        if (!isMounted) {
          return
        }

        setLoadedMedia({ mediaId, url: nextUrl || null })
      })
      .catch(() => {
        if (!isMounted) {
          return
        }

        setLoadedMedia({ mediaId, url: null })
      })

    return () => {
      isMounted = false
    }
  }, [mediaId])

  const imageClassName = useMemo(() => {
    if (fill) {
      return cn("absolute inset-0 h-full w-full", className)
    }

    return cn("h-full w-full", className)
  }, [className, fill])

  const hasCurrentImage = loadedMedia.mediaId === mediaId && Boolean(loadedMedia.url)

  if (!mediaId || !hasCurrentImage) {
    return (
      fallback ?? (
        <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
          Нет обложки
        </div>
      )
    )
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={loadedMedia.url || ""} alt={alt} className={imageClassName} />
}


