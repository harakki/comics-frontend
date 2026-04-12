"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  BookOpen01Icon,
  Calendar03Icon,
  Clock03Icon,
  Tag01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"

import {
  CollectionPreviewCard,
  DashboardHero,
  EmptyStateCard,
  MetricTile,
  SignInPromptCard,
  UserSpacePage,
} from "@/components/user-space"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  TitleResponse,
  UserCollectionResponse,
} from "@/lib/api/api.schemas"
import { hasAuthToken, initKeycloak } from "@/lib/axios-instance"
import {
  buildCollectionPreviewIds,
  fetchAllCollections,
  fetchTitleMap,
  formatDate,
  formatNumber,
  getCollectionTitleCount,
} from "@/lib/user-space"

const COLLECTION_TABS = ["ALL", "PUBLIC", "PRIVATE"] as const

function CollectionsPageSkeleton() {
  return (
    <>
      <div className="rounded-[2rem] border border-border/70 bg-card/70 p-5 shadow-sm sm:p-6 xl:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Skeleton className="h-4 w-36 rounded-full" />
            <Skeleton className="h-12 w-2/3 rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-3xl" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-32 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-10 w-40 rounded-xl" />
              <Skeleton className="h-10 w-32 rounded-xl" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[56rem] rounded-[1.75rem]" />
        <div className="space-y-6">
          <Skeleton className="h-80 rounded-[1.75rem]" />
          <Skeleton className="h-80 rounded-[1.75rem]" />
        </div>
      </div>
    </>
  )
}

const filterCollectionsByTab = (
  items: UserCollectionResponse[],
  tab: (typeof COLLECTION_TABS)[number]
) => {
  if (tab === "PUBLIC") {
    return items.filter((collection) => collection.isPublic)
  }

  if (tab === "PRIVATE") {
    return items.filter((collection) => !collection.isPublic)
  }

  return items
}

export default function CollectionsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [searchValue, setSearchValue] = useState("")
  const [collections, setCollections] = useState<UserCollectionResponse[]>([])
  const [titleMap, setTitleMap] = useState<Map<string, TitleResponse>>(
    new Map()
  )

  const deferredSearchValue = useDeferredValue(searchValue)

  useEffect(() => {
    let isMounted = true

    const loadCollections = async () => {
      setIsLoading(true)

      const authenticated = await initKeycloak().catch(() => false)
      const hasSession = authenticated || hasAuthToken()

      if (!isMounted) {
        return
      }

      setIsAuthenticated(hasSession)

      if (!hasSession) {
        setCollections([])
        setTitleMap(new Map())
        setIsLoading(false)
        return
      }

      const collectionsResult = await fetchAllCollections().catch(() => null)

      if (!isMounted) {
        return
      }

      const nextCollections = collectionsResult?.items || []
      setCollections(nextCollections)

      const nextTitleMap = await fetchTitleMap(
        buildCollectionPreviewIds(nextCollections, 3)
      )

      if (!isMounted) {
        return
      }

      setTitleMap(nextTitleMap)
      setIsLoading(false)
    }

    void loadCollections()

    return () => {
      isMounted = false
    }
  }, [])

  const filteredCollections = useMemo(() => {
    const normalizedQuery = deferredSearchValue.trim().toLowerCase()

    if (!normalizedQuery) {
      return collections
    }

    return collections.filter((collection) => {
      const haystack = [collection.name, collection.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [collections, deferredSearchValue])

  const publicCollections = useMemo(
    () => collections.filter((collection) => collection.isPublic),
    [collections]
  )
  const privateCollections = useMemo(
    () => collections.filter((collection) => !collection.isPublic),
    [collections]
  )
  const totalTitles = useMemo(
    () =>
      collections.reduce(
        (total, collection) => total + getCollectionTitleCount(collection),
        0
      ),
    [collections]
  )
  const largestCollection = useMemo(
    () =>
      [...collections].sort(
        (left, right) =>
          getCollectionTitleCount(right) - getCollectionTitleCount(left)
      )[0] || null,
    [collections]
  )
  const latestUpdatedCollection = useMemo(
    () =>
      [...collections].sort(
        (left, right) =>
          new Date(right.updatedAt || 0).getTime() -
          new Date(left.updatedAt || 0).getTime()
      )[0] || null,
    [collections]
  )

  if (isLoading) {
    return (
      <UserSpacePage>
        <CollectionsPageSkeleton />
      </UserSpacePage>
    )
  }

  if (!isAuthenticated) {
    return (
      <UserSpacePage>
        <DashboardHero
          eyebrow="Коллекции"
          title="Подборки под ваши сценарии чтения"
          description="Коллекции позволяют группировать тайтлы по теме, настроению, жанру или личным задачам. Это отдельный слой над библиотекой с более гибкой организацией."
          badges={
            <>
              <Badge className="rounded-full px-3 py-1">
                Публичные и приватные
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full bg-background/70 px-3 py-1"
              >
                Поиск и визуальные превью
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
                icon={Tag01Icon}
                label="Коллекций"
                value="0"
                hint="Создавайте свои подборки"
              />
              <MetricTile
                icon={UserGroupIcon}
                label="Публичные"
                value="0"
                hint="Открытые для просмотра подборки"
              />
            </>
          }
        />

        <SignInPromptCard
          returnTo="/collections"
          title="Войдите, чтобы открыть коллекции"
          description="После авторизации здесь появятся личные подборки, деление на публичные и приватные списки, а также быстрый поиск по ним."
        />
      </UserSpacePage>
    )
  }

  return (
    <UserSpacePage>
      <DashboardHero
        eyebrow="Коллекции"
        title="Мои коллекции"
        description="Подборки для любой логики чтения: сезонные списки, жанровые наборы, тематические рейки или просто личные маршруты по каталогу."
        badges={
          <>
            <Badge className="rounded-full px-3 py-1">
              {formatNumber(collections.length)} коллекций
            </Badge>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Публичные: {formatNumber(publicCollections.length)}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full bg-background/70 px-3 py-1"
            >
              Приватные: {formatNumber(privateCollections.length)}
            </Badge>
          </>
        }
        actions={[
          { href: "/catalog", label: "Добавить тайтлы", icon: BookOpen01Icon },
          {
            href: "/library",
            label: "К библиотеке",
            variant: "outline",
            icon: Calendar03Icon,
          },
        ]}
        aside={
          <>
            <MetricTile
              icon={Tag01Icon}
              label="Всего"
              value={formatNumber(collections.length)}
              hint="Все личные коллекции"
            />
            <MetricTile
              icon={UserGroupIcon}
              label="Публичные"
              value={formatNumber(publicCollections.length)}
              hint="Открытые подборки"
            />
            <MetricTile
              icon={Clock03Icon}
              label="Приватные"
              value={formatNumber(privateCollections.length)}
              hint="Внутренние подборки"
            />
            <MetricTile
              icon={BookOpen01Icon}
              label="Тайтлов"
              value={formatNumber(totalTitles)}
              hint="Суммарно во всех коллекциях"
            />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="border border-border/70 bg-card/90 shadow-sm">
          <CardHeader className="border-b border-border/70">
            <div className="flex flex-col gap-4">
              <div className="space-y-1">
                <CardTitle>Каталог коллекций</CardTitle>
                <CardDescription>
                  Ищите подборки по имени и описанию, а затем переключайтесь
                  между публичными и приватными списками.
                </CardDescription>
              </div>

              <Input
                value={searchValue}
                onChange={(event) => {
                  setSearchValue(event.target.value)
                }}
                placeholder="Найти коллекцию по названию или описанию"
                className="h-10 rounded-xl"
              />

              <Tabs defaultValue="ALL" className="gap-4">
                <TabsList variant="line" className="h-auto flex-wrap p-0">
                  {COLLECTION_TABS.map((tab) => {
                    const count =
                      tab === "ALL"
                        ? filteredCollections.length
                        : filterCollectionsByTab(filteredCollections, tab)
                            .length

                    return (
                      <TabsTrigger
                        key={tab}
                        value={tab}
                        className="rounded-full border border-border/70 px-3 py-1.5 data-active:border-transparent data-active:bg-primary data-active:text-primary-foreground data-active:after:hidden"
                      >
                        {tab === "ALL"
                          ? `Все (${formatNumber(count)})`
                          : tab === "PUBLIC"
                            ? `Публичные (${formatNumber(count)})`
                            : `Приватные (${formatNumber(count)})`}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>

                {COLLECTION_TABS.map((tab) => {
                  const items = filterCollectionsByTab(filteredCollections, tab)

                  return (
                    <TabsContent key={tab} value={tab} className="pt-2">
                      <CardContent className="space-y-4 px-0 pt-0">
                        {items.length > 0 ? (
                          items.map((collection) => (
                            <CollectionPreviewCard
                              key={collection.id || collection.name}
                              collection={collection}
                              previewTitles={(collection.titleIds || [])
                                .slice(0, 3)
                                .map((titleId) => titleMap.get(titleId))
                                .filter((title): title is TitleResponse =>
                                  Boolean(title)
                                )}
                            />
                          ))
                        ) : (
                          <EmptyStateCard
                            title={
                              deferredSearchValue
                                ? "Совпадений не найдено"
                                : tab === "ALL"
                                  ? "Коллекции пока пусты"
                                  : "В этом сегменте пока ничего нет"
                            }
                            description={
                              deferredSearchValue
                                ? "Попробуйте упростить запрос или расширить описание коллекций."
                                : "Добавьте тайтлы из каталога и соберите первую подборку под свой сценарий чтения."
                            }
                            actionHref="/catalog"
                            actionLabel="Перейти в каталог"
                          />
                        )}
                      </CardContent>
                    </TabsContent>
                  )
                })}
              </Tabs>
            </div>
          </CardHeader>
        </Card>

        <div className="space-y-6">
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Ключевые точки</CardTitle>
              <CardDescription>
                Что сейчас выделяется среди ваших подборок.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                <div className="text-xs text-muted-foreground">
                  Самая большая коллекция
                </div>
                <div className="mt-2 text-sm font-medium">
                  {largestCollection?.name || "Пока нет коллекций"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {largestCollection
                    ? `${formatNumber(getCollectionTitleCount(largestCollection))} тайтлов`
                    : "Создайте первую подборку"}
                </div>
              </div>

              <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                <div className="text-xs text-muted-foreground">
                  Последнее обновление
                </div>
                <div className="mt-2 text-sm font-medium">
                  {latestUpdatedCollection?.name || "Нет данных"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {latestUpdatedCollection
                    ? formatDate(latestUpdatedCollection.updatedAt)
                    : "Активность появится после изменений"}
                </div>
              </div>

              <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                <div className="text-xs text-muted-foreground">
                  Средний размер
                </div>
                <div className="mt-2 text-sm font-medium">
                  {collections.length > 0
                    ? formatNumber(
                        Math.round(
                          totalTitles / Math.max(collections.length, 1)
                        )
                      )
                    : "0"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Тайтлов на одну коллекцию
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Рекомендации по структуре</CardTitle>
              <CardDescription>
                Несколько способов использовать коллекции как рабочий
                инструмент.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              {[
                "Соберите отдельную подборку под текущее настроение или жанр.",
                "Используйте приватные коллекции как черновики будущего чтения.",
                "Публичные подборки подойдут для curated-списков и тематических сетов.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-3xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground"
                >
                  {item}
                </div>
              ))}

              <Button asChild variant="outline" className="w-full">
                <Link href="/catalog">Открыть каталог</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </UserSpacePage>
  )
}
