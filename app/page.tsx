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

const mapWeeklyPopularToCard = (
  title: WeeklyPopularTitleResponse
): TitleCardProps => ({
  id: title.titleId,
  titleId: title.titleId,
  mainCoverMediaId: title.mainCoverMediaId,
  name: title.name,
  slug: title.slug,
})

const PAGE_SIZE = 10

const buildPaginationItems = (currentPage: number, totalPages: number) => {
  if (totalPages <= 1) {
    return [0]
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
    .reduce<Array<number | "ellipsis">>((acc, page) => {
      const previous = acc.at(-1)

      if (typeof previous === "number" && page - previous > 1) {
        acc.push("ellipsis")
      }

      acc.push(page)
      return acc
    }, [])
}

export default function Page() {
  const [titles, setTitles] = useState<TitleCardProps[]>([])
  const [totalTitlePages, setTotalTitlePages] = useState(1)
  const [currentTitlePage, setCurrentTitlePage] = useState(0)
  const [popularTitles, setPopularTitles] = useState<TitleCardProps[]>([])
  const [recommendations, setRecommendations] = useState<TitleCardProps[]>([])
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isTitlesLoading, setIsTitlesLoading] = useState(true)
  const [isPopularLoading, setIsPopularLoading] = useState(true)
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
            .map(mapWeeklyPopularToCard)
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
        <h2 className="text-xl font-semibold">Последние загруженные тайтлы</h2>
        <TitleCardGrid
          items={titles}
          isLoading={isTitlesLoading}
          skeletonCount={PAGE_SIZE}
        />

        <div className="flex flex-wrap justify-center gap-2">
          {paginationItems.map((item, index) => {
            if (item === "ellipsis") {
              return (
                <span
                  key={`latest-titles-pagination-ellipsis-${index}`}
                  className="flex h-9 min-w-9 items-center justify-center px-2 text-sm text-muted-foreground"
                  aria-hidden
                >
                  …
                </span>
              )
            }

            const isCurrentPage = item === currentTitlePage

            return (
              <Button
                key={`latest-titles-page-${item + 1}`}
                type="button"
                variant={isCurrentPage ? "default" : "outline"}
                size="sm"
                className="min-w-9"
                aria-current={isCurrentPage ? "page" : undefined}
                disabled={isCurrentPage}
                onClick={() => {
                  setCurrentTitlePage(item)
                }}
              >
                {item + 1}
              </Button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
