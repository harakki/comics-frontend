"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  BookBookmark01Icon,
  BookOpen01Icon,
  Calendar03Icon,
  EyeIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons"

import { TitleCardGrid } from "@/components/title-card-grid"
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
import { Skeleton } from "@/components/ui/skeleton"
import type {
  LibraryEntryResponse,
  TitleResponse,
  UserCollectionResponse,
} from "@/lib/api/api.schemas"
import {
  getAuthTokenClaims,
  hasAuthToken,
  initKeycloak,
  type AuthTokenClaims,
} from "@/lib/axios-instance"
import {
  LIBRARY_STATUS_LABELS,
  LIBRARY_STATUS_ORDER,
  buildCollectionPreviewIds,
  fetchAllCollections,
  fetchAllLibraryEntries,
  fetchTitleMap,
  formatDate,
  formatDateTime,
  formatNumber,
  getLibraryStatusCountMap,
  getUserDisplayName,
  getUserHandle,
  getUserInitials,
  getUserRoles,
  mapTitleToCard,
  sortLibraryEntriesByUpdatedAt,
} from "@/lib/user-space"

const STATUS_BAR_CLASS_NAMES: Record<string, string> = {
  READING: "bg-primary",
  RE_READING: "bg-primary/70",
  TO_READ: "bg-foreground/70",
  COMPLETED: "bg-emerald-500/80",
  ON_HOLD: "bg-amber-500/80",
  DROPPED: "bg-destructive/80",
}

function ProfilePageSkeleton() {
  return (
    <>
      <div className="rounded-[2rem] border border-border/70 bg-card/70 p-5 shadow-sm sm:p-6 xl:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Skeleton className="h-4 w-28 rounded-full" />
            <Skeleton className="h-12 w-3/4 rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-3xl" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-36 rounded-full" />
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
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Skeleton className="h-88 rounded-[1.75rem]" />
          <Skeleton className="h-88 rounded-[1.75rem]" />
          <Skeleton className="h-96 rounded-[1.75rem]" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-72 rounded-[1.75rem]" />
          <Skeleton className="h-96 rounded-[1.75rem]" />
        </div>
      </div>
    </>
  )
}

const getTitlesForEntries = (
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

export default function ProfilePage() {
  const [claims, setClaims] = useState<AuthTokenClaims | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [syncAt, setSyncAt] = useState<string | null>(null)
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntryResponse[]>(
    []
  )
  const [collections, setCollections] = useState<UserCollectionResponse[]>([])
  const [titleMap, setTitleMap] = useState<Map<string, TitleResponse>>(
    new Map()
  )

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      setIsLoading(true)

      const authenticated = await initKeycloak().catch(() => false)
      const hasSession = authenticated || hasAuthToken()
      const nextClaims = getAuthTokenClaims()

      if (!isMounted) {
        return
      }

      setClaims(nextClaims)
      setIsAuthenticated(hasSession)

      if (!hasSession) {
        setLibraryEntries([])
        setCollections([])
        setTitleMap(new Map())
        setSyncAt(null)
        setIsLoading(false)
        return
      }

      const [libraryResult, collectionsResult] = await Promise.allSettled([
        fetchAllLibraryEntries(),
        fetchAllCollections(),
      ])

      if (!isMounted) {
        return
      }

      const nextLibraryEntries =
        libraryResult.status === "fulfilled" ? libraryResult.value.items : []
      const nextCollections =
        collectionsResult.status === "fulfilled"
          ? collectionsResult.value.items
          : []

      setLibraryEntries(nextLibraryEntries)
      setCollections(nextCollections)

      const previewTitleIds = [
        ...nextLibraryEntries.slice(0, 12).map((entry) => entry.titleId || ""),
        ...buildCollectionPreviewIds(nextCollections.slice(0, 3)),
      ]

      const nextTitleMap = await fetchTitleMap(previewTitleIds)

      if (!isMounted) {
        return
      }

      setTitleMap(nextTitleMap)
      setSyncAt(new Date().toISOString())
      setIsLoading(false)
    }

    void loadProfile()

    return () => {
      isMounted = false
    }
  }, [])

  const displayName = useMemo(() => getUserDisplayName(claims), [claims])
  const handle = useMemo(() => getUserHandle(claims), [claims])
  const initials = useMemo(() => getUserInitials(claims), [claims])
  const roles = useMemo(() => getUserRoles(claims).slice(0, 3), [claims])
  const statusCounts = useMemo(
    () => getLibraryStatusCountMap(libraryEntries),
    [libraryEntries]
  )

  const activeEntries = useMemo(
    () =>
      [...libraryEntries]
        .filter(
          (entry) => entry.status === "READING" || entry.status === "RE_READING"
        )
        .sort(sortLibraryEntriesByUpdatedAt)
        .slice(0, 6),
    [libraryEntries]
  )

  const recentEntries = useMemo(
    () => [...libraryEntries].sort(sortLibraryEntriesByUpdatedAt).slice(0, 8),
    [libraryEntries]
  )

  const activeCards = useMemo(
    () => getTitlesForEntries(activeEntries, titleMap),
    [activeEntries, titleMap]
  )
  const recentCards = useMemo(
    () => getTitlesForEntries(recentEntries, titleMap),
    [recentEntries, titleMap]
  )

  const collectionsWithPreview = useMemo(
    () =>
      collections.slice(0, 3).map((collection) => ({
        collection,
        previewTitles: (collection.titleIds || [])
          .slice(0, 3)
          .map((titleId) => titleMap.get(titleId))
          .filter((title): title is TitleResponse => Boolean(title)),
      })),
    [collections, titleMap]
  )

  const totalCollectionTitles = useMemo(
    () =>
      collections.reduce(
        (total, collection) => total + (collection.titleIds?.length || 0),
        0
      ),
    [collections]
  )

  if (isLoading) {
    return (
      <UserSpacePage>
        <ProfilePageSkeleton />
      </UserSpacePage>
    )
  }

  if (!isAuthenticated) {
    return (
      <UserSpacePage>
        <DashboardHero
          eyebrow="Профиль"
          title="Ваша читательская панель"
          description="Профиль объединяет библиотеку, текущие статусы чтения и личные коллекции в одном месте. После входа здесь появятся сводка, активность и быстрые переходы."
          badges={
            <>
              <Badge className="rounded-full px-3 py-1">
                Личная статистика
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full bg-background/70 px-3 py-1"
              >
                Библиотека и подборки
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
                label="Библиотека"
                value="0"
                hint="Сохранённые тайтлы появятся после входа"
              />
              <MetricTile
                icon={Tag01Icon}
                label="Коллекции"
                value="0"
                hint="Собирайте свои подборки"
              />
            </>
          }
        />

        <SignInPromptCard
          returnTo="/profile"
          title="Войдите, чтобы открыть профиль"
          description="После авторизации вы увидите текущие тайтлы в чтении, распределение по статусам и персональные коллекции."
        />
      </UserSpacePage>
    )
  }

  return (
    <UserSpacePage>
      <DashboardHero
        eyebrow="Профиль"
        title={displayName}
        description="Обзор вашей читательской активности, статусов библиотеки и личных подборок. Всё важное собрано на одном экране с быстрыми переходами к рабочим разделам."
        badges={
          <>
            <Badge className="rounded-full px-3 py-1">@{handle}</Badge>
            {claims?.email ? (
              <Badge
                variant="outline"
                className="rounded-full bg-background/70 px-3 py-1"
              >
                {claims.email}
              </Badge>
            ) : null}
            {roles.map((role) => (
              <Badge
                key={role}
                variant="secondary"
                className="rounded-full px-3 py-1"
              >
                {role}
              </Badge>
            ))}
          </>
        }
        actions={[
          {
            href: "/library",
            label: "Открыть библиотеку",
            icon: BookBookmark01Icon,
          },
          {
            href: "/collections",
            label: "Смотреть коллекции",
            variant: "outline",
            icon: Tag01Icon,
          },
          {
            href: "/catalog",
            label: "В каталог",
            variant: "ghost",
            icon: BookOpen01Icon,
          },
        ]}
        aside={
          <>
            <MetricTile
              icon={BookBookmark01Icon}
              label="В библиотеке"
              value={formatNumber(libraryEntries.length)}
              hint="Все сохранённые тайтлы"
            />
            <MetricTile
              icon={EyeIcon}
              label="Активно читаю"
              value={formatNumber(
                statusCounts.READING + statusCounts.RE_READING
              )}
              hint="Читаю и перечитываю"
            />
            <MetricTile
              icon={Tag01Icon}
              label="Коллекции"
              value={formatNumber(collections.length)}
              hint={`${formatNumber(totalCollectionTitles)} тайтлов внутри`}
            />
            <MetricTile
              icon={Calendar03Icon}
              label="Завершено"
              value={formatNumber(statusCounts.COMPLETED)}
              hint="Полностью дочитанные серии"
            />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Сейчас в фокусе</CardTitle>
              <CardDescription>
                Тайтлы, к которым вы возвращались последними. Блок ориентирован
                на активное чтение и быстрый возврат в библиотеку.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {activeCards.length > 0 ? (
                <TitleCardGrid
                  items={activeCards}
                  className="md:grid-cols-3 xl:grid-cols-3"
                />
              ) : (
                <EmptyStateCard
                  title="Активного чтения пока нет"
                  description="Добавьте тайтлы в библиотеку и переведите их в статус «Читаю», чтобы они появились в этом блоке."
                  actionHref="/catalog"
                  actionLabel="Найти тайтл"
                />
              )}
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>Недавние изменения в библиотеке</CardTitle>
                  <CardDescription>
                    Последние сохранённые или обновлённые тайтлы, чтобы быстро
                    вернуться к свежей активности.
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/library">Открыть всё</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {recentCards.length > 0 ? (
                <TitleCardGrid
                  items={recentCards}
                  className="md:grid-cols-3 xl:grid-cols-4"
                />
              ) : (
                <EmptyStateCard
                  title="Библиотека пока пуста"
                  description="После добавления тайтлов сюда попадут последние обновления и свежая активность по чтению."
                  actionHref="/catalog"
                  actionLabel="Перейти в каталог"
                />
              )}
            </CardContent>
          </Card>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Коллекции
                </h2>
                <p className="text-sm text-muted-foreground">
                  Подборки, которые вы уже собрали и можете развивать дальше.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/collections">Все коллекции</Link>
              </Button>
            </div>

            {collectionsWithPreview.length > 0 ? (
              <div className="grid gap-4">
                {collectionsWithPreview.map(({ collection, previewTitles }) => (
                  <CollectionPreviewCard
                    key={collection.id || collection.name}
                    collection={collection}
                    previewTitles={previewTitles}
                  />
                ))}
              </div>
            ) : (
              <EmptyStateCard
                title="Коллекции ещё не созданы"
                description="Собирайте отдельные подборки под настроение, жанры или темы, чтобы быстрее возвращаться к нужным сериям."
                actionHref="/catalog"
                actionLabel="Подобрать тайтлы"
              />
            )}
          </section>
        </div>

        <div className="space-y-6">
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Карточка аккаунта</CardTitle>
              <CardDescription>
                Базовые сведения по текущей авторизации и синхронизации.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-4">
                <div className="flex size-14 items-center justify-center rounded-3xl bg-primary/10 text-lg font-semibold text-primary">
                  {initials}
                </div>
                <div className="space-y-1">
                  <div className="text-lg font-semibold">{displayName}</div>
                  <div className="text-sm text-muted-foreground">@{handle}</div>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="mt-2 text-sm font-medium">
                    {claims?.email || "Не указан"}
                  </div>
                </div>
                <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                  <div className="text-xs text-muted-foreground">
                    ID пользователя
                  </div>
                  <div className="mt-2 text-sm font-medium break-all">
                    {claims?.sub || "Нет данных"}
                  </div>
                </div>
                <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                  <div className="text-xs text-muted-foreground">
                    Последняя синхронизация
                  </div>
                  <div className="mt-2 text-sm font-medium">
                    {formatDateTime(syncAt)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Распределение библиотеки</CardTitle>
              <CardDescription>
                Как ваши тайтлы распределены по текущим статусам чтения.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {libraryEntries.length > 0 ? (
                LIBRARY_STATUS_ORDER.map((status) => {
                  const count = statusCounts[status] || 0
                  const width =
                    libraryEntries.length > 0
                      ? Math.max(
                          (count / libraryEntries.length) * 100,
                          count > 0 ? 8 : 0
                        )
                      : 0

                  return (
                    <div key={status} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>{LIBRARY_STATUS_LABELS[status]}</span>
                        <span className="font-medium">
                          {formatNumber(count)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className={STATUS_BAR_CLASS_NAMES[status]}
                          style={{
                            width: `${width}%`,
                            height: "100%",
                            borderRadius: 9999,
                          }}
                        />
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  После наполнения библиотеки здесь появится разрез по статусам
                  чтения.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Сводка</CardTitle>
              <CardDescription>
                Быстрый срез по активности и наполнению вашего профиля.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                <div className="text-xs text-muted-foreground">
                  Тайтлов в коллекциях
                </div>
                <div className="mt-2 text-sm font-medium">
                  {formatNumber(totalCollectionTitles)}
                </div>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                <div className="text-xs text-muted-foreground">На паузе</div>
                <div className="mt-2 text-sm font-medium">
                  {formatNumber(statusCounts.ON_HOLD)}
                </div>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/70 p-4">
                <div className="text-xs text-muted-foreground">
                  Первая активность
                </div>
                <div className="mt-2 text-sm font-medium">
                  {formatDate(
                    [...libraryEntries].sort(
                      (left, right) =>
                        new Date(left.createdAt || 0).getTime() -
                        new Date(right.createdAt || 0).getTime()
                    )[0]?.createdAt
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </UserSpacePage>
  )
}
