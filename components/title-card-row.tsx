"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { TitleCard, type TitleCardProps } from "@/components/title-card"
import { TitleCardSkeleton } from "@/components/title-card-skeleton"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type TitleCardRowProps = {
  items: TitleCardProps[]
  className?: string
  itemClassName?: string
  emptyText?: string
  isLoading?: boolean
  skeletonCount?: number
}

export function TitleCardRow({
  items,
  className,
  itemClassName,
  emptyText = "Пока нет тайтлов",
  isLoading = false,
  skeletonCount = 8,
}: Readonly<TitleCardRowProps>) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollButtonsState = useCallback(() => {
    const container = scrollContainerRef.current

    if (!container) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }

    setCanScrollLeft(container.scrollLeft > 4)
    setCanScrollRight(
      container.scrollLeft + container.clientWidth < container.scrollWidth - 4,
    )
  }, [])

  useEffect(() => {
    const frameId = globalThis.requestAnimationFrame(updateScrollButtonsState)

    const container = scrollContainerRef.current

    if (!container) {
      globalThis.cancelAnimationFrame(frameId)
      return
    }

    const onScroll = () => {
      updateScrollButtonsState()
    }

    container.addEventListener("scroll", onScroll)
    globalThis.addEventListener("resize", onScroll)

    return () => {
      globalThis.cancelAnimationFrame(frameId)
      container.removeEventListener("scroll", onScroll)
      globalThis.removeEventListener("resize", onScroll)
    }
  }, [items.length, isLoading, updateScrollButtonsState])

  const scrollByStep = (direction: "left" | "right") => {
    const container = scrollContainerRef.current

    if (!container) {
      return
    }

    const offset = Math.max(container.clientWidth * 0.8, 240)

    container.scrollBy({
      left: direction === "left" ? -offset : offset,
      behavior: "smooth",
    })
  }

  if (isLoading) {
    const skeletonItems = Array.from(
      { length: skeletonCount },
      (_, index) => `title-card-row-skeleton-${index + 1}`,
    )

    return (
      <div className={cn("overflow-x-auto pb-2", className)}>
        <div className="flex gap-3">
          {skeletonItems.map((skeletonKey) => (
            <div key={skeletonKey} className="w-40 shrink-0 sm:w-44">
              <TitleCardSkeleton />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => {
            scrollByStep("left")
          }}
          disabled={!canScrollLeft}
          aria-label="Прокрутить влево"
        >
          <span aria-hidden>←</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => {
            scrollByStep("right")
          }}
          disabled={!canScrollRight}
          aria-label="Прокрутить вправо"
        >
          <span aria-hidden>→</span>
        </Button>
      </div>

      <div ref={scrollContainerRef} className="overflow-x-auto pb-2">
        <div className="flex snap-x snap-mandatory gap-3">
          {items.map((item, index) => (
            <div
              key={item.id || item.titleId || item.slug || `${item.name}-${index}`}
              className={cn("w-40 shrink-0 snap-start sm:w-44", itemClassName)}
            >
              <TitleCard {...item} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

