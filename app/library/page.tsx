"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BookBookmark01Icon,
  BookOpen01Icon,
  Calendar03Icon,
  Clock03Icon,
  EyeIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { TitleCardGrid } from "@/components/title-card-grid"
import {
  DashboardHero,
  EmptyStateCard,
  MetricTile,
  SignInPromptCard,
  UserSpacePage,
} from "@/components/user-space"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { LibraryEntryResponse, TitleResponse } from "@/lib/api/api.schemas"
import { hasAuthToken, initKeycloak } from "@/lib/axios-instance"
import {
  LIBRARY_STATUS_LABELS,
  LIBRARY_STATUS_ORDER,
  fetchAllLibraryEntries,
  fetchTitleMap,
  formatDateTime,
  formatNumber,
  getLibraryStatusCountMap,
  mapTitleToCard,
  sortLibraryEntriesByUpdatedAt,
} from "@/lib/user-space"

const STATUS_ORDER = ["ALL", ...LIBRARY_STATUS_ORDER] as const

function LibraryPageSkeleton() {
  return (
    <>
      <div className="rounded-[2rem] border border-border/70 bg-card/70 p-5 shadow-sm sm:p-6 xl:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Skeleton className="h-4 w-32 rounded-full" />
            <Skeleton className="h-12 w-3/4 rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-3xl" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-32 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-10 w-36 rounded-xl" />
              <Skeleton className="h-10 w-32 rounded-xl" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[44rem] rounded-[1.75rem]" />
        <div className="space-y-6">
          <Skeleton className="h-96 rounded-[1.75rem]" />
          <Skeleton className="h-96 rounded-[1.75rem]" />
        </div>
      </div>
    </>
  )
}

const getCardsForEntries = (
  entries: LibraryEntryResponse[],
  titleMap: Map<string, TitleResponse>
) =>
  entries
    .map((entry) => {
      if (!entry.titleId) {
        return null
      }

      const title = titleMap.get(entry.titleId)

      return title ? mapTitleToCard(title) : null
    })
    .filter((card): card is NonNullable<typeof card> => card !== null)

export default function LibraryPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntryResponse[]>(
    []
  )
  const [titleMap, setTitleMap] = useState<Map<string, TitleResponse>>(
    new Map()
  )

  useEffect(() => {
    let isMounted = true

    const loadLibrary = async () => {
      setIsLoading(true)

      const authenticated = await initKeycloak().catch(() => false)
      const hasSession = authenticated || hasAuthToken()

      if (!isMounted) {
        return
      }

      setIsAuthenticated(hasSession)

      if (!hasSession) {
        setLibraryEntries([])
        setTitleMap(new Map())
        setIsLoading(false)
        return
      }

      const libraryResult = await fetchAllLibraryEntries().catch(() => null)

      if (!isMounted) {
        return
      }

      const nextEntries = libraryResult?.items || []
      setLibraryEntries(nextEntries)

      const nextTitleMap = await fetchTitleMap(
        nextEntries.map((entry) => entry.titleId || "")
      )

      if (!isMounted) {
        return
      }

      setTitleMap(nextTitleMap)
      setIsLoading(false)
    }

    void loadLibrary()

    return () => {
      isMounted = false
    }
  }, [])

  const statusCounts = useMemo(
    () => getLibraryStatusCountMap(libraryEntries),
    [libraryEntries]
  )
  const likedCount = useMemo(
    () => libraryEntries.filter((entry) => entry.vote === "LIKE").length,
    [libraryEntries]
  )
  const dislikedCount = useMemo(
    () => libraryEntries.filter((entry) => entry.vote === "DISLIKE").length,
    [libraryEntries]
  )
  const recentEntries = useMemo(
    () => [...libraryEntries].sort(sortLibraryEntriesByUpdatedAt).slice(0, 6),
    [libraryEntries]
  )
  const entriesByStatus = useMemo(
    () =>
      Object.fromEntries(
        STATUS_ORDER.map((status) => [
          status,
          status === "ALL"
            ? [...libraryEntries].sort(sortLibraryEntriesByUpdatedAt)
            : libraryEntries
                .filter((entry) => entry.status === status)
                .sort(sortLibraryEntriesByUpdatedAt),
        ])
      ) as Record<(typeof STATUS_ORDER)[number], LibraryEntryResponse[]>,
    [libraryEntries]
  )

  const cardsByStatus = useMemo(
    () =>
      Object.fromEntries(
        STATUS_ORDER.map((status) => [
          status,
          getCardsForEntries(entriesByStatus[status], titleMap),
        ])
      ) as Record<
        (typeof STATUS_ORDER)[number],
        ReturnType<typeof getCardsForEntries>
      >,
    [entriesByStatus, titleMap]
  )

  if (isLoading) {
    return (
      <UserSpacePage>
        <LibraryPageSkeleton />
      </UserSpacePage>
    )
  }

  if (!isAuthenticated) {
    return (
      <UserSpacePage>
        <DashboardHero
          eyebrow="Библиотека"
          title="Ваш основной стек чтения"
          description="Библиотека собирает все сохранённые тайтлы и раскладывает их по статусам: что читать сейчас, что отложено и что уже завершено."
          badges={
            <>
              <Badge className="rounded-full px-3 py-1">Статусы чтения</Badge>
              <Badge
                variant="outline"
                className="rounded-full bg-background/70 px-3 py-1"
              >
                Сетка тайтлов и история активности
              </Badge>
            </>
          }
          actions={[
            {
              href: "/catalog",
              label: "Открыть каталог",
              icon: BookOpen01Icon,
            },
          ]}
          aside={
            <>
              <MetricTile
                icon={BookBookmark01Icon}
                label="Тайтлов"
                value="0"
                hint="Добавьте серии после входа"
              />
              <MetricTile
                icon={EyeIcon}
                label="Читаю"
                value="0"
                hint="Текущие чтения"
              />
            </>
          }
        />

        <SignInPromptCard
          returnTo="/library"
          title="Войдите, чтобы открыть библиотеку"
          description="После авторизации здесь появятся статусы чтения, последние обновления и полная сетка сохранённых тайтлов."
        />
      </UserSpacePage>
    )
  }

  return (
    <UserSpacePage>
      <DashboardHero
        eyebrow="Библиотека"
        title="Моя библиотека"
        description="Рабочий экран для чтения: все сохранённые тайтлы, быстрый переход по статусам и обзор последней активности без лишней навигации."
        badges={
          <>
            <Badge className="rounded-full px-3 py-1">
              {formatNumber(libraryEntries.length)} тайтлов
            </Badge>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Нравится: {formatNumber(likedCount)}
            </Badge>
            {dislikedCount > 0 ? (
              <Badge
                variant="outline"
                className="rounded-full bg-background/70 px-3 py-1"
              >
                Не нравится: {formatNumber(dislikedCount)}
              </Badge>
            ) : null}
          </>
        }
        actions={[
          {
            href: "/catalog",
            label: "Добавить из каталога",
            icon: BookOpen01Icon,
          },
          {
            href: "/collections",
            label: "К коллекциям",
            variant: "outline",
            icon: Calendar03Icon,
          },
        ]}
        aside={
          <>
            <MetricTile
              icon={BookBookmark01Icon}
              label="Всего"
              value={formatNumber(libraryEntries.length)}
              hint="Все сохранённые тайтлы"
            />
            <MetricTile
              icon={EyeIcon}
              label="Читаю"
              value={formatNumber(
                statusCounts.READING + statusCounts.RE_READING
              )}
              hint="Активные статусы чтения"
            />
            <MetricTile
              icon={Tick02Icon}
              label="Завершено"
              value={formatNumber(statusCounts.COMPLETED)}
              hint="Дочитанные серии"
            />
            <MetricTile
              icon={Clock03Icon}
              label="Отложено"
              value={formatNumber(statusCounts.ON_HOLD)}
              hint="Временно на паузе"
            />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="border border-border/70 bg-card/90 shadow-sm">
          <CardHeader className="border-b border-border/70">
            <div className="flex flex-col gap-4">
              <div className="space-y-1">
                <CardTitle>Категории чтения</CardTitle>
                <CardDescription>
                  Переключайтесь между статусами и смотрите библиотеку в нужном
                  контексте, не теряя общую структуру.
                </CardDescription>
              </div>

              <Tabs defaultValue="ALL" className="gap-4">
                <TabsList variant="line" className="h-auto flex-wrap p-0">
                  {STATUS_ORDER.map((status) => (
                    <TabsTrigger
                      key={status}
                      value={status}
                      className="rounded-full border border-border/70 px-3 py-1.5 data-active:border-transparent data-active:bg-primary data-active:text-primary-foreground data-active:after:hidden"
                    >
                      {status === "ALL"
                        ? `Все (${formatNumber(libraryEntries.length)})`
                        : `${LIBRARY_STATUS_LABELS[status]} (${formatNumber(
                            statusCounts[status]
                          )})`}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {STATUS_ORDER.map((status) => (
                  <TabsContent key={status} value={status} className="pt-2">
                    <CardContent className="px-0 pt-0">
                      {cardsByStatus[status].length > 0 ? (
                        <TitleCardGrid
                          items={cardsByStatus[status]}
                          className="md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4"
                        />
                      ) : (
                        <EmptyStateCard
                          title={
                            status === "ALL"
                              ? "Библиотека пока пуста"
                              : `В статусе «${LIBRARY_STATUS_LABELS[status]}» пока ничего нет`
                          }
                          description={
                            status === "ALL"
                              ? "Добавьте тайтлы из каталога, чтобы собрать своё пространство для чтения."
                              : "Измените статус нужных тайтлов или добавьте новые серии, чтобы заполнить этот раздел."
                          }
                          actionHref="/catalog"
                          actionLabel="Перейти в каталог"
                        />
                      )}
                    </CardContent>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </CardHeader>
        </Card>

        <div className="space-y-6">
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Структура библиотеки</CardTitle>
              <CardDescription>
                Быстрый срез по основным статусам чтения.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {LIBRARY_STATUS_ORDER.map((status) => {
                const count = statusCounts[status] || 0
                const share =
                  libraryEntries.length > 0
                    ? (count / libraryEntries.length) * 100
                    : 0

                return (
                  <div key={status} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>{LIBRARY_STATUS_LABELS[status]}</span>
                      <span className="font-medium">{formatNumber(count)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Последняя активность</CardTitle>
              <CardDescription>
                Недавние обновления в библиотеке для быстрого возврата.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              {recentEntries.length > 0 ? (
                recentEntries.map((entry) => {
                  const title = entry.titleId
                    ? titleMap.get(entry.titleId)
                    : null

                  return (
                    <div
                      key={entry.id || entry.titleId}
                      className="rounded-3xl border border-border/70 bg-background/70 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-medium">
                            {title?.name || "Тайтл недоступен"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(entry.updatedAt)}
                          </div>
                        </div>
                        {entry.status ? (
                          <Badge
                            variant="outline"
                            className="rounded-full px-3 py-1"
                          >
                            {LIBRARY_STATUS_LABELS[entry.status]}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  Активность появится после того, как вы начнёте добавлять
                  тайтлы и менять их статусы.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </UserSpacePage>
  )
}
