import { TitleCard, type TitleCardProps } from "@/components/title-card"
import { TitleCardSkeleton } from "@/components/title-card-skeleton"
import { cn } from "@/lib/utils"

type TitleCardGridProps = {
  items: TitleCardProps[]
  className?: string
  emptyText?: string
  isLoading?: boolean
  skeletonCount?: number
}

export function TitleCardGrid({
  items,
  className,
  emptyText = "Пока нет тайтлов",
  isLoading = false,
  skeletonCount = 10,
}: Readonly<TitleCardGridProps>) {
  if (isLoading) {
    const skeletonItems = Array.from(
      { length: skeletonCount },
      (_, index) => `title-card-grid-skeleton-${index + 1}`,
    )

    return (
      <div
        className={cn(
          "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
          className,
        )}
      >
        {skeletonItems.map((skeletonKey) => (
          <TitleCardSkeleton key={skeletonKey} />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5", className)}>
      {items.map((item, index) => (
        <TitleCard key={item.id || item.titleId || item.slug || `${item.name}-${index}`} {...item} />
      ))}
    </div>
  )
}

