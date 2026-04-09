"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TitleCardRow } from "@/components/title-card-row"
import type { TitleCardProps } from "@/components/title-card"
import {
  type AuthTokenClaims,
  buildLoginHref,
  getAuthTokenClaims,
  hasAuthToken,
  initKeycloak,
  startLogout,
} from "@/lib/axios-instance"
import { getCollections } from "@/lib/api/collections/collections"
import { getLibrary } from "@/lib/api/library/library"
import { getRecommendations } from "@/lib/api/recommendations/recommendations"
import { getTitles } from "@/lib/api/titles/titles"
import type {
  LibraryEntryResponse,
  PersonalRecommendationResponse,
  TitleResponse,
  UserCollectionResponse,
} from "@/lib/api/api.schemas"

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

const USER_ROLE_LABELS: Record<string, string> = {
  admin: "Админ",
  user: "Пользователь",
  moderator: "Модератор",
}

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

type ProfileData = {
  claims: AuthTokenClaims | null
  recentLibraryTitles: TitleCardProps[]
  recentLibraryEntries: LibraryEntryResponse[]
  collections: UserCollectionResponse[]
  recommendations: TitleCardProps[]
}

const getDisplayName = (claims: AuthTokenClaims | null) => {
  if (!claims) {
    return "Пользователь"
  }

  const names = [
    claims.name,
    [claims.given_name, claims.family_name].filter(Boolean).join(" ").trim(),
    claims.preferred_username,
    claims.email,
    claims.sub,
  ].filter((value): value is string => Boolean(value && value.trim()))

  return names[0] || "Пользователь"
}

const getRoleLabels = (claims: AuthTokenClaims | null) => {
  const roles = claims?.realm_access?.roles || []

  return roles.length > 0
    ? roles.map((role) => USER_ROLE_LABELS[role] || role)
    : ["Роли не указаны"]
}

const normalizeCollectionsPayload = (
  payload: unknown
): UserCollectionResponse[] => {
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

export default function ProfilePage() {
  const loginHref = buildLoginHref("/profile")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [data, setData] = useState<ProfileData>({
    claims: null,
    recentLibraryTitles: [],
    recentLibraryEntries: [],
    collections: [],
    recommendations: [],
  })

  const displayName = useMemo(() => getDisplayName(data.claims), [data.claims])
  const roleLabels = useMemo(() => getRoleLabels(data.claims), [data.claims])

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
    if (!isAuthenticated) {
      setIsLoading(false)
      setData({
        claims: null,
        recentLibraryTitles: [],
        recentLibraryEntries: [],
        collections: [],
        recommendations: [],
      })
      return
    }

    let isMounted = true

    const loadProfile = async () => {
      setIsLoading(true)
      setErrorText(null)

      try {
        const claims = getAuthTokenClaims()

        const [libraryResponse, collectionsResponse, recommendationsResponse] =
          await Promise.all([
            getLibrary()
              .getMyLibrary({ page: 0, size: 6, sort: ["updatedAt,DESC"] })
              .catch(() => null),
            getCollections()
              .getMyCollections({ page: 0, size: 6, sort: ["updatedAt,DESC"] })
              .catch(() => null),
            getRecommendations()
              .getMyRecommendations({ limit: 6 })
              .catch(() => null),
          ])

        const recentLibraryEntries = (libraryResponse?.content || [])
          .filter((entry): entry is LibraryEntryResponse => Boolean(entry))
          .slice(0, 6)

        const titleCards = await Promise.all(
          recentLibraryEntries.map(async (entry) => {
            if (!entry.titleId) {
              return null
            }

            const title = await getTitles().getTitle(entry.titleId).catch(() => null)
            return title ? mapTitleToCard(title) : { id: entry.titleId, name: entry.titleId }
          })
        )

        if (!isMounted) {
          return
        }

        setData({
          claims,
          recentLibraryTitles: titleCards.filter((item): item is TitleCardProps => Boolean(item)),
          recentLibraryEntries,
          collections: normalizeCollectionsPayload(collectionsResponse),
          recommendations: (recommendationsResponse || []).map(mapRecommendationToCard),
        })
      } catch {
        if (!isMounted) {
          return
        }

        setErrorText("Не удалось загрузить данные профиля")
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      isMounted = false
    }
  }, [isAuthenticated])

  const handleLogout = async () => {
    await startLogout("/")
  }

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Профиль</h1>
        <p className="text-sm text-muted-foreground">
          Чтобы посмотреть профиль, нужно войти в аккаунт.
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
        <p className="text-sm text-muted-foreground">Загрузка профиля...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Личный кабинет</p>
            <h1 className="text-3xl font-semibold tracking-tight">{displayName}</h1>
            <div className="flex flex-wrap gap-2">
              {roleLabels.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/catalog">В каталог</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => {
              void handleLogout()
            }}>
              Выйти
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="break-all text-sm font-medium">
              {data.claims?.email || "Не указан"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.claims?.email_verified ? "Подтвержден" : "Не подтвержден"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Username</p>
            <p className="break-all text-sm font-medium">
              {data.claims?.preferred_username || data.claims?.sub || "Не указан"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">User ID</p>
            <p className="break-all text-sm font-medium">
              {data.claims?.sub || "Не указан"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Статус</p>
            <p className="text-sm font-medium text-emerald-600">Аккаунт активен</p>
          </div>
        </div>

        {errorText ? (
          <p className="mt-4 text-sm text-destructive">{errorText}</p>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Коллекции</p>
          <p className="text-2xl font-semibold">
            {data.collections.length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Тайтлы в библиотеке</p>
          <p className="text-2xl font-semibold">
            {data.recentLibraryEntries.length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Рекомендации</p>
          <p className="text-2xl font-semibold">
            {data.recommendations.length}
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Моя библиотека</h2>
          <p className="text-xs text-muted-foreground">Последние изменения</p>
        </div>

        <TitleCardRow
          items={data.recentLibraryTitles}
          isLoading={isRefreshing}
          emptyText="В библиотеке пока нет тайтлов"
          skeletonCount={4}
        />

        {data.recentLibraryEntries.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.recentLibraryEntries.map((entry) => (
              <div key={entry.id || entry.titleId} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {entry.titleId || "Без тайтла"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Статус: {entry.status ? LIBRARY_STATUS_LABELS[entry.status] || entry.status : "Не указан"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Реакция: {entry.vote ? VOTE_LABELS[entry.vote] || entry.vote : "Не указана"}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">Мои коллекции</h2>

        {data.collections.length === 0 ? (
          <p className="text-sm text-muted-foreground">У вас пока нет коллекций</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.collections.map((collection) => (
              <article key={collection.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{collection.name || "Без названия"}</p>
                    <p className="text-xs text-muted-foreground">
                      {collection.description || "Без описания"}
                    </p>
                  </div>
                  <Badge variant={collection.isPublic ? "default" : "outline"}>
                    {collection.isPublic ? "Публичная" : "Приватная"}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Тайтлов: {collection.titleIds?.length || 0}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Рекомендации</h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/">На главную</Link>
          </Button>
        </div>

        <TitleCardRow
          items={data.recommendations}
          isLoading={false}
          emptyText="Рекомендаций пока нет"
          skeletonCount={6}
        />
      </section>
    </div>
  )
}


