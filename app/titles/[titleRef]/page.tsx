"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MediaImage } from "@/components/ui/media-image"
import {
  CONTENT_RATING_LABELS,
  TITLE_TYPE_LABELS,
} from "@/lib/constants"
import { getAnalytics } from "@/lib/api/analytics/analytics"
import { getChapters } from "@/lib/api/chapters/chapters"
import { getCollections } from "@/lib/api/collections/collections"
import {
  LibraryEntryUpdateRequestStatus,
  LibraryEntryUpdateRequestVote,
  type ChapterSummaryResponse,
  type LibraryEntryResponse,
  type LibraryEntryResponseStatus,
  type TitleAnalyticsResponse,
  type TitleResponse,
  type UserCollectionResponse,
} from "@/lib/api/api.schemas"
import { getLibrary } from "@/lib/api/library/library"
import { getTitles } from "@/lib/api/titles/titles"
import { buildLoginHref, hasAuthToken, initKeycloak } from "@/lib/axios-instance"

const TITLE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const LIBRARY_STATUS_LABELS: Record<string, string> = {
  TO_READ: "Хочу прочитать",
  READING: "Читаю",
  ON_HOLD: "Отложено",
  DROPPED: "Брошено",
  COMPLETED: "Прочитано",
  RE_READING: "Перечитываю",
}

const VOTE_LABELS: Record<string, string> = {
  LIKE: "Лайк",
  DISLIKE: "Дизлайк",
}

const toArray = <T,>(value: T | T[] | undefined): T[] => {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

const normalizeCollectionsPayload = (payload: unknown): UserCollectionResponse[] => {
  if (Array.isArray(payload)) {
    return payload as UserCollectionResponse[]
  }

  if (!payload || typeof payload !== "object") {
    return []
  }

  const maybePaged = payload as { content?: unknown }

  if (Array.isArray(maybePaged.content)) {
    return maybePaged.content as UserCollectionResponse[]
  }

  const maybeSingleCollection = payload as UserCollectionResponse

  if (typeof maybeSingleCollection.id === "string") {
    return [maybeSingleCollection]
  }

  return []
}

const toTitleLabel = (title?: TitleResponse) => {
  if (!title) {
    return "Без названия"
  }

  return title.name || title.slug || title.id || "Без названия"
}

const resolveTitleByRef = async (titleRef: string) => {
  const titlesApi = getTitles()

  if (TITLE_ID_PATTERN.test(titleRef)) {
    return titlesApi.getTitle(titleRef)
  }

  const response = await titlesApi.searchTitles({
    page: 0,
    size: 50,
    search: titleRef,
    sort: ["name,ASC"],
  })

  const found = (response.content || []).find(
    (title) => title.slug === titleRef || title.id === titleRef
  )

  if (!found?.id) {
    throw new Error("TITLE_NOT_FOUND")
  }

  return titlesApi.getTitle(found.id)
}

const mapReadStatus = (pairs: Array<{ chapterId: string; isRead: boolean }>) => {
  return pairs.reduce<Record<string, boolean>>((acc, item) => {
    acc[item.chapterId] = item.isRead
    return acc
  }, {})
}

export default function TitleDetailsPage() {
  const params = useParams<{ titleRef: string | string[] }>()
  const router = useRouter()

  const titleRef = useMemo(() => {
    const value = params?.titleRef
    return Array.isArray(value) ? value[0] || "" : value || ""
  }, [params?.titleRef])

  const [title, setTitle] = useState<TitleResponse | null>(null)
  const [chapters, setChapters] = useState<ChapterSummaryResponse[]>([])
  const [analytics, setAnalytics] = useState<TitleAnalyticsResponse | null>(null)
  const [libraryEntry, setLibraryEntry] = useState<LibraryEntryResponse | null>(null)
  const [collections, setCollections] = useState<UserCollectionResponse[]>([])
  const [readStatusMap, setReadStatusMap] = useState<Record<string, boolean>>({})
  const [nextUnreadChapterId, setNextUnreadChapterId] = useState<string | null>(null)

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [isCollectionsLoading, setIsCollectionsLoading] = useState(false)
  const [isReadStatusLoading, setIsReadStatusLoading] = useState(false)

  const [isUpdatingLibrary, setIsUpdatingLibrary] = useState(false)
  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(null)
  const [pendingChapterId, setPendingChapterId] = useState<string | null>(null)

  const [newCollectionName, setNewCollectionName] = useState("")
  const [isNewCollectionPublic, setIsNewCollectionPublic] = useState(false)
  const [isCreatingCollection, setIsCreatingCollection] = useState(false)

  const [errorText, setErrorText] = useState<string | null>(null)

  const loginHref = buildLoginHref(`/titles/${titleRef}`)

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
    if (!titleRef) {
      setErrorText("Не удалось определить идентификатор тайтла")
      setIsPageLoading(false)
      return
    }

    let isMounted = true

    const loadPage = async () => {
      setIsPageLoading(true)
      setErrorText(null)
      setLibraryEntry(null)
      setCollections([])
      setReadStatusMap({})
      setNextUnreadChapterId(null)

      try {
        const resolvedTitle = await resolveTitleByRef(titleRef)

        if (!isMounted) {
          return
        }

        setTitle(resolvedTitle)

        const titleId = resolvedTitle.id

        if (!titleId) {
          throw new Error("TITLE_NOT_FOUND")
        }

        const [chaptersResponse, analyticsResponse] = await Promise.all([
          getChapters().getChaptersInfoByTitle(titleId).catch(() => []),
          getAnalytics().getTitleAnalytics(titleId).catch(() => null),
        ])

        if (!isMounted) {
          return
        }

        setChapters(chaptersResponse || [])
        setAnalytics(analyticsResponse)

        if (!isAuthenticated) {
          return
        }

        const [entry, collectionsPayload, nextUnread] = await Promise.all([
          getLibrary().getLibraryEntry(titleId).catch(() => null),
          getCollections()
            .getMyCollections({ page: 0, size: 100 })
            .then((result) => result as unknown)
            .catch(() => null),
          getChapters().getNextUnreadChapter(titleId).catch(() => null),
        ])

        if (!isMounted) {
          return
        }

        setLibraryEntry(entry)
        setCollections(normalizeCollectionsPayload(collectionsPayload))
        setNextUnreadChapterId(nextUnread?.chapterId || null)
      } catch {
        if (!isMounted) {
          return
        }

        setTitle(null)
        setChapters([])
        setAnalytics(null)
        setErrorText("Тайтл не найден")
      } finally {
        if (isMounted) {
          setIsPageLoading(false)
        }
      }
    }

    void loadPage()

    return () => {
      isMounted = false
    }
  }, [isAuthenticated, titleRef])

  useEffect(() => {
    if (!isAuthenticated || chapters.length === 0) {
      return
    }

    let isMounted = true

    const loadReadStatuses = async () => {
      setIsReadStatusLoading(true)

      const ids = chapters
        .map((chapter) => chapter.id)
        .filter((chapterId): chapterId is string => Boolean(chapterId))
        .slice(0, 20)

      try {
        const results = await Promise.all(
          ids.map(async (chapterId) => {
            const response = await getChapters().isChapterRead(chapterId).catch(() => null)
            return {
              chapterId,
              isRead: Boolean(response?.isRead),
            }
          })
        )

        if (!isMounted) {
          return
        }

        setReadStatusMap(mapReadStatus(results))
      } finally {
        if (isMounted) {
          setIsReadStatusLoading(false)
        }
      }
    }

    void loadReadStatuses()

    return () => {
      isMounted = false
    }
  }, [chapters, isAuthenticated])

  const refreshCollections = async () => {
    if (!isAuthenticated) {
      return
    }

    setIsCollectionsLoading(true)

    try {
      const payload = await getCollections()
        .getMyCollections({ page: 0, size: 100 })
        .then((result) => result as unknown)
        .catch(() => null)

      setCollections(normalizeCollectionsPayload(payload))
    } finally {
      setIsCollectionsLoading(false)
    }
  }

  const upsertLibraryEntry = async (changes: Partial<LibraryEntryResponse>) => {
    if (!title?.id || !isAuthenticated) {
      return
    }

    setIsUpdatingLibrary(true)

    try {
      const updatedEntry = await getLibrary().addOrUpdateLibraryEntry(title.id, {
        status: changes.status || libraryEntry?.status,
        vote: changes.vote || libraryEntry?.vote,
        lastReadChapterId: changes.lastReadChapterId || libraryEntry?.lastReadChapterId,
      })

      setLibraryEntry(updatedEntry)
    } finally {
      setIsUpdatingLibrary(false)
    }
  }

  const deleteLibraryEntry = async () => {
    if (!libraryEntry?.id) {
      return
    }

    setIsUpdatingLibrary(true)

    try {
      await getLibrary().deleteLibraryEntry(libraryEntry.id)
      setLibraryEntry(null)
    } finally {
      setIsUpdatingLibrary(false)
    }
  }

  const handleToggleCollection = async (collection: UserCollectionResponse) => {
    if (!title?.id || !collection.id) {
      return
    }

    setPendingCollectionId(collection.id)

    try {
      const hasTitle = (collection.titleIds || []).includes(title.id)

      if (hasTitle) {
        await getCollections().removeTitleFromCollection(collection.id, title.id)
      } else {
        await getCollections().addTitleToCollection(collection.id, title.id)
      }

      await refreshCollections()
    } finally {
      setPendingCollectionId(null)
    }
  }

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim()

    if (!name || !isAuthenticated) {
      return
    }

    setIsCreatingCollection(true)

    try {
      const titleIds = title?.id ? [title.id] : []

      await getCollections().createCollection({
        name,
        isPublic: isNewCollectionPublic,
        titleIds,
      })

      setNewCollectionName("")
      setIsNewCollectionPublic(false)
      await refreshCollections()
    } finally {
      setIsCreatingCollection(false)
    }
  }

  const handleContinueReading = () => {
    if (nextUnreadChapterId) {
      router.push(`/chapters/${nextUnreadChapterId}`)
      return
    }

    const firstChapterId = chapters[0]?.id

    if (firstChapterId) {
      router.push(`/chapters/${firstChapterId}`)
    }
  }

  const handleMarkChapterRead = async (chapterId: string) => {
    if (!isAuthenticated) {
      return
    }

    setPendingChapterId(chapterId)

    try {
      const response = await getChapters().recordChapterRead(chapterId, {
        readTimeMillis: 0,
      })

      setReadStatusMap((prev) => ({ ...prev, [chapterId]: true }))

      if (response?.chapterId) {
        setNextUnreadChapterId(response.chapterId)
      }

      await upsertLibraryEntry({ lastReadChapterId: chapterId, status: "READING" })
    } finally {
      setPendingChapterId(null)
    }
  }

  if (isPageLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        <p className="text-sm text-muted-foreground">Загрузка страницы тайтла...</p>
      </div>
    )
  }

  if (!title || errorText) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Тайтл не найден</h1>
        <p className="text-sm text-muted-foreground">
          {errorText || "Не удалось загрузить информацию о тайтле"}
        </p>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/">На главную</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/catalog">В каталог</Link>
          </Button>
        </div>
      </div>
    )
  }

  const typeLabel = title.type ? TITLE_TYPE_LABELS[title.type] || title.type : "Тип не указан"
  const contentRatingLabel = title.contentRating
    ? CONTENT_RATING_LABELS[title.contentRating] || title.contentRating
    : "Не указан"
  const chapterItems = toArray(chapters)
  const statusValues = Object.values(LibraryEntryUpdateRequestStatus)
  const voteValues = Object.values(LibraryEntryUpdateRequestVote)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-6">
      <section className="grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="relative aspect-2/3">
            <MediaImage
              mediaId={title.mainCoverMediaId}
              alt={toTitleLabel(title)}
              fill
              className="object-cover"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {toTitleLabel(title)}
            </h1>
            <p className="text-sm text-muted-foreground">
              /{title.slug || "no-slug"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{typeLabel}</Badge>
            <Badge variant="secondary">{contentRatingLabel}</Badge>
            {title.titleStatus ? (
              <Badge variant="outline">{title.titleStatus}</Badge>
            ) : null}
            {title.releaseYear ? (
              <Badge variant="outline">{title.releaseYear}</Badge>
            ) : null}
            {title.countryIsoCode ? (
              <Badge variant="outline">{title.countryIsoCode}</Badge>
            ) : null}
          </div>

          {title.description ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {title.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Описание отсутствует
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleContinueReading}
              disabled={chapterItems.length === 0}
            >
              Открыть главу
            </Button>
            {isAuthenticated ? null : (
              <Button asChild variant="outline">
                <Link href={loginHref}>Войти для действий</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">Аналитика</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Средняя оценка</p>
            <p className="text-xl font-semibold">
              {analytics?.averageRating ?? "-"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Просмотры</p>
            <p className="text-xl font-semibold">
              {analytics?.totalViews ?? "-"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              Последнее обновление
            </p>
            <p className="text-sm font-medium">
              {analytics?.lastUpdated
                ? new Date(analytics.lastUpdated).toLocaleString("ru-RU")
                : "-"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">Действия с тайтлом</h2>

        {isAuthenticated ? (
          <div className="mt-4 space-y-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Библиотека и реакция</h3>

              <div className="flex flex-wrap gap-2">
                {voteValues.map((vote) => {
                  const isActive = libraryEntry?.vote === vote

                  return (
                    <Button
                      key={vote}
                      type="button"
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      disabled={isUpdatingLibrary}
                      onClick={() => {
                        void upsertLibraryEntry({ vote })
                      }}
                    >
                      {VOTE_LABELS[vote] || vote}
                    </Button>
                  )
                })}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isUpdatingLibrary}
                  onClick={() => {
                    void deleteLibraryEntry()
                  }}
                >
                  Удалить из библиотеки
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="library-status"
                  className="text-sm text-muted-foreground"
                >
                  Статус:
                </label>
                <select
                  id="library-status"
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={libraryEntry?.status || ""}
                  onChange={(event) => {
                    const value = event.target.value

                    if (!value) {
                      return
                    }

                    void upsertLibraryEntry({
                      status: value as LibraryEntryResponseStatus,
                    })
                  }}
                  disabled={isUpdatingLibrary}
                >
                  <option value="">Выберите статус</option>
                  {statusValues.map((status) => (
                    <option key={status} value={status}>
                      {LIBRARY_STATUS_LABELS[status] || status}
                    </option>
                  ))}
                </select>

                {libraryEntry?.status ? (
                  <Badge variant="outline">
                    {LIBRARY_STATUS_LABELS[libraryEntry.status] ||
                      libraryEntry.status}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Коллекции</h3>

              <div className="grid gap-2 sm:grid-cols-2">
                {collections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    У вас пока нет коллекций
                  </p>
                ) : (
                  collections.map((collection, index) => {
                    const collectionId = collection.id || ""
                    const hasTitle =
                      Boolean(title.id) &&
                      (collection.titleIds || []).includes(title.id || "")

                    return (
                      <div
                        key={collectionId || `${collection.name || "collection"}-${index}`}
                        className="rounded-lg border p-3"
                      >
                        <p className="text-sm font-medium">
                          {collection.name || "Без названия"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {collection.description || "Без описания"}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant={hasTitle ? "default" : "outline"}
                          className="mt-3"
                          disabled={
                            !collectionId ||
                            pendingCollectionId === collectionId
                          }
                          onClick={() => {
                            void handleToggleCollection(collection)
                          }}
                        >
                          {hasTitle
                            ? "Убрать из коллекции"
                            : "Добавить в коллекцию"}
                        </Button>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <input
                  value={newCollectionName}
                  onChange={(event) => {
                    setNewCollectionName(event.target.value)
                  }}
                  placeholder="Новая коллекция"
                  className="h-8 min-w-48 rounded-md border bg-background px-2 text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isNewCollectionPublic}
                    onChange={(event) => {
                      setIsNewCollectionPublic(event.target.checked)
                    }}
                  />
                  Публичная
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={isCreatingCollection || !newCollectionName.trim()}
                  onClick={() => {
                    void handleCreateCollection()
                  }}
                >
                  Создать и добавить тайтл
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isCollectionsLoading}
                  onClick={() => {
                    void refreshCollections()
                  }}
                >
                  Обновить список коллекций
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Для лайка, дизлайка, обновления статуса и коллекций нужно
            авторизоваться.
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Главы</h2>
          {isReadStatusLoading ? (
            <p className="text-xs text-muted-foreground">
              Обновляем статусы прочтения...
            </p>
          ) : null}
        </div>

        {chapterItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            У этого тайтла пока нет глав
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {chapterItems.map((chapter, index) => {
              const chapterId = chapter.id || ""
              const isRead = chapterId ? readStatusMap[chapterId] : false

              return (
                <article
                  key={
                    chapterId ||
                    `${chapter.displayNumber || "chapter"}-${index}`
                  }
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Глава {chapter.displayNumber || index + 1}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {chapter.name || "Без названия"}
                      {typeof chapter.volume === "number"
                        ? ` - Том ${chapter.volume}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {chapterId ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/chapters/${chapterId}`}>Открыть</Link>
                      </Button>
                    ) : null}

                    {isAuthenticated && chapterId ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={isRead ? "secondary" : "default"}
                        disabled={pendingChapterId === chapterId}
                        onClick={() => {
                          void handleMarkChapterRead(chapterId)
                        }}
                      >
                        {isRead ? "Прочитано" : "Отметить прочитанной"}
                      </Button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}


