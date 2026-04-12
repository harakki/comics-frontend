"use client"

import type { ComponentProps, ReactNode } from "react"
import Link from "next/link"
import {
  ArrowRight01Icon,
  BookOpen01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { MediaImage } from "@/components/ui/media-image"
import type {
  TitleResponse,
  UserCollectionResponse,
} from "@/lib/api/api.schemas"
import { buildLoginHref } from "@/lib/axios-instance"
import { formatDate, getCollectionTitleCount } from "@/lib/user-space"
import { cn } from "@/lib/utils"

type HugeIcon = ComponentProps<typeof HugeiconsIcon>["icon"]

type HeroAction = {
  href: string
  label: string
  icon?: HugeIcon
  variant?: ComponentProps<typeof Button>["variant"]
}

function PreviewCover({
  title,
  className,
}: Readonly<{
  title?: TitleResponse
  className?: string
}>) {
  if (!title) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-dashed border-border/70 bg-muted/60",
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-muted",
        className
      )}
    >
      <MediaImage
        mediaId={title.mainCoverMediaId}
        alt={title.name || "Обложка тайтла"}
        fill
        className="object-cover"
        fallback={
          <div className="flex h-full items-center justify-center bg-muted text-[11px] text-muted-foreground">
            Нет обложки
          </div>
        }
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent" />
    </div>
  )
}

export function UserSpacePage({
  children,
  className,
}: Readonly<{
  children: ReactNode
  className?: string
}>) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-120 overflow-hidden">
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-28 -left-24 h-72 w-72 rounded-full bg-primary/12 blur-3xl" />
      </div>

      <div
        className={cn(
          "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8",
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function MetricTile({
  icon,
  label,
  value,
  hint,
  className,
}: Readonly<{
  icon: HugeIcon
  label: string
  value: string
  hint?: string
  className?: string
}>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border/70 bg-background/85 p-4 shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
        <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4" />
        <span>{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function DashboardHero({
  eyebrow,
  title,
  description,
  badges,
  actions = [],
  aside,
}: Readonly<{
  eyebrow?: string
  title: string
  description: string
  badges?: ReactNode
  actions?: HeroAction[]
  aside?: ReactNode
}>) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur xl:p-8">
      <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent" />

      <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {eyebrow ? (
            <div className="text-[11px] font-medium tracking-[0.24em] text-muted-foreground uppercase">
              {eyebrow}
            </div>
          ) : null}

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl xl:text-5xl">
              {title}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {description}
            </p>
          </div>

          {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}

          {actions.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {actions.map((action) => (
                <Button
                  key={`${action.href}-${action.label}`}
                  asChild
                  variant={action.variant || "default"}
                  size="lg"
                >
                  <Link href={action.href} className="gap-2">
                    {action.icon ? (
                      <HugeiconsIcon
                        icon={action.icon}
                        strokeWidth={1.8}
                        className="size-4"
                      />
                    ) : null}
                    <span>{action.label}</span>
                  </Link>
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {aside ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {aside}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function SignInPromptCard({
  returnTo,
  title,
  description,
}: Readonly<{
  returnTo: string
  title: string
  description: string
}>) {
  return (
    <Card className="overflow-hidden border border-border/70 bg-card/90 shadow-sm">
      <CardHeader className="border-b border-border/70">
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={UserGroupIcon}
            strokeWidth={1.8}
            className="size-5"
          />
          <span>{title}</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "Сохраняйте тайтлы в библиотеку",
            "Собирайте подборки и коллекции",
            "Возвращайтесь к чтению без потерь",
          ].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground"
            >
              {item}
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3 border-t border-border/70 bg-muted/30">
        <Button asChild size="lg">
          <Link href={buildLoginHref(returnTo)}>Войти</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/catalog">Перейти в каталог</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function EmptyStateCard({
  title,
  description,
  actionHref,
  actionLabel,
}: Readonly<{
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}>) {
  return (
    <Card className="border border-dashed border-border/70 bg-background/60 shadow-none">
      <CardContent className="flex flex-col items-start gap-4 py-10">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>

        {actionHref && actionLabel ? (
          <Button asChild variant="outline">
            <Link href={actionHref} className="gap-2">
              <span>{actionLabel}</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={1.8}
                className="size-4"
              />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function CollectionPreviewCard({
  collection,
  previewTitles,
  className,
}: Readonly<{
  collection: UserCollectionResponse
  previewTitles: TitleResponse[]
  className?: string
}>) {
  return (
    <Card
      className={cn("border border-border/70 bg-card/90 shadow-sm", className)}
    >
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              {collection.name || "Коллекция без названия"}
            </CardTitle>
            <CardDescription className="line-clamp-2">
              {collection.description?.trim() ||
                "Собранный набор тайтлов, к которому удобно возвращаться позже."}
            </CardDescription>
          </div>

          <Badge
            variant={collection.isPublic ? "default" : "secondary"}
            className="rounded-full px-3 py-1"
          >
            {collection.isPublic ? "Публичная" : "Приватная"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="grid h-44 grid-cols-[1.2fr_0.8fr] gap-2">
            <PreviewCover
              title={previewTitles[0]}
              className="min-h-44 rounded-[1.5rem]"
            />
            <div className="grid gap-2">
              <PreviewCover title={previewTitles[1]} />
              <PreviewCover title={previewTitles[2]} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className="rounded-full bg-background/70 px-3 py-1"
              >
                {getCollectionTitleCount(collection)} тайтлов
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full bg-background/70 px-3 py-1"
              >
                Обновлено {formatDate(collection.updatedAt)}
              </Badge>
            </div>

            <p className="text-sm leading-6 text-muted-foreground">
              {collection.description?.trim() ||
                "Описание пока не добавлено, но состав коллекции уже можно использовать как быстрый список для чтения."}
            </p>

            <div className="flex flex-wrap gap-2">
              {previewTitles.length > 0 ? (
                previewTitles.map((title) => (
                  <Badge
                    key={title.id || title.slug || title.name}
                    variant="secondary"
                    className="rounded-full px-3 py-1"
                  >
                    {title.name || "Без названия"}
                  </Badge>
                ))
              ) : (
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Наполните коллекцию тайтлами из каталога
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap justify-between gap-3 border-t border-border/70 bg-muted/30">
        <div className="text-sm text-muted-foreground">
          Создана {formatDate(collection.createdAt)}
        </div>
        {collection.id ? (
          <Button asChild variant="ghost">
            <Link href={`/collections/${collection.id}`} className="gap-2">
              <HugeiconsIcon
                icon={BookOpen01Icon}
                strokeWidth={1.8}
                className="size-4"
              />
              <span>Открыть коллекцию</span>
            </Link>
          </Button>
        ) : (
          <Button asChild variant="ghost">
            <Link href="/catalog" className="gap-2">
              <HugeiconsIcon
                icon={BookOpen01Icon}
                strokeWidth={1.8}
                className="size-4"
              />
              <span>Открыть каталог</span>
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
