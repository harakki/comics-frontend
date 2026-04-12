"use client"

import type { ComponentProps } from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft01Icon,
  Globe02Icon,
  Link01Icon,
  UserEdit01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { MediaImage } from "@/components/ui/media-image"
import { Skeleton } from "@/components/ui/skeleton"
import { TitleCardGrid } from "@/components/title-card-grid"
import { getAuthors } from "@/lib/api/authors/authors"
import { getTitles } from "@/lib/api/titles/titles"
import type { AuthorResponse, TitleResponse } from "@/lib/api/api.schemas"
import { type TitleCardProps } from "@/components/title-card"

const AUTHOR_LOOKUP_PAGE_SIZE = 24
const TITLE_LOOKUP_PAGE_SIZE = 24

const normalizeParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] || ""
  }

  return value || ""
}

const resolveAuthor = async (param: string) => {
  const normalizedParam = param.trim()

  if (!normalizedParam) {
    return null
  }

  // 1. Try to get by ID
  const directMatch = await getAuthors()
    .getAuthor(normalizedParam)
    .catch(() => null)

  if (directMatch) {
    return directMatch
  }

  // 2. Fallback to search
  const searchResult = await getAuthors()
    .searchAuthors({
      search: normalizedParam,
      size: AUTHOR_LOOKUP_PAGE_SIZE,
    })
    .catch(() => null)

  const matches = searchResult?.content || []
  const normalizedLookup = normalizedParam.toLowerCase()

  return (
    matches.find(
      (item) => (item.slug || "").toLowerCase() === normalizedLookup
    ) ||
    matches.find(
      (item) => (item.id || "").toLowerCase() === normalizedLookup
    ) ||
    matches.find(
      (item) => (item.name || "").trim().toLowerCase() === normalizedLookup
    ) ||
    (matches.length === 1 ? matches[0] : null)
  )
}

const mapTitleToCard = (item: TitleResponse): TitleCardProps => {
  return {
    id: item.id || "",
    slug: item.slug || "",
    name: item.name || "",
    mainCoverMediaId: item.mainCoverMediaId,
    type: item.type,
    contentRating: item.contentRating,
  }
}

function DetailTile({
  icon,
  label,
  value,
}: Readonly<{
  icon: ComponentProps<typeof HugeiconsIcon>["icon"]
  label: string
  value: React.ReactNode
}>) {
  return (
    <div className="rounded-3xl border border-border/70 bg-background/70 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4" />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  )
}

export default function AuthorPage() {
  const params = useParams<{ authorParam: string | string[] }>()
  const authorParam = normalizeParam(params?.authorParam)

  const [author, setAuthor] = useState<AuthorResponse | null>(null)
  const [titles, setTitles] = useState<TitleCardProps[]>([])
  const [isLoading, setIsLoading] = useState(() => Boolean(authorParam))
  const [errorText, setErrorText] = useState<string | null>(null)
  const [isTitlesLoading, setIsTitlesLoading] = useState(false)

  useEffect(() => {
    if (!authorParam) {
      return
    }

    let isMounted = true

    const loadPage = async () => {
      setIsLoading(true)
      setErrorText(null)
      setTitles([])
      setIsTitlesLoading(false)

      const resolvedAuthor = await resolveAuthor(authorParam)

      if (!isMounted) {
        return
      }

      if (!resolvedAuthor) {
        setAuthor(null)
        setTitles([])
        setErrorText("Автор не найден")
        setIsLoading(false)
        return
      }

      setAuthor(resolvedAuthor)
      setIsLoading(false)

      if (!resolvedAuthor.id) {
        setIsTitlesLoading(false)
        return
      }

      setIsTitlesLoading(true)
      const t = await getTitles()
        .searchTitles({
          authorId: resolvedAuthor.id,
          size: TITLE_LOOKUP_PAGE_SIZE,
        })
        .catch(() => null)

      if (!isMounted) return

      const mappedTitles: TitleCardProps[] = (t?.content || []).map(mapTitleToCard)

      setTitles(mappedTitles)
      setIsTitlesLoading(false)
    }

    void loadPage()

    return () => {
      isMounted = false
    }
  }, [authorParam])

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-40 rounded-full" />
          <div className="rounded-[2rem] border border-border/70 bg-card/70 p-5 shadow-sm sm:p-6 xl:p-8">
            <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              <Skeleton className="aspect-square w-full rounded-full" />
              <div className="space-y-4">
                <Skeleton className="h-10 w-3/4 rounded-2xl" />
                <Skeleton className="h-5 w-2/3 rounded-xl" />
                <Skeleton className="h-20 w-full rounded-3xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!author || errorText) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-4 py-10 text-center sm:px-6">
        <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
          /authors/{authorParam || "unknown"}
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          Автор не найден
        </h1>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          {errorText || "Не удалось загрузить данные."}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/">На главную</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-120 overflow-hidden">
        <div className="absolute -top-20 -right-16 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-32 -left-20 h-64 w-64 rounded-full bg-primary/12 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/catalog" className="gap-2">
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  strokeWidth={1.8}
                  className="size-4"
                />
                <span>В каталог</span>
              </Link>
            </Button>

            {author.slug ? (
              <Badge
                variant="outline"
                className="rounded-full border-border/70 bg-background/70 px-3 py-1"
              >
                /{author.slug}
              </Badge>
            ) : null}
          </div>

          <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur xl:p-8">
            <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent" />

            <div className="relative grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="mx-auto w-full max-w-65 lg:mx-0">
                <div className="relative aspect-square overflow-hidden rounded-full border border-border/70 bg-muted shadow-2xl shadow-primary/10">
                  <MediaImage
                    mediaId={author.mainCoverMediaId}
                    alt={author.name || "Фото автора"}
                    fill
                    className="object-cover"
                    fallback={
                      <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">
                        <HugeiconsIcon icon={UserEdit01Icon} className="size-16 opacity-30" />
                      </div>
                    }
                  />
                </div>
              </div>

              <div className="space-y-5 flex flex-col justify-center">
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl xl:text-5xl">
                    {author.name || "Без имени"}
                  </h1>
                </div>

                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base whitespace-pre-wrap">
                  {author.description || "Описание автора пока не добавлено."}
                </p>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {author.countryIsoCode ? (
                    <DetailTile
                      icon={Globe02Icon}
                      label="Страна"
                      value={author.countryIsoCode}
                    />
                  ) : null}
                  {(author.websiteUrls && author.websiteUrls.length > 0) ? (
                    <DetailTile
                      icon={Link01Icon}
                      label="Ссылки"
                      value={
                        <div className="flex flex-col gap-1">
                          {author.websiteUrls.map((url) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline truncate"
                            >
                              {url}
                            </a>
                          ))}
                        </div>
                      }
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Тайтлы автора</CardTitle>
              <CardDescription>
                Список работ, в которых автор принимал участие.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <TitleCardGrid
                items={titles}
                isLoading={isTitlesLoading}
                emptyText="У этого автора еще нет добавленных тайтлов."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

