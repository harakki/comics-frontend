"use client"

import { useEffect, useMemo, useState } from "react"

import { TitleCardGrid } from "@/components/title-card-grid"
import { TitleCardRow } from "@/components/title-card-row"
import { Button } from "@/components/ui/button"
import type { TitleCardProps } from "@/components/title-card"
import { getAnalytics } from "@/lib/api/analytics/analytics"
import { getRecommendations } from "@/lib/api/recommendations/recommendations"
import { getTitles } from "@/lib/api/titles/titles"
import type {
  AllTimePopularTitleResponse,
  PersonalRecommendationResponse,
  WeeklyPopularTitleResponse,
  TitleResponse,
} from "@/lib/api/api.schemas"
import { hasAuthToken, initKeycloak } from "@/lib/axios-instance"

const mapTitleToCard = (title: TitleResponse): TitleCardProps => ({
  id: title.id,
  name: title.name,
  slug: title.slug,
  mainCoverMediaId: title.mainCoverMediaId,
  type: title.type,
  contentRating: title.contentRating,
})

const mapRecommendationToCard = (
  recommendation: PersonalRecommendationResponse
): TitleCardProps => ({
  id: recommendation.titleId,
  titleId: recommendation.titleId,
  name: recommendation.name,
  slug: recommendation.slug,
  mainCoverMediaId: recommendation.mainCoverMediaId,
})

const mapPopularTitleToCard = <
  T extends Pick<
    WeeklyPopularTitleResponse,
    "titleId" | "mainCoverMediaId" | "name" | "slug"
  >,
>(title: T): TitleCardProps => ({
  id: title.titleId,
  titleId: title.titleId,
  mainCoverMediaId: title.mainCoverMediaId,
  name: title.name,
  slug: title.slug,
})

const PAGE_SIZE = 10

type PaginationItem = {
  key: string
  value: number | "ellipsis"
}

const buildPaginationItems = (
  currentPage: number,
  totalPages: number,
): PaginationItem[] => {
  if (totalPages <= 1) {
    return [{ key: "latest-titles-page-1", value: 0 }]
  }

  const pageSet = new Set<number>([
    0,
    1,
    totalPages - 2,
    totalPages - 1,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ])

  return Array.from(pageSet)
    .filter((page) => page >= 0 && page < totalPages)
    .sort((left, right) => left - right)
    .reduce<PaginationItem[]>((acc, page) => {
      const previous = acc.at(-1)?.value

      if (typeof previous === "number" && page - previous > 1) {
        acc.push({
          key: `latest-titles-pagination-ellipsis-${previous}-${page}`,
          value: "ellipsis",
        })
      }

      acc.push({ key: `latest-titles-page-${page + 1}`, value: page })
      return acc
    }, [])
}

export default function Page() {
  const [titles, setTitles] = useState<TitleCardProps[]>([])
  const [totalTitlePages, setTotalTitlePages] = useState(1)
  const [currentTitlePage, setCurrentTitlePage] = useState(0)
  const [popularTitles, setPopularTitles] = useState<TitleCardProps[]>([])
  const [allTimePopularTitles, setAllTimePopularTitles] = useState<TitleCardProps[]>([])
  const [recommendations, setRecommendations] = useState<TitleCardProps[]>([])
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isTitlesLoading, setIsTitlesLoading] = useState(true)
  const [isPopularLoading, setIsPopularLoading] = useState(true)
  const [isAllTimePopularLoading, setIsAllTimePopularLoading] = useState(true)
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(true)

  const paginationItems = useMemo(
    () => buildPaginationItems(currentTitlePage, totalTitlePages),
    [currentTitlePage, totalTitlePages]
  )

  useEffect(() => {
    let isMounted = true

    const syncAuthState = async () => {
      const authenticated = await initKeycloak().catch(() => false)

      if (!isMounted) {
        return
      }

      setIsAuthenticated(authenticated || hasAuthToken())
    }

    void syncAuthState()

    const syncFromStorage = () => {
      setIsAuthenticated(hasAuthToken())
    }

    globalThis.addEventListener("storage", syncFromStorage)

    return () => {
      isMounted = false
      globalThis.removeEventListener("storage", syncFromStorage)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadTitles = async () => {
      setIsTitlesLoading(true)

      try {
        const response = await getTitles().searchTitles({
          page: currentTitlePage,
          size: PAGE_SIZE,
          sort: ["updatedAt,DESC"],
        })

        if (!isMounted) {
          return
        }

        setTitles((response.content || []).map(mapTitleToCard))
        setTotalTitlePages(response.page?.totalPages || 1)
      } catch {
        if (!isMounted) {
          return
        }

        setTitles([])
        setTotalTitlePages(1)
      } finally {
        if (isMounted) {
          setIsTitlesLoading(false)
        }
      }
    }

    void loadTitles()

    return () => {
      isMounted = false
    }
  }, [currentTitlePage])

  useEffect(() => {
    let isMounted = true

    const loadPopularTitles = async () => {
      setIsPopularLoading(true)

      try {
        const response = await getAnalytics().getTopWeeklyPopularTitles()

        if (!isMounted) {
          return
        }

        setPopularTitles(
          [...(response || [])]
            .sort((left, right) => (left.rank || 0) - (right.rank || 0))
            .map(mapPopularTitleToCard)
        )
      } catch {
        if (!isMounted) {
          return
        }

        setPopularTitles([])
      } finally {
        if (isMounted) {
          setIsPopularLoading(false)
        }
      }
    }

    void loadPopularTitles()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadAllTimePopularTitles = async () => {
      setIsAllTimePopularLoading(true)

      try {
        const response = await getAnalytics().getAllTimePopularTitles()

        if (!isMounted) {
          return
        }

        setAllTimePopularTitles(
          [...(response || [])]
            .sort((left, right) => (left.rank || 0) - (right.rank || 0))
            .map(mapPopularTitleToCard)
        )
      } catch {
        if (!isMounted) {
          return
        }

        setAllTimePopularTitles([])
      } finally {
        if (isMounted) {
          setIsAllTimePopularLoading(false)
        }
      }
    }

    void loadAllTimePopularTitles()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setRecommendations([])
      setIsRecommendationsLoading(false)
      return
    }

    let isMounted = true

    const loadRecommendations = async () => {
      setIsRecommendationsLoading(true)

      try {
        const response = await getRecommendations().getMyRecommendations({
          limit: 12,
        })

        if (!isMounted) {
          return
        }

        setRecommendations((response || []).map(mapRecommendationToCard))
      } catch {
        if (!isMounted) {
          return
        }

        setRecommendations([])
      } finally {
        if (isMounted) {
          setIsRecommendationsLoading(false)
        }
      }
    }

    void loadRecommendations()

    return () => {
      isMounted = false
    }
  }, [isAuthenticated])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-6">
      {isAuthenticated && (
        <section className="space-y-4">
          <h1 className="text-xl font-semibold">Рекомендации для вас</h1>
          <TitleCardRow
            items={recommendations}
            isLoading={isRecommendationsLoading}
            emptyText="Рекомендаций пока нет"
            skeletonCount={8}
          />
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Популярное за неделю</h2>
        <TitleCardRow
          items={popularTitles}
          isLoading={isPopularLoading}
          emptyText="Популярных тайтлов пока нет"
          skeletonCount={8}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Популярное за всё время</h2>
        <TitleCardRow
          items={allTimePopularTitles}
          isLoading={isAllTimePopularLoading}
          emptyText="Популярных тайтлов за всё время пока нет"
          skeletonCount={8}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Последние загруженные тайтлы</h2>
        <TitleCardGrid
          items={titles}
          isLoading={isTitlesLoading}
          skeletonCount={PAGE_SIZE}
        />

        <div className="flex flex-wrap justify-center gap-2">
          {paginationItems.map((item) => {
            if (item.value === "ellipsis") {
              return (
                <span
                  key={item.key}
                  className="flex h-9 min-w-9 items-center justify-center px-2 text-sm text-muted-foreground"
                  aria-hidden
                >
                  …
                </span>
              )
            }

            const page = item.value as number
            const isCurrentPage = page === currentTitlePage

            return (
              <Button
                key={item.key}
                type="button"
                variant={isCurrentPage ? "default" : "outline"}
                size="sm"
                className="min-w-9"
                aria-current={isCurrentPage ? "page" : undefined}
                disabled={isCurrentPage}
                onClick={() => {
                  setCurrentTitlePage(page)
                }}
              >
                {page + 1}
              </Button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
