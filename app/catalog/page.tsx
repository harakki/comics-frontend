"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { TitleCardGrid } from "@/components/title-card-grid"
import { Button } from "@/components/ui/button"
import type { TitleCardProps } from "@/components/title-card"
import {
  type SearchTitlesParams,
  type TagResponse,
  type TitleResponse,
  TitleResponseContentRating,
  TitleResponseTitleStatus,
  TitleResponseType,
} from "@/lib/api/api.schemas"
import { getTags } from "@/lib/api/tags/tags"
import { getTitles } from "@/lib/api/titles/titles"
import { CONTENT_RATING_LABELS, TITLE_TYPE_LABELS } from "@/lib/constants"

const PAGE_SIZE = 20
const MAX_QUERY_LENGTH = 120

type CatalogFilters = {
  search: string
  type: string
  titleStatus: string
  country: string
  releaseYear: string
  yearFrom: string
  yearTo: string
  contentRating: string
  tags: string[]
  sort: string
}

type ClearableFilterKey =
  | "search"
  | "type"
  | "titleStatus"
  | "country"
  | "releaseYear"
  | "yearFrom"
  | "yearTo"
  | "contentRating"
  | "sort"

type ActiveFilterChip = {
  id: string
  label: string
  key?: ClearableFilterKey
  tagId?: string
}

const TITLE_STATUS_LABELS: Record<string, string> = {
  ONGOING: "Онгоинг",
  COMPLETED: "Завершен",
  ANNOUNCED: "Анонсирован",
  SUSPENDED: "Приостановлен",
  DISCONTINUED: "Прекращен",
}

const SORT_OPTIONS = [
  { value: "updatedAt,DESC", label: "Сначала недавно обновленные" },
  { value: "createdAt,DESC", label: "Сначала недавно добавленные" },
  { value: "name,ASC", label: "Название: А-Я" },
  { value: "name,DESC", label: "Название: Я-А" },
  { value: "releaseYear,DESC", label: "Год: новые" },
  { value: "releaseYear,ASC", label: "Год: старые" },
] as const

const DEFAULT_SORT = SORT_OPTIONS[0].value

const SORT_LABELS = SORT_OPTIONS.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

const mapTitleToCard = (title: TitleResponse): TitleCardProps => ({
  id: title.id,
  name: title.name,
  slug: title.slug,
  mainCoverMediaId: title.mainCoverMediaId,
  type: title.type,
  contentRating: title.contentRating,
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

const normalizeYearValue = (value: string) => {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)

  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined
  }

  return parsed
}

const parseTagValues = (searchParams: URLSearchParams) => {
  const rawValues = searchParams.getAll("tags")

  if (rawValues.length === 0) {
    const singleValue = searchParams.get("tags")
    return singleValue ? singleValue.split(",") : []
  }

  return rawValues.flatMap((value) => value.split(","))
}

const parseFilters = (searchParams: URLSearchParams): CatalogFilters => {
  const search = (searchParams.get("search") || searchParams.get("q") || "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
  const type = searchParams.get("type") || ""
  const titleStatus = searchParams.get("titleStatus") || ""
  const country = (searchParams.get("country") || "")
    .trim()
    .toUpperCase()
    .slice(0, 2)
  const releaseYear = searchParams.get("releaseYear") || ""
  let yearFrom = searchParams.get("yearFrom") || ""
  let yearTo = searchParams.get("yearTo") || ""
  const contentRating = searchParams.get("contentRating") || ""
  const tags = parseTagValues(searchParams)
    .map((value) => value.trim())
    .filter(Boolean)
  const requestedSort = searchParams.get("sort") || DEFAULT_SORT
  const sort = SORT_OPTIONS.some((option) => option.value === requestedSort)
    ? requestedSort
    : DEFAULT_SORT

  const normalizedYearFrom = normalizeYearValue(yearFrom)
  const normalizedYearTo = normalizeYearValue(yearTo)

  if (
    typeof normalizedYearFrom === "number" &&
    typeof normalizedYearTo === "number" &&
    normalizedYearFrom > normalizedYearTo
  ) {
    yearFrom = String(normalizedYearTo)
    yearTo = String(normalizedYearFrom)
  }

  return {
    search,
    type,
    titleStatus,
    country,
    releaseYear,
    yearFrom,
    yearTo,
    contentRating,
    tags,
    sort,
  }
}

const buildCatalogHref = (filters: CatalogFilters, page: number) => {
  const params = new URLSearchParams()

  if (filters.search) {
    params.set("search", filters.search)
  }

  if (filters.type) {
    params.set("type", filters.type)
  }

  if (filters.titleStatus) {
    params.set("titleStatus", filters.titleStatus)
  }

  if (filters.country) {
    params.set("country", filters.country)
  }

  if (filters.releaseYear) {
    params.set("releaseYear", filters.releaseYear)
  }

  if (filters.yearFrom) {
    params.set("yearFrom", filters.yearFrom)
  }

  if (filters.yearTo) {
    params.set("yearTo", filters.yearTo)
  }

  if (filters.contentRating) {
    params.set("contentRating", filters.contentRating)
  }

  if (filters.tags.length > 0) {
    params.set("tags", filters.tags.join(","))
  }

  if (filters.sort && filters.sort !== DEFAULT_SORT) {
    params.set("sort", filters.sort)
  }

  if (page > 1) {
    params.set("page", String(page))
  }

  return params.toString() ? `/catalog?${params.toString()}` : "/catalog"
}

const buildRequestParams = (
  filters: CatalogFilters,
  page: number
): SearchTitlesParams => ({
  page: Math.max(0, page - 1),
  size: PAGE_SIZE,
  sort: [filters.sort || DEFAULT_SORT],
  search: filters.search || undefined,
  type: filters.type || undefined,
  titleStatus: filters.titleStatus || undefined,
  country: filters.country || undefined,
  tags: filters.tags.length > 0 ? filters.tags.join(",") : undefined,
  releaseYear: normalizeYearValue(filters.releaseYear),
  yearFrom: normalizeYearValue(filters.yearFrom),
  yearTo: normalizeYearValue(filters.yearTo),
  contentRating: filters.contentRating || undefined,
})

const getFormString = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return typeof value === "string" ? value : ""
}

const getFormStringList = (formData: FormData, key: string) => {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
}

export default function CatalogPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  )

  const currentPage = normalizePage(searchParams.get("page"))

  const [titles, setTitles] = useState<TitleCardProps[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const [tags, setTags] = useState<TagResponse[]>([])
  const [isTagsLoading, setIsTagsLoading] = useState(true)
  const [tagSearchValue, setTagSearchValue] = useState("")

  const selectedTagsCount = filters.tags.length

  const tagsById = useMemo(() => {
    return tags.reduce<Map<string, string>>((acc, tag) => {
      if (tag.id) {
        acc.set(tag.id, tag.name || "Без названия")
      }

      return acc
    }, new Map())
  }, [tags])

  const tagsBySlug = useMemo(() => {
    return tags.reduce<Map<string, string>>((acc, tag) => {
      if (tag.slug) {
        acc.set(tag.slug, tag.name || "Без названия")
      }

      return acc
    }, new Map())
  }, [tags])

  // Resolve incoming filter tag values (which may be slugs) to tag ids
  const resolvedTagIds = useMemo(() => {
    if (!filters.tags || filters.tags.length === 0) return []

    const bySlug = new Map<string, string>()
    const byId = new Set<string>()

    tags.forEach((t) => {
      if (t.id) {
        byId.add(t.id)
        bySlug.set(t.id, t.id)
      }

      if (t.slug && t.id) {
        bySlug.set(t.slug, t.id)
      }

      if (t.name && t.id) {
        bySlug.set(t.name.toLowerCase(), t.id)
      }
    })

    const result: string[] = []

    filters.tags.forEach((raw) => {
      const key = raw || ""
      const resolvedId = bySlug.get(key) || bySlug.get(key.toLowerCase())

      if (resolvedId && !result.includes(resolvedId)) {
        result.push(resolvedId)
        return
      }

      // Keep legacy id-based URLs working if id exists in loaded tags
      if (byId.has(key) && !result.includes(key)) {
        result.push(key)
      }
    })

    return result
  }, [filters.tags, tags])

  const resolvedFilters = useMemo(
    () => ({ ...filters, tags: resolvedTagIds }),
    [filters, resolvedTagIds]
  )

  const filteredTags = useMemo(() => {
    const searchTerm = tagSearchValue.trim().toLowerCase()

    if (!searchTerm) {
      return tags
    }

    return tags.filter((tag) => {
      const normalizedName = (tag.name || "").toLowerCase()
      const normalizedSlug = (tag.slug || "").toLowerCase()

      return (
        normalizedName.includes(searchTerm) ||
        normalizedSlug.includes(searchTerm)
      )
    })
  }, [tagSearchValue, tags])

  const activeFilterChips = useMemo(() => {
    const chips: ActiveFilterChip[] = []

    if (filters.search) {
      chips.push({
        id: "search",
        key: "search",
        label: `Поиск: ${filters.search}`,
      })
    }

    if (filters.type) {
      chips.push({
        id: "type",
        key: "type",
        label: `Тип: ${TITLE_TYPE_LABELS[filters.type] || filters.type}`,
      })
    }

    if (filters.titleStatus) {
      chips.push({
        id: "titleStatus",
        key: "titleStatus",
        label: `Статус: ${TITLE_STATUS_LABELS[filters.titleStatus] || filters.titleStatus}`,
      })
    }

    if (filters.country) {
      chips.push({
        id: "country",
        key: "country",
        label: `Страна: ${filters.country}`,
      })
    }

    if (filters.releaseYear) {
      chips.push({
        id: "releaseYear",
        key: "releaseYear",
        label: `Год: ${filters.releaseYear}`,
      })
    }

    if (filters.yearFrom) {
      chips.push({
        id: "yearFrom",
        key: "yearFrom",
        label: `Год от: ${filters.yearFrom}`,
      })
    }

    if (filters.yearTo) {
      chips.push({
        id: "yearTo",
        key: "yearTo",
        label: `Год до: ${filters.yearTo}`,
      })
    }

    if (filters.contentRating) {
      chips.push({
        id: "contentRating",
        key: "contentRating",
        label: `Рейтинг: ${CONTENT_RATING_LABELS[filters.contentRating] || filters.contentRating}`,
      })
    }

    if (filters.sort && filters.sort !== DEFAULT_SORT) {
      chips.push({
        id: "sort",
        key: "sort",
        label: `Сортировка: ${SORT_LABELS[filters.sort] || filters.sort}`,
      })
    }

    filters.tags.forEach((tagId) => {
      chips.push({
        id: `tag-${tagId}`,
        tagId,
        label: `Тег: ${tagsBySlug.get(tagId) || tagsById.get(tagId) || tagId}`,
      })
    })

    return chips
  }, [filters, tagsById, tagsBySlug])

  const paginationItems = useMemo(
    () => buildPaginationItems(currentPage, totalPages),
    [currentPage, totalPages]
  )

  useEffect(() => {
    let isMounted = true

    const loadTags = async () => {
      setIsTagsLoading(true)

      try {
        const response = await getTags().getTags({
          page: 0,
          size: 250,
        })

        if (!isMounted) {
          return
        }

        const loadedTags = [...(response.content || [])].sort((left, right) =>
          (left.name || "").localeCompare(right.name || "", "ru")
        )

        setTags(loadedTags)
      } catch {
        if (!isMounted) {
          return
        }

        setTags([])
      } finally {
        if (isMounted) {
          setIsTagsLoading(false)
        }
      }
    }

    void loadTags()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadTitles = async () => {
      // Wait for tags dictionary before requesting with tag filters.
      if (filters.tags.length > 0 && isTagsLoading) {
        return
      }

      setIsLoading(true)

      try {
        const response = await getTitles().searchTitles(
          buildRequestParams(resolvedFilters, currentPage)
        )

        if (!isMounted) {
          return
        }

        const nextTotalPages = Math.max(1, response.page?.totalPages || 1)
        setTitles((response.content || []).map(mapTitleToCard))
        setTotalPages(nextTotalPages)

        if (currentPage > nextTotalPages) {
          router.replace(buildCatalogHref(filters, nextTotalPages))
        }
      } catch {
        if (!isMounted) {
          return
        }

        setTitles([])
        setTotalPages(1)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadTitles()

    return () => {
      isMounted = false
    }
  }, [currentPage, filters, isTagsLoading, resolvedFilters, router])

  const handleApplyFilters: React.ComponentProps<"form">["onSubmit"] = (
    event
  ) => {
    if (!event) {
      return
    }

    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const nextFilters: CatalogFilters = {
      search: getFormString(formData, "search")
        .trim()
        .slice(0, MAX_QUERY_LENGTH),
      type: getFormString(formData, "type").trim(),
      titleStatus: getFormString(formData, "titleStatus").trim(),
      country: getFormString(formData, "country")
        .trim()
        .toUpperCase()
        .slice(0, 2),
      releaseYear: getFormString(formData, "releaseYear").trim(),
      yearFrom: getFormString(formData, "yearFrom").trim(),
      yearTo: getFormString(formData, "yearTo").trim(),
      contentRating: getFormString(formData, "contentRating").trim(),
      tags: getFormStringList(formData, "tags"),
      sort: getFormString(formData, "sort").trim() || DEFAULT_SORT,
    }

    router.push(buildCatalogHref(nextFilters, 1))
  }

  const handleResetFilters = () => {
    router.push("/catalog")
  }

  const handleClearFilter = (key: ClearableFilterKey) => {
    const nextFilters: CatalogFilters = { ...filters }

    if (key === "sort") {
      nextFilters.sort = DEFAULT_SORT
    } else {
      nextFilters[key] = ""
    }

    router.push(buildCatalogHref(nextFilters, 1))
  }

  const handleRemoveTag = (tagId: string) => {
    const nextFilters: CatalogFilters = {
      ...filters,
      tags: filters.tags.filter((id) => id !== tagId),
    }

    router.push(buildCatalogHref(nextFilters, 1))
  }

  const handleClearTags = () => {
    const nextFilters: CatalogFilters = { ...filters, tags: [] }
    router.push(buildCatalogHref(nextFilters, 1))
  }

  const goToPage = (page: number) => {
    router.push(buildCatalogHref(filters, page))
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Каталог</h1>

        {activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            {activeFilterChips.map((chip) => (
              <Button
                key={chip.id}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (chip.tagId) {
                    handleRemoveTag(chip.tagId)
                    return
                  }

                  if (chip.key) {
                    handleClearFilter(chip.key)
                  }
                }}
              >
                {chip.label} x
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleResetFilters}
            >
              Очистить все
            </Button>
          </div>
        ) : null}

        <form
          key={searchParams.toString()}
          onSubmit={handleApplyFilters}
          className="space-y-3 rounded-xl border bg-card p-4"
        >
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Поиск</span>
              <input
                name="search"
                type="search"
                defaultValue={filters.search}
                placeholder="Название или slug"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Тип</span>
              <select
                name="type"
                defaultValue={filters.type}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Любой</option>
                {Object.values(TitleResponseType).map((typeValue) => (
                  <option key={typeValue} value={typeValue}>
                    {TITLE_TYPE_LABELS[typeValue] || typeValue}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Статус</span>
              <select
                name="titleStatus"
                defaultValue={filters.titleStatus}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Любой</option>
                {Object.values(TitleResponseTitleStatus).map((statusValue) => (
                  <option key={statusValue} value={statusValue}>
                    {TITLE_STATUS_LABELS[statusValue] || statusValue}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Страна (ISO)</span>
              <input
                name="country"
                type="text"
                maxLength={2}
                defaultValue={filters.country}
                placeholder="JP"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm uppercase"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Год выпуска</span>
              <input
                name="releaseYear"
                type="number"
                defaultValue={filters.releaseYear}
                placeholder="2024"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Возрастной рейтинг от</span>
              <select
                name="contentRating"
                defaultValue={filters.contentRating}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Любой</option>
                {Object.values(TitleResponseContentRating).map(
                  (ratingValue) => (
                    <option key={ratingValue} value={ratingValue}>
                      {CONTENT_RATING_LABELS[ratingValue] || ratingValue}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Год от</span>
              <input
                name="yearFrom"
                type="number"
                defaultValue={filters.yearFrom}
                placeholder="2010"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Год до</span>
              <input
                name="yearTo"
                type="number"
                defaultValue={filters.yearTo}
                placeholder="2026"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
            </label>

            <label className="space-y-1 text-sm md:col-span-2 lg:col-span-1">
              <span className="text-muted-foreground">Сортировка</span>
              <select
                name="sort"
                defaultValue={filters.sort}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {SORT_OPTIONS.map((sortOption) => (
                  <option key={sortOption.value} value={sortOption.value}>
                    {sortOption.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">Теги</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                </span>
                {filters.tags.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleClearTags}
                  >
                    Очистить теги
                  </Button>
                ) : null}
              </div>
            </div>

            <input
              type="search"
              value={tagSearchValue}
              onChange={(event) => {
                setTagSearchValue(event.target.value)
              }}
              placeholder="Поиск по тегам"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            />

            <div className="max-h-56 overflow-auto rounded-md border bg-background p-2">
              {filteredTags.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Теги не найдены
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredTags.map((tag) => {
                    if (!tag.id) {
                      return null
                    }

                    const tagFilterValue = tag.slug || tag.id
                    const isTagChecked =
                      filters.tags.includes(tagFilterValue) ||
                      (tag.id ? filters.tags.includes(tag.id) : false)

                    return (
                      <label
                        key={tag.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          name="tags"
                          value={tagFilterValue}
                          defaultChecked={isTagChecked}
                        />
                        <span>{tag.name || "Без названия"}</span>
                        {tag.slug ? (
                          <span className="text-xs text-muted-foreground">
                            /{tag.slug}
                          </span>
                        ) : null}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm">
              Применить фильтры
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
              Выбрано тегов: {selectedTagsCount}
            </p>
          </div>
        </form>

        {filters.search ? (
          <p className="text-sm text-muted-foreground">
            Результаты поиска по запросу:{" "}
            <span className="font-medium">{filters.search}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Показываем все доступные тайтлы
          </p>
        )}

        <TitleCardGrid
          items={titles}
          isLoading={isLoading}
          skeletonCount={PAGE_SIZE}
          emptyText={
            filters.search
              ? "По вашему запросу ничего не найдено"
              : "В каталоге пока нет тайтлов"
          }
        />

        <div className="flex flex-wrap justify-center gap-2">
          {(() => {
            let ellipsisKey = 0

            return paginationItems.map((item) => {
              if (item === "ellipsis") {
                ellipsisKey += 1

                return (
                  <span
                    key={`catalog-pagination-ellipsis-${ellipsisKey}`}
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
                  key={`catalog-page-${item}`}
                  type="button"
                  variant={isCurrentPage ? "default" : "outline"}
                  size="sm"
                  className="min-w-9"
                  aria-current={isCurrentPage ? "page" : undefined}
                  disabled={isCurrentPage}
                  onClick={() => {
                    goToPage(item)
                  }}
                >
                  {item}
                </Button>
              )
            })
          })()}
        </div>
      </section>
    </div>
  )
}
