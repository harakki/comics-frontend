"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MediaImage } from "@/components/ui/media-image"
import {
  type AuthTokenClaims,
  buildLoginHref,
  getAuthTokenClaims,
  hasAuthToken,
  initKeycloak,
  startLogout,
} from "@/lib/axios-instance"
import { getLibrary } from "@/lib/api/library/library"
import { getTitles } from "@/lib/api/titles/titles"
import type { LibraryEntryResponse, TitleResponse } from "@/lib/api/api.schemas"
import { CONTENT_RATING_LABELS, TITLE_TYPE_LABELS } from "@/lib/constants"

type TitleCardData = {
  title: TitleResponse | null
  entry: LibraryEntryResponse
}

type LibraryFilters = {
  search: string
  status: string
  sort: string
}

const LIBRARY_STATUS_LABELS: Record<string, string> = {
  TO_READ: "Хочу прочитать",
  READING: "Читаю",
  ON_HOLD: "Отложено",
  DROPPED: "Брошено",
  COMPLETED: "Прочитано",
  RE_READING: "Перечитываю",
}

const STATUS_SORT_ORDER = [
  "TO_READ",
  "READING",
  "ON_HOLD",
  "DROPPED",
  "COMPLETED",
  "RE_READING",
] as const

const PAGE_SIZE = 10
const SERVER_PAGE_SIZE = 100
const MAX_SEARCH_LENGTH = 120

const SORT_OPTIONS = [
  { value: "updatedAt,DESC", label: "Сначала недавно обновленные" },
  { value: "updatedAt,ASC", label: "Сначала давно обновленные" },
  { value: "status,ASC", label: "Статус: от начальных к финальным" },
  { value: "status,DESC", label: "Статус: от финальных к начальным" },
] as const

const DEFAULT_SORT = SORT_OPTIONS[0].value

const normalizePage = (value: string | null) => {
  if (!value) {
    return 1
  }

  const parsed = Number.parseInt(value, 10)

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1
  }

  return parsed
}

const normalizeSort = (value: string | null) => {
  const requested = value || DEFAULT_SORT
  return SORT_OPTIONS.some((option) => option.value === requested)
    ? requested
    : DEFAULT_SORT
}

const parseLibraryFilters = (
  searchParams: URLSearchParams
): LibraryFilters => ({
  search: (searchParams.get("q") || "").trim().slice(0, MAX_SEARCH_LENGTH),
  status: searchParams.get("status") || "",
  sort: normalizeSort(searchParams.get("sort")),
})

const buildPaginationItems = (currentPage: number, totalPages: number) => {
  if (totalPages <= 1) {
    return [1]
  }

  const pageSet = new Set<number>([
    1,
    2,
    totalPages - 1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ])

  return Array.from(pageSet)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right)
    .reduce<Array<number | "ellipsis">>((acc, page) => {
      const previous = acc.at(-1)

      if (typeof previous === "number" && page - previous > 1) {
        acc.push("ellipsis")
      }

      acc.push(page)
      return acc
    }, [])
}

const getTitleLabel = (title?: TitleResponse | null) => {
  if (!title) {
    return "Без названия"
  }

  return title.name || title.slug || title.id || "Без названия"
}

const getDisplayName = (claims: AuthTokenClaims | null) => {
  if (!claims) {
    return "Пользователь"
  }

  return (
    claims.name ||
    [claims.given_name, claims.family_name].filter(Boolean).join(" ").trim() ||
    claims.preferred_username ||
    claims.email ||
    claims.sub ||
    "Пользователь"
  )
}

const buildLibraryHref = (filters: LibraryFilters, page: number) => {
  const params = new URLSearchParams()

  if (filters.search) {
    params.set("q", filters.search)
  }

  if (filters.status) {
    params.set("status", filters.status)
  }

  if (filters.sort && filters.sort !== DEFAULT_SORT) {
    params.set("sort", filters.sort)
  }

  if (page > 1) {
    params.set("page", String(page))
  }

  return params.toString() ? `/library?${params.toString()}` : "/library"
}

const hydrateTitles = async (entries: LibraryEntryResponse[]) => {
  return Promise.all(
    entries.map(async (entry) => {
      if (!entry.titleId) {
        return { entry, title: null }
      }

      const title = await getTitles()
        .getTitle(entry.titleId)
        .catch(() => null)
      return { entry, title }
    })
  )
}

const sortEntries = (
  left: TitleCardData,
  right: TitleCardData,
  sort: string
) => {
  const leftStatus = left.entry.status || ""
  const rightStatus = right.entry.status || ""

  if (sort.startsWith("status")) {
    const leftIndex = STATUS_SORT_ORDER.indexOf(
      leftStatus as (typeof STATUS_SORT_ORDER)[number]
    )
    const rightIndex = STATUS_SORT_ORDER.indexOf(
      rightStatus as (typeof STATUS_SORT_ORDER)[number]
    )
    const direction = sort.endsWith("DESC") ? -1 : 1

    if (leftIndex !== rightIndex) {
      return (leftIndex - rightIndex) * direction
    }
  }

  const leftUpdatedAt = left.entry.updatedAt || ""
  const rightUpdatedAt = right.entry.updatedAt || ""
  const leftTitle = getTitleLabel(left.title).toLowerCase()
  const rightTitle = getTitleLabel(right.title).toLowerCase()

  if (sort === "updatedAt,ASC") {
    return leftUpdatedAt.localeCompare(rightUpdatedAt)
  }

  if (sort === "updatedAt,DESC") {
    return rightUpdatedAt.localeCompare(leftUpdatedAt)
  }

  return leftTitle.localeCompare(rightTitle, "ru")
}

const matchesSearch = (item: TitleCardData, search: string) => {
  if (!search) {
    return true
  }

  const normalized = search.toLowerCase()
  const title = item.title

  return [item.entry.titleId, title?.name, title?.slug, title?.id]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(normalized))
}

const matchesStatus = (item: TitleCardData, status: string) => {
  if (!status) {
    return true
  }

  return item.entry.status === status
}

const fetchAllLibraryEntries = async () => {
  const firstResponse = await getLibrary().getMyLibrary({
    page: 0,
    size: SERVER_PAGE_SIZE,
    sort: ["updatedAt,DESC"],
  })

  const content = firstResponse.content || []
  const totalPages = Math.max(1, firstResponse.page?.totalPages || 1)

  if (totalPages <= 1) {
    return content
  }

  const remainingPages = Array.from(
    { length: totalPages - 1 },
    (_, index) => index + 1
  )
  const additionalResponses = await Promise.all(
    remainingPages.map((page) =>
      getLibrary()
        .getMyLibrary({
          page,
          size: SERVER_PAGE_SIZE,
          sort: ["updatedAt,DESC"],
        })
        .catch(() => ({ content: [] as LibraryEntryResponse[] }))
    )
  )

  return [
    ...content,
    ...additionalResponses.flatMap((response) => response.content || []),
  ]
}

export default function LibraryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentPage = normalizePage(searchParams.get("page"))
  const filters = useMemo(
    () => parseLibraryFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  )

  const loginHref = buildLoginHref("/library")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isHydratingTitles, setIsHydratingTitles] = useState(true)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [claims, setClaims] = useState<AuthTokenClaims | null>(null)
  const [allItems, setAllItems] = useState<TitleCardData[]>([])

  const displayName = useMemo(() => getDisplayName(claims), [claims])

  useEffect(() => {
    let isMounted = true

    const syncAuthState = async () => {
      const authenticated = await initKeycloak().catch(() => false)

      if (!isMounted) {
        return
      }

      setIsAuthenticated(authenticated || hasAuthToken())
      setClaims(getAuthTokenClaims())
    }

    void syncAuthState()

    const syncFromStorage = () => {
      setIsAuthenticated(hasAuthToken())
      setClaims(getAuthTokenClaims())
    }

    globalThis.addEventListener("storage", syncFromStorage)

    return () => {
      isMounted = false
      globalThis.removeEventListener("storage", syncFromStorage)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      setIsHydratingTitles(false)
      setErrorText(null)
      setAllItems([])
      return
    }

    let isMounted = true

    const loadLibrary = async () => {
      setIsLoading(true)
      setIsHydratingTitles(true)
      setErrorText(null)

      try {
        const entries = await fetchAllLibraryEntries()

        if (!isMounted) {
          return
        }

        const hydrated = await hydrateTitles(entries)

        if (!isMounted) {
          return
        }

        setAllItems(hydrated)
      } catch {
        if (!isMounted) {
          return
        }

        setAllItems([])
        setErrorText("Не удалось загрузить библиотеку")
      } finally {
        if (isMounted) {
          setIsLoading(false)
          setIsHydratingTitles(false)
        }
      }
    }

    void loadLibrary()

    return () => {
      isMounted = false
    }
  }, [isAuthenticated])

  const filteredItems = useMemo(() => {
    return allItems
      .filter((item) => matchesSearch(item, filters.search))
      .filter((item) => matchesStatus(item, filters.status))
      .sort((left, right) => sortEntries(left, right, filters.sort))
  }, [allItems, filters.search, filters.sort, filters.status])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const visiblePageItems = filteredItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )
  const paginationItems = useMemo(
    () => buildPaginationItems(currentPage, totalPages),
    [currentPage, totalPages]
  )

  useEffect(() => {
    if (currentPage > totalPages) {
      router.replace(buildLibraryHref(filters, totalPages))
    }
  }, [currentPage, filters, router, totalPages])

  const handleLogout = async () => {
    await startLogout("/")
  }

  const handleApplyFilters: React.ComponentProps<"form">["onSubmit"] = (
    event
  ) => {
    event?.preventDefault()

    const formData = new FormData(event.currentTarget)
    const nextFilters: LibraryFilters = {
      search: (String(formData.get("search") || "") || "")
        .trim()
        .slice(0, MAX_SEARCH_LENGTH),
      status: String(formData.get("status") || "").trim(),
      sort: normalizeSort(String(formData.get("sort") || "")),
    }

    router.push(buildLibraryHref(nextFilters, 1))
  }

  const handleResetFilters = () => {
    router.push("/library")
  }

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Библиотека</h1>
        <p className="text-sm text-muted-foreground">
          Чтобы посмотреть библиотеку, нужно войти в аккаунт.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href={loginHref}>Войти</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/catalog">В каталог</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        <p className="text-sm text-muted-foreground">Загрузка библиотеки...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Библиотека</h1>
          <p className="text-sm text-muted-foreground">{displayName}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Всего записей</p>
          <p className="text-2xl font-semibold">{allItems.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Отфильтровано</p>
          <p className="text-2xl font-semibold">{filteredItems.length}</p>
        </div>
      </div>

      {errorText ? (
        <p className="mt-4 text-sm text-destructive">{errorText}</p>
      ) : null}

      <form
        key={searchParams.toString()}
        onSubmit={handleApplyFilters}
        className="space-y-3 rounded-xl border bg-card p-4"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-muted-foreground">Поиск по библиотеке</span>
            <input
              name="search"
              type="search"
              defaultValue={filters.search}
              placeholder="Название тайтла"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Сортировка</span>
            <select
              name="sort"
              defaultValue={filters.sort}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Статус</span>
            <select
              name="status"
              defaultValue={filters.status}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Все статусы</option>
              {STATUS_SORT_ORDER.map((status) => (
                <option key={status} value={status}>
                  {LIBRARY_STATUS_LABELS[status] || status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm">
            Применить
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleResetFilters}
          >
            Сбросить
          </Button>
          <p className="text-xs text-muted-foreground">
            {isHydratingTitles
              ? "Загрузка тайтлов..."
              : `Страница ${currentPage} из ${totalPages}`}
          </p>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Моя библиотека</h2>
        <p className="text-xs text-muted-foreground">
          {filters.search || filters.status
            ? "Отфильтрованные записи"
            : "Все записи"}
        </p>
      </div>

      {visiblePageItems.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {filteredItems.length === 0
              ? "По текущим фильтрам ничего не найдено"
              : "На этой странице пока нет записей"}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link href="/catalog">Перейти в каталог</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visiblePageItems.map(({ entry, title }, index) => {
            const titleId =
              entry.titleId || entry.id || `library-entry-${index}`
            const titleLabel = getTitleLabel(title)
            const typeLabel = title?.type
              ? TITLE_TYPE_LABELS[title.type] || title.type
              : null
            const contentRatingLabel = title?.contentRating
              ? CONTENT_RATING_LABELS[title.contentRating] ||
                title.contentRating
              : null
            const statusLabel = entry.status
              ? LIBRARY_STATUS_LABELS[entry.status] || entry.status
              : "Не указан"

            return (
              <article
                key={titleId}
                className="overflow-hidden rounded-xl border bg-background"
              >
                <div className="relative aspect-2/3">
                  <MediaImage
                    mediaId={title?.mainCoverMediaId}
                    alt={titleLabel}
                    fill
                    className="object-cover"
                    fallback={
                      <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                        Нет обложки
                      </div>
                    }
                  />
                </div>

                <div className="space-y-3 p-4">
                  <div className="space-y-1">
                    <h3 className="line-clamp-2 text-base font-semibold">
                      {titleLabel}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {title?.slug
                        ? `/${title.slug}`
                        : entry.titleId || "Без slug"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{statusLabel}</Badge>
                    {entry.vote ? (
                      <Badge variant="outline">{entry.vote}</Badge>
                    ) : null}
                    {typeLabel ? (
                      <Badge variant="outline">{typeLabel}</Badge>
                    ) : null}
                    {contentRatingLabel ? (
                      <Badge variant="outline">{contentRatingLabel}</Badge>
                    ) : null}
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    {entry.lastReadChapterId ? (
                      <p>Последняя глава: {entry.lastReadChapterId}</p>
                    ) : (
                      <p>Последняя глава не указана</p>
                    )}
                    <p>
                      Обновлено:{" "}
                      {entry.updatedAt
                        ? new Date(entry.updatedAt).toLocaleString("ru-RU")
                        : "—"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {title?.id ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/titles/${title.slug || title.id}`}>
                          Открыть тайтл
                        </Link>
                      </Button>
                    ) : null}

                    {entry.lastReadChapterId ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          router.push(`/chapters/${entry.lastReadChapterId}`)
                        }}
                      >
                        Открыть главу
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {(() => {
          let ellipsisKey = 0

          return paginationItems.map((item) => {
            if (item === "ellipsis") {
              ellipsisKey += 1

              return (
                <span
                  key={`library-pagination-ellipsis-${ellipsisKey}`}
                  className="flex h-9 min-w-9 items-center justify-center px-2 text-sm text-muted-foreground"
                  aria-hidden
                >
                  ...
                </span>
              )
            }

            const isCurrentPage = item === currentPage

            return (
              <Button
                key={`library-page-${item}`}
                type="button"
                variant={isCurrentPage ? "default" : "outline"}
                size="sm"
                className="min-w-9"
                aria-current={isCurrentPage ? "page" : undefined}
                disabled={isCurrentPage}
                onClick={() => {
                  router.push(buildLibraryHref(filters, item))
                }}
              >
                {item}
              </Button>
            )
          })
        })()}
      </div>
    </div>
  )
}
