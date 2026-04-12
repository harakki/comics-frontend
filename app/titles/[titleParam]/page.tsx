"use client"

import type { ComponentProps } from "react"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BookBookmark01Icon,
  BookOpen01Icon,
  Calendar03Icon,
  ChartAverageIcon,
  Clock03Icon,
  EyeIcon,
  Globe02Icon,
  Tag01Icon,
  UserGroupIcon,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { MediaImage } from "@/components/ui/media-image"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { getAnalytics } from "@/lib/api/analytics/analytics"
import { getChapters } from "@/lib/api/chapters/chapters"
import { getCollections } from "@/lib/api/collections/collections"
import type {
  ChapterSummaryResponse,
  TagResponse,
  TitleAnalyticsResponse,
  TitleAuthorResponse,
  TitlePublisherResponse,
  TitleResponse,
  UserCollectionResponse,
} from "@/lib/api/api.schemas"
import { getTitles } from "@/lib/api/titles/titles"
import {
  buildLoginHref,
  hasAuthToken,
  initKeycloak,
} from "@/lib/axios-instance"
import { CONTENT_RATING_LABELS, TITLE_TYPE_LABELS } from "@/lib/constants"
import { normalizeCollectionsPayload } from "@/lib/user-space"

const TITLE_STATUS_LABELS: Record<string, string> = {
  ONGOING: "Онгоинг",
  COMPLETED: "Завершен",
  ANNOUNCED: "Анонсирован",
  SUSPENDED: "Приостановлен",
  DISCONTINUED: "Прекращен",
}

const AUTHOR_ROLE_LABELS: Record<string, string> = {
  STORY: "Сюжет",
  ART: "Рисунок",
  STORY_AND_ART: "Сюжет и рисунок",
}

const TAG_TYPE_LABELS: Record<string, string> = {
  CONTENT_WARNING: "Предупреждения",
  GENRE: "Жанры",
  THEME: "Темы",
}

const TITLE_LOOKUP_PAGE_SIZE = 24
const DESCRIPTION_PREVIEW_LIMIT = 240
const EMPTY_VALUE = "Нет данных"

type HugeIcon = ComponentProps<typeof HugeiconsIcon>["icon"]

type NormalizedContributor = {
  key: string
  name: string
  id?: string
  slug?: string
  roleLabel?: string
}

type GroupedTags = Array<{
  key: string
  label: string
  tags: TagResponse[]
}>

const normalizeTitleParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] || ""
  }

  return value || ""
}

const getDescriptionPreview = (value?: string) => {
  const normalized = (value || "").replaceAll(/\s+/g, " ").trim()

  if (!normalized) {
    return "Описание пока не добавлено, но основные метаданные, статистика и список доступных глав уже доступны ниже."
  }

  if (normalized.length <= DESCRIPTION_PREVIEW_LIMIT) {
    return normalized
  }

  return `${normalized.slice(0, DESCRIPTION_PREVIEW_LIMIT).trimEnd()}...`
}

const formatNumber = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) {
    return EMPTY_VALUE
  }

  return new Intl.NumberFormat("ru-RU").format(value)
}

const formatAverageRating = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) {
    return EMPTY_VALUE
  }

  return value.toFixed(0)
}

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return EMPTY_VALUE
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return EMPTY_VALUE
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

const normalizeAuthors = (
  authors?: TitleAuthorResponse[]
): NormalizedContributor[] => {
  const uniqueAuthors = new Map<string, NormalizedContributor>()

  ;(authors || []).forEach((entry, index) => {
    const name = entry.author?.name?.trim()

    if (!name) {
      return
    }

    const identity =
      entry.author?.id || entry.author?.slug || name.toLowerCase()

    if (uniqueAuthors.has(identity)) {
      return
    }

    uniqueAuthors.set(identity, {
      key:
        entry.id ||
        entry.author?.id ||
        entry.author?.slug ||
        `${name}-${index}`,
      id: entry.author?.id,
      slug: entry.author?.slug,
      name,
      roleLabel: entry.role
        ? AUTHOR_ROLE_LABELS[entry.role] || entry.role
        : undefined,
    })
  })

  return [...uniqueAuthors.values()]
}

const normalizePublishers = (publishers?: TitlePublisherResponse[]) =>
  (publishers || [])
    .map((entry, index) => {
      const name = entry.publisher?.name?.trim()

      if (!name) {
        return null
      }

      return {
        key: entry.id || entry.publisher?.id || `${name}-${index}`,
        id: entry.publisher?.id,
        slug: entry.publisher?.slug,
        name,
      }
    })
    .filter(
      (entry): entry is { key: string; id: string | undefined; slug: string | undefined; name: string } =>
        entry !== null
    )

const groupTags = (tags?: TagResponse[]): GroupedTags =>
  Object.entries(TAG_TYPE_LABELS)
    .map(([key, label]) => ({
      key,
      label,
      tags: (tags || []).filter((tag) => tag.type === key && tag.name),
    }))
    .filter((group) => group.tags.length > 0)

const getTagVariant = (type?: TagResponse["type"]) => {
  if (type === "CONTENT_WARNING") {
    return "destructive" as const
  }

  if (type === "THEME") {
    return "secondary" as const
  }

  return "outline" as const
}

const parseChapterParts = (displayNumber?: string) => {
  const parts = displayNumber?.match(/\d+/g)

  if (!parts || parts.length === 0) {
    return null
  }

  return parts.map((value) => Number.parseInt(value, 10))
}

const getOrderedChapters = (chapters: ChapterSummaryResponse[]) =>
  [...chapters]
    .map((chapter, index) => ({
      chapter,
      index,
      volume: typeof chapter.volume === "number" ? chapter.volume : null,
      parts: parseChapterParts(chapter.displayNumber),
    }))
    .sort((left, right) => {
      if (!left.parts || !right.parts) {
        return left.index - right.index
      }

      if (left.volume !== right.volume) {
        return (left.volume || 0) - (right.volume || 0)
      }

      const maxPartsLength = Math.max(left.parts.length, right.parts.length)

      for (let index = 0; index < maxPartsLength; index += 1) {
        const leftPart = left.parts[index] ?? 0
        const rightPart = right.parts[index] ?? 0

        if (leftPart !== rightPart) {
          return leftPart - rightPart
        }
      }

      return left.index - right.index
    })
    .map((entry) => entry.chapter)

const resolveTitle = async (titleParam: string) => {
  const normalizedTitleParam = titleParam.trim()

  if (!normalizedTitleParam) {
    return null
  }

  const directMatch = await getTitles()
    .getTitle(normalizedTitleParam)
    .catch(() => null)

  if (directMatch) {
    return directMatch
  }

  const searchResult = await getTitles()
    .searchTitles({
      search: normalizedTitleParam,
      size: TITLE_LOOKUP_PAGE_SIZE,
    })
    .catch(() => null)

  const matches = searchResult?.content || []
  const normalizedLookup = normalizedTitleParam.toLowerCase()

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

function StatTile({
  icon,
  label,
  value,
  hint,
}: Readonly<{
  icon: HugeIcon
  label: string
  value: string
  hint?: string
}>) {
  return (
    <div className="rounded-3xl border border-border/70 bg-background/80 p-4 shadow-sm backdrop-blur-sm">
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

function DetailTile({
  icon,
  label,
  value,
}: Readonly<{
  icon: HugeIcon
  label: string
  value: string
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

function TitlePageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <Skeleton className="h-8 w-40 rounded-full" />

        <div className="rounded-[2rem] border border-border/70 bg-card/70 p-5 shadow-sm sm:p-6 xl:p-8">
          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
            <Skeleton className="aspect-2/3 w-full rounded-[1.75rem]" />

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-10 w-3/4 rounded-2xl" />
              <Skeleton className="h-5 w-2/3 rounded-xl" />
              <Skeleton className="h-20 w-full rounded-3xl" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-10 w-40 rounded-xl" />
                <Skeleton className="h-10 w-32 rounded-xl" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <Skeleton className="h-28 rounded-3xl" />
              <Skeleton className="h-28 rounded-3xl" />
              <Skeleton className="h-28 rounded-3xl" />
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Skeleton className="h-48 rounded-[1.75rem]" />
            <Skeleton className="h-104 rounded-[1.75rem]" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-64 rounded-[1.75rem]" />
            <Skeleton className="h-72 rounded-[1.75rem]" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TitlePage() {
  const params = useParams<{ titleParam: string | string[] }>()
  const titleParam = normalizeTitleParam(params?.titleParam)

  const [title, setTitle] = useState<TitleResponse | null>(null)
  const [analytics, setAnalytics] = useState<TitleAnalyticsResponse | null>(
    null
  )
  const [chapters, setChapters] = useState<ChapterSummaryResponse[]>([])
  const [isLoading, setIsLoading] = useState(() => Boolean(titleParam))
  const [errorText, setErrorText] = useState<string | null>(null)
  const [chaptersSort, setChaptersSort] = useState<'desc' | 'asc'>("desc")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isCollectionsDialogOpen, setIsCollectionsDialogOpen] = useState(false)
  const [collections, setCollections] = useState<UserCollectionResponse[]>([])
  const [isCollectionsLoading, setIsCollectionsLoading] = useState(false)
  const [isCollectionsSaving, setIsCollectionsSaving] = useState(false)
  const [collectionsNotice, setCollectionsNotice] = useState<string | null>(null)
  const [newCollectionName, setNewCollectionName] = useState("")
  const [newCollectionIsPublic, setNewCollectionIsPublic] = useState(false)

  useEffect(() => {
    let isMounted = true

    const resolveSession = async () => {
      const authenticated = await initKeycloak().catch(() => false)

      if (!isMounted) {
        return
      }

      setIsAuthenticated(authenticated || hasAuthToken())
    }

    void resolveSession()

    return () => {
      isMounted = false
    }
  }, [])

  const loadCollections = useCallback(async () => {
    if (!isAuthenticated) {
      setCollections([])
      return
    }

    setIsCollectionsLoading(true)

    const payload = await getCollections()
      .getMyCollections({
        page: 0,
        size: 50,
        sort: ["updatedAt,DESC"],
      })
      .catch(() => null)

    const parsedPayload = normalizeCollectionsPayload(payload)

    setCollections(parsedPayload.items)
    setIsCollectionsLoading(false)
  }, [isAuthenticated])

  const handleAddToCollection = async (collection: UserCollectionResponse) => {
    if (!title?.id || !collection.id || isCollectionsSaving) {
      return
    }

    setIsCollectionsSaving(true)

    const updatedCollection = await getCollections()
      .addTitleToCollection(collection.id, title.id)
      .catch(() => null)

    if (!updatedCollection) {
      setCollectionsNotice("Не удалось добавить тайтл в коллекцию")
      setIsCollectionsSaving(false)
      return
    }

    setCollections((prev) =>
      prev.map((item) => (item.id === updatedCollection.id ? updatedCollection : item))
    )
    setCollectionsNotice(`Тайтл добавлен в коллекцию «${updatedCollection.name || "без названия"}»`)
    setIsCollectionsSaving(false)
  }

  const handleCreateCollectionAndAddTitle = async () => {
    const normalizedName = newCollectionName.trim()

    if (!title?.id || !normalizedName || isCollectionsSaving) {
      return
    }

    setIsCollectionsSaving(true)

    const createdCollection = await getCollections()
      .createCollection({
        name: normalizedName,
        isPublic: newCollectionIsPublic,
        titleIds: [title.id],
      })
      .catch(() => null)

    if (!createdCollection) {
      setCollectionsNotice("Не удалось создать коллекцию")
      setIsCollectionsSaving(false)
      return
    }

    setCollections((prev) => [createdCollection, ...prev])
    setCollectionsNotice(`Коллекция «${createdCollection.name || "без названия"}» создана`)
    setNewCollectionName("")
    setNewCollectionIsPublic(false)
    setIsCollectionsSaving(false)
  }

  useEffect(() => {
    if (!titleParam) {
      return
    }

    let isMounted = true

    const loadTitlePage = async () => {
      setIsLoading(true)
      setErrorText(null)

      const resolvedTitle = await resolveTitle(titleParam)

      if (!isMounted) {
        return
      }

      if (!resolvedTitle) {
        setTitle(null)
        setAnalytics(null)
        setChapters([])
        setErrorText("Тайтл не найден")
        setIsLoading(false)
        return
      }

      setTitle(resolvedTitle)

      if (!resolvedTitle.id) {
        setAnalytics(null)
        setChapters([])
        setIsLoading(false)
        return
      }

      const [analyticsResult, chaptersResult] = await Promise.allSettled([
        getAnalytics().getTitleAnalytics(resolvedTitle.id),
        getChapters().getChaptersInfoByTitle(resolvedTitle.id),
      ])

      if (!isMounted) {
        return
      }

      setAnalytics(
        analyticsResult.status === "fulfilled" ? analyticsResult.value : null
      )
      setChapters(
        chaptersResult.status === "fulfilled" ? chaptersResult.value || [] : []
      )
      setIsLoading(false)
    }

    void loadTitlePage()

    return () => {
      isMounted = false
    }
  }, [titleParam])

  const pageErrorText = titleParam ? errorText : "Не удалось определить тайтл"

  if (isLoading) {
    return <TitlePageSkeleton />
  }

  if (!title || pageErrorText) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-4 py-10 text-center sm:px-6">
        <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
          /titles/{titleParam || "unknown"}
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          Тайтл не найден
        </h1>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          {pageErrorText || "Не удалось загрузить данные тайтла."}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/catalog">Вернуться в каталог</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">На главную</Link>
          </Button>
        </div>
      </div>
    )
  }

  const normalizedAuthors = normalizeAuthors(title.authors)
  const normalizedPublishers = normalizePublishers(title.publishers)
  const groupedTags = groupTags(title.tags)
  const orderedChapters = getOrderedChapters(chapters)
  const displayChapters =
    chaptersSort === "desc" ? [...orderedChapters].reverse() : [...orderedChapters]
  const firstChapter = orderedChapters[0]
  let licensedValue = EMPTY_VALUE

  if (title.isLicensed === true) {
    licensedValue = "Да"
  } else if (title.isLicensed === false) {
    licensedValue = "Нет"
  }

  const stats = [
    {
      key: "rating",
      icon: ChartAverageIcon,
      label: "Рейтинг",
      value: formatAverageRating(analytics?.averageRating),
      hint: "Средняя пользовательская оценка",
    },
    {
      key: "views",
      icon: EyeIcon,
      label: "Просмотры",
      value: formatNumber(analytics?.totalViews),
      hint: "Уникальные читатели",
    },
    {
      key: "updated",
      icon: Clock03Icon,
      label: "Обновлен",
      value: formatDateTime(analytics?.lastUpdated),
      hint: "Последняя зафиксированная активность",
    },
  ]

  const details = [
    {
      key: "type",
      icon: BookOpen01Icon,
      label: "Формат",
      value: title.type
        ? TITLE_TYPE_LABELS[title.type] || title.type
        : EMPTY_VALUE,
    },
    {
      key: "status",
      icon: BookBookmark01Icon,
      label: "Статус",
      value: title.titleStatus
        ? TITLE_STATUS_LABELS[title.titleStatus] || title.titleStatus
        : EMPTY_VALUE,
    },
    {
      key: "rating",
      icon: Tag01Icon,
      label: "Возрастной рейтинг",
      value: title.contentRating
        ? CONTENT_RATING_LABELS[title.contentRating] || title.contentRating
        : EMPTY_VALUE,
    },
    {
      key: "year",
      icon: Calendar03Icon,
      label: "Год выхода",
      value: title.releaseYear || EMPTY_VALUE,
    },
    {
      key: "country",
      icon: Globe02Icon,
      label: "Страна",
      value: title.countryIsoCode || EMPTY_VALUE,
    },
    {
      key: "licensed",
      icon: BookBookmark01Icon,
      label: "Лицензия",
      value: licensedValue,
    },
  ]

  const titleHref = `/titles/${title.slug || title.id || titleParam}`

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
                <span>Назад к каталогу</span>
              </Link>
            </Button>

            {title.slug ? (
              <Badge
                variant="outline"
                className="rounded-full border-border/70 bg-background/70 px-3 py-1"
              >
                /{title.slug}
              </Badge>
            ) : null}
          </div>

          <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur xl:p-8">
            <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent" />

            <div className="relative grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
              <div className="mx-auto w-full max-w-65 lg:mx-0">
                <div className="relative aspect-2/3 overflow-hidden rounded-[1.75rem] border border-border/70 bg-muted shadow-2xl shadow-primary/10">
                  <MediaImage
                    mediaId={title.mainCoverMediaId}
                    alt={title.name || "Обложка тайтла"}
                    fill
                    className="object-cover"
                    fallback={
                      <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                        Нет обложки
                      </div>
                    }
                  />
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  {title.type ? (
                    <Badge className="rounded-full px-3 py-1">
                      {TITLE_TYPE_LABELS[title.type] || title.type}
                    </Badge>
                  ) : null}
                  {title.titleStatus ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-background/70 px-3 py-1 backdrop-blur"
                    >
                      {TITLE_STATUS_LABELS[title.titleStatus] ||
                        title.titleStatus}
                    </Badge>
                  ) : null}
                  {title.contentRating ? (
                    <Badge
                      variant="outline"
                      className="rounded-full bg-background/70 px-3 py-1"
                    >
                      {CONTENT_RATING_LABELS[title.contentRating] ||
                        title.contentRating}
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl xl:text-5xl">
                    {title.name || "Без названия"}
                  </h1>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {normalizedAuthors.length > 0 ? (
                      <span className="inline-flex items-center gap-2">
                        <span>
                          Авторы:{" "}
                          {normalizedAuthors.map((author, idx) => (
                            <span key={author.key}>
                              <Link
                                href={`/authors/${
                                  author.slug || author.id || encodeURIComponent(author.name)
                                }`}
                                className="underline-offset-2 hover:underline"
                              >
                                {author.name}
                              </Link>
                              {idx < normalizedAuthors.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </span>
                      </span>
                    ) : null}

                    {normalizedPublishers.length > 0 ? (
                      <span>
                        Издатели:{" "}
                        {normalizedPublishers.map((publisher, idx) => (
                          <span key={publisher.key}>
                            <Link
                              href={`/publishers/${
                                  publisher.slug || publisher.id || encodeURIComponent(publisher.name || "")
                                }`}
                              className="underline-offset-2 hover:underline"
                            >
                              {publisher.name}
                            </Link>
                            {idx < normalizedPublishers.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                </div>

                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  {getDescriptionPreview(title.description)}
                </p>

                <div className="flex flex-wrap gap-2">
                  {title.releaseYear ? (
                    <Badge
                      variant="outline"
                      className="rounded-full bg-background/70 px-3 py-1"
                    >
                      {title.releaseYear}
                    </Badge>
                  ) : null}
                  {title.countryIsoCode ? (
                    <Badge
                      variant="outline"
                      className="rounded-full bg-background/70 px-3 py-1"
                    >
                      {title.countryIsoCode}
                    </Badge>
                  ) : null}
                  <Badge
                    variant="outline"
                    className="rounded-full bg-background/70 px-3 py-1"
                  >
                    {"Глав: "}
                    {orderedChapters.length}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-3">
                  {firstChapter?.id ? (
                    <Button asChild size="lg">
                      <Link
                        href={`/chapters/${firstChapter.id}`}
                        className="gap-2"
                      >
                        <HugeiconsIcon
                          icon={BookOpen01Icon}
                          strokeWidth={1.8}
                          className="size-4"
                        />
                        <span>Начать чтение</span>
                      </Link>
                    </Button>
                  ) : null}

                  <Button asChild variant="outline" size="lg">
                    <a href="#chapters" className="gap-2">
                      <span>К списку глав</span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        strokeWidth={1.8}
                        className="size-4"
                      />
                    </a>
                  </Button>

                  {isAuthenticated ? (
                    <Dialog
                      open={isCollectionsDialogOpen}
                      onOpenChange={(nextOpen) => {
                        setIsCollectionsDialogOpen(nextOpen)
                        if (nextOpen) {
                          setCollectionsNotice(null)
                          void loadCollections()
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button variant="secondary" size="lg">
                          <HugeiconsIcon
                            icon={Tag01Icon}
                            strokeWidth={1.8}
                            className="size-4"
                          />
                          В коллекцию
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-xl">
                        <DialogHeader>
                          <DialogTitle>Добавить в коллекцию</DialogTitle>
                          <DialogDescription>
                            Выберите существующую коллекцию или создайте новую.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3">
                          <Input
                            value={newCollectionName}
                            onChange={(event) => {
                              setNewCollectionName(event.target.value)
                            }}
                            placeholder="Название новой коллекции"
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant={newCollectionIsPublic ? "default" : "outline"}
                              onClick={() => {
                                setNewCollectionIsPublic(true)
                              }}
                            >
                              Публичная
                            </Button>
                            <Button
                              size="sm"
                              variant={!newCollectionIsPublic ? "default" : "outline"}
                              onClick={() => {
                                setNewCollectionIsPublic(false)
                              }}
                            >
                              Приватная
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void handleCreateCollectionAndAddTitle()}
                              disabled={!newCollectionName.trim() || isCollectionsSaving}
                            >
                              Создать и добавить
                            </Button>
                          </div>
                        </div>

                        <div className="max-h-72 space-y-2 overflow-y-auto">
                          {isCollectionsLoading ? (
                            <p className="text-sm text-muted-foreground">
                              Загружаем коллекции...
                            </p>
                          ) : collections.length > 0 ? (
                            collections.map((collectionItem) => {
                              const titleId = title.id || ""
                              const isAlreadyInCollection = Boolean(
                                titleId && (collectionItem.titleIds || []).includes(titleId)
                              )

                              return (
                                <div
                                  key={collectionItem.id || collectionItem.name}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/70 p-3"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">
                                      {collectionItem.name || "Коллекция без названия"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {collectionItem.isPublic ? "Публичная" : "Приватная"} · {collectionItem.titleIds?.length || 0} тайтлов
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={isAlreadyInCollection || isCollectionsSaving}
                                    onClick={() => void handleAddToCollection(collectionItem)}
                                  >
                                    {isAlreadyInCollection ? "Уже добавлен" : "Добавить"}
                                  </Button>
                                </div>
                              )
                            })
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              У вас пока нет коллекций.
                            </p>
                          )}
                        </div>

                        {collectionsNotice ? (
                          <p className="text-sm text-muted-foreground">{collectionsNotice}</p>
                        ) : null}

                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsCollectionsDialogOpen(false)
                            }}
                          >
                            Закрыть
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <Button asChild variant="secondary" size="lg">
                      <Link href={buildLoginHref(titleHref)}>Войти и добавить в коллекцию</Link>
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {stats.map((stat) => (
                  <StatTile
                    key={stat.key}
                    icon={stat.icon}
                    label={stat.label}
                    value={stat.value}
                    hint={stat.hint}
                  />
                ))}
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <Card className="border border-border/70 bg-card/90 shadow-sm">
                <CardHeader className="border-b border-border/70">
                  <CardTitle>О тайтле</CardTitle>
                  <CardDescription>
                    Полное описание, основные характеристики и контекст
                    публикации.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <p className="text-sm leading-7 whitespace-pre-wrap text-foreground/90 sm:text-base">
                    {title.description?.trim() ||
                      "Описание пока не добавлено. Ниже всё равно доступны базовые сведения, статистика и список опубликованных глав."}
                  </p>

                  <Separator />

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {details.map((detail) => (
                      <DetailTile
                        key={detail.key}
                        icon={detail.icon}
                        label={detail.label}
                        value={detail.value}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              <section id="chapters" className="scroll-mt-24">
                <Card className="border border-border/70 bg-card/90 shadow-sm">
                  <CardHeader className="border-b border-border/70">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          <HugeiconsIcon
                            icon={BookOpen01Icon}
                            strokeWidth={1.8}
                            className="size-5"
                          />
                          <span>Главы</span>
                        </CardTitle>
                        <CardDescription>
                          {orderedChapters.length > 0
                            ? "Список доступных для чтения глав."
                            : "Главы появятся здесь, когда будут добавлены в каталог."}
                        </CardDescription>
                      </div>

                      {orderedChapters.length > 0 ? (
                        <div className="flex flex-wrap gap-2 items-center">
                          <Button
                            size="sm"
                            variant={chaptersSort === "desc" ? "outline" : "ghost"}
                            onClick={() =>
                              setChaptersSort((prev) => (prev === "desc" ? "asc" : "desc"))
                            }
                          >
                            <HugeiconsIcon
                              icon={ArrowRight01Icon}
                              strokeWidth={1.8}
                              className={
                                `size-4 ${chaptersSort === "desc" ? "rotate-90" : "-rotate-90"}`
                              }
                            />
                            <span className="whitespace-nowrap">
                              {chaptersSort === "desc" ? "Новые сверху" : "Старые сверху"}
                            </span>
                          </Button>

                          {firstChapter?.id ? (
                            <Button asChild size="sm">
                              <Link href={`/chapters/${firstChapter.id}`}>
                                Читать с первой главы
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-6">
                    {displayChapters.length > 0 ? (
                      <div className="space-y-3">
                        {displayChapters.map((chapter, index) => (
                          <Link
                            key={
                              chapter.id || `${chapter.displayNumber}-${index}`
                            }
                            href={chapter.id ? `/chapters/${chapter.id}` : "#"}
                            className="group flex items-start justify-between gap-4 rounded-[1.5rem] border border-border/70 bg-background/70 px-4 py-4 transition hover:border-primary/35 hover:bg-primary/5"
                          >
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium">
                                  Глава{" "}
                                  {chapter.displayNumber ||
                                    displayChapters.length - index}
                                </div>

                                {typeof chapter.volume === "number" ? (
                                  <Badge
                                    variant="outline"
                                    className="rounded-full px-2.5 py-1"
                                  >
                                    Том {chapter.volume}
                                  </Badge>
                                ) : null}
                              </div>

                              {chapter.name ? (
                                <p className="text-sm text-muted-foreground">
                                  {chapter.name}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2 text-sm text-muted-foreground transition group-hover:text-foreground">
                              <span className="hidden sm:inline">Читать</span>
                              <HugeiconsIcon
                                icon={ArrowRight01Icon}
                                strokeWidth={1.8}
                                className="size-4"
                              />
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[1.5rem] border border-dashed border-border/80 bg-background/60 px-4 py-10 text-center">
                        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                          <HugeiconsIcon
                            icon={BookOpen01Icon}
                            strokeWidth={1.8}
                            className="size-5 text-muted-foreground"
                          />
                        </div>
                        <p className="text-sm font-medium">
                          Главы пока не добавлены
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Когда в тайтле появятся релизы, список обновится
                          автоматически.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            </div>

            <aside className="space-y-6">
              {(normalizedAuthors.length > 0 ||
                normalizedPublishers.length > 0) && (
                <Card className="border border-border/70 bg-card/90 shadow-sm">
                  <CardHeader className="border-b border-border/70">
                    <CardTitle className="flex items-center gap-2">
                      <HugeiconsIcon
                        icon={UserGroupIcon}
                        strokeWidth={1.8}
                        className="size-5"
                      />
                      <span>Команда тайтла</span>
                    </CardTitle>
                    <CardDescription>
                      Авторский состав и издательские данные.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-6">
                    {normalizedAuthors.length > 0 ? (
                      <div className="space-y-3">
                        <div className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                          Авторы
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {normalizedAuthors.map((author) => (
                            <Badge
                              asChild
                              key={author.key}
                              variant="secondary"
                              className="h-auto rounded-2xl px-3 py-2 text-left"
                            >
                              <Link
                                href={`/authors/${
                                  author.slug || author.id || encodeURIComponent(author.name)
                                }`}
                              >
                                {author.name}
                                {author.roleLabel ? ` · ${author.roleLabel}` : ""}
                              </Link>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {normalizedAuthors.length > 0 &&
                    normalizedPublishers.length > 0 ? (
                      <Separator />
                    ) : null}

                    {normalizedPublishers.length > 0 ? (
                      <div className="space-y-3">
                        <div className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                          Издатели
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {normalizedPublishers.map((publisher) => (
                            <Badge
                              asChild
                              key={publisher.key}
                              variant="outline"
                              className="h-auto rounded-2xl px-3 py-2 text-left"
                            >
                              <Link
                                href={`/publishers/${
                                  publisher.slug || publisher.id || encodeURIComponent(publisher.name)
                                }`}
                              >
                                {publisher.name}
                              </Link>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              )}

              {groupedTags.length > 0 && (
                <Card className="border border-border/70 bg-card/90 shadow-sm">
                  <CardHeader className="border-b border-border/70">
                    <CardTitle className="flex items-center gap-2">
                      <HugeiconsIcon
                        icon={Tag01Icon}
                        strokeWidth={1.8}
                        className="size-5"
                      />
                      <span>Теги</span>
                    </CardTitle>
                    <CardDescription>
                      Жанры, темы и контентные пометки.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-6">
                    {groupedTags.map((group) => (
                      <div key={group.key} className="space-y-3">
                        <div className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                          {group.label}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.tags.map((tag) => (
                            <Badge
                              asChild
                              key={tag.id || tag.slug || tag.name}
                              variant={getTagVariant(tag.type)}
                              className="h-auto rounded-2xl px-3 py-2"
                            >
                              <Link
                                  href={`/catalog?tags=${encodeURIComponent(
                                      tag.slug || tag.id || tag.name || ""
                                    )}`}
                              >
                                {tag.name}
                              </Link>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
