import { cn } from "@/lib/utils"

type TitleCardSkeletonProps = {
  className?: string
}

export function TitleCardSkeleton({ className }: Readonly<TitleCardSkeletonProps>) {
  return (
    <article className={cn("relative aspect-2/3 overflow-hidden rounded-xl bg-muted", className)}>
      <div className="absolute inset-0 animate-pulse bg-muted-foreground/10" />

      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2 sm:p-3">
        <div className="h-5 w-16 rounded-md bg-white/20" />
        <div className="h-5 w-10 rounded-md bg-white/20" />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-2 sm:p-3">
        <div className="h-3 w-3/4 rounded bg-white/20" />
        <div className="h-3 w-1/2 rounded bg-white/20" />
      </div>
    </article>
  )
}

