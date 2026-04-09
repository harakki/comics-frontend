"use client"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { MediaImage } from "@/components/ui/media-image"
import { CONTENT_RATING_LABELS, TITLE_TYPE_LABELS } from "@/lib/constants"

export type TitleCardProps = {
  id?: string
  titleId?: string
  name?: string
  slug?: string
  mainCoverMediaId?: string
  type?: string
  contentRating?: string
}

export function TitleCard({
  id,
  titleId,
  name,
  slug,
  mainCoverMediaId,
  type,
  contentRating,
}: Readonly<TitleCardProps>) {
  const titleId_ = titleId || id
  const titlePathParam = slug || titleId_ || "unknown"
  const typeLabel = type ? TITLE_TYPE_LABELS[type] || type : undefined
  const contentRatingLabel = contentRating
    ? CONTENT_RATING_LABELS[contentRating] || contentRating
    : undefined

  return (
    <Link href={`/titles/${titlePathParam}`} className="group block">
      <article className="relative aspect-2/3 overflow-hidden rounded-xl">
        <MediaImage
          mediaId={mainCoverMediaId}
          alt={name || "Обложка тайтла"}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          fallback={
            <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
              Нет обложки
            </div>
          }
        />

        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />

        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2 sm:p-3">
          {typeLabel ? (
            <Badge className="border-white/20 bg-black/70 text-[10px] text-white backdrop-blur-sm sm:text-xs">
              {typeLabel}
            </Badge>
          ) : (
            <span />
          )}

          {contentRatingLabel && (
            <Badge className="border-white/20 bg-black/70 text-[10px] text-white backdrop-blur-sm sm:text-xs">
              {contentRatingLabel}
            </Badge>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 p-2 sm:p-3">
          <h3 className="line-clamp-2 text-xs leading-snug font-semibold text-white drop-shadow-sm sm:text-sm">
            {name || "Без названия"}
          </h3>
        </div>
      </article>
    </Link>
  )
}
