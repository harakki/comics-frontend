"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  Link01Icon,
  LockIcon,
  PencilEdit02Icon,
  Tag01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { TitleCardGrid } from "@/components/title-card-grid"
import { EmptyStateCard, UserSpacePage } from "@/components/user-space"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import type { TitleResponse, UserCollectionResponse } from "@/lib/api/api.schemas"
import { getCollections } from "@/lib/api/collections/collections"
import { getTitles } from "@/lib/api/titles/titles"
import {
  getAuthTokenClaims,
  hasAuthToken,
  initKeycloak,
  type AuthTokenClaims,
} from "@/lib/axios-instance"
import { fetchTitleMap, formatDateTime, mapTitleToCard } from "@/lib/user-space"

const normalizeCollectionParam = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] || ""
  }

  return value || ""
}

function CollectionPageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-56 rounded-[1.75rem]" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[36rem] rounded-[1.75rem]" />
        <div className="space-y-6">
          <Skeleton className="h-72 rounded-[1.75rem]" />
          <Skeleton className="h-96 rounded-[1.75rem]" />
        </div>
      </div>
    </div>
  )
}

export default function CollectionDetailsPage() {
  const params = useParams<{ collectionParam: string | string[] }>()
  const collectionParam = normalizeCollectionParam(params?.collectionParam)
  const router = useRouter()

  const [claims, setClaims] = useState<AuthTokenClaims | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [collection, setCollection] = useState<UserCollectionResponse | null>(null)
  const [titleMap, setTitleMap] = useState<Map<string, TitleResponse>>(new Map())
  const [errorText, setErrorText] = useState<string | null>(null)
  const [noticeText, setNoticeText] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isPublic, setIsPublic] = useState(false)

  const [titleSearch, setTitleSearch] = useState("")
  const [isSearchingTitles, setIsSearchingTitles] = useState(false)
  const [titleSearchResults, setTitleSearchResults] = useState<TitleResponse[]>([])
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!collectionParam) {
      return
    }

    let isMounted = true

    const loadCollectionPage = async () => {
      setIsLoading(true)
      setErrorText(null)
      setNoticeText(null)

      const authenticated = await initKeycloak().catch(() => false)
      const hasSession = authenticated || hasAuthToken()
      const nextClaims = getAuthTokenClaims()

      if (!isMounted) {
        return
      }

      setIsAuthenticated(hasSession)
      setClaims(nextClaims)

      const loadedCollection = await getCollections()
        .getCollection(collectionParam)
        .catch(() => null)

      if (!isMounted) {
        return
      }

      if (!loadedCollection) {
        setCollection(null)
        setErrorText("Коллекция не найдена или недоступна")
        setIsLoading(false)
        return
      }

      const isOwner = Boolean(
        hasSession && nextClaims?.sub && loadedCollection.authorId === nextClaims.sub
      )

      if (!loadedCollection.isPublic && !isOwner) {
        setCollection(null)
        setErrorText("Эта коллекция приватная")
        setIsLoading(false)
        return
      }

      setCollection(loadedCollection)
      setName(loadedCollection.name || "")
      setDescription(loadedCollection.description || "")
      setIsPublic(Boolean(loadedCollection.isPublic))

      const nextTitleMap = await fetchTitleMap(loadedCollection.titleIds || [])

      if (!isMounted) {
        return
      }

      setTitleMap(nextTitleMap)
      setIsLoading(false)
    }

    void loadCollectionPage()

    return () => {
      isMounted = false
    }
  }, [collectionParam])

  const isOwner = useMemo(
    () => Boolean(collection?.authorId && claims?.sub && collection.authorId === claims.sub),
    [claims, collection]
  )

  const collectionTitles = useMemo(
    () =>
      (collection?.titleIds || [])
        .map((titleId) => titleMap.get(titleId))
        .filter((title): title is TitleResponse => Boolean(title)),
    [collection?.titleIds, titleMap]
  )

  const cardItems = useMemo(
    () => collectionTitles.map((title) => mapTitleToCard(title)),
    [collectionTitles]
  )

  const performTitleSearch = async () => {
    const search = titleSearch.trim()

    if (!search) {
      setTitleSearchResults([])
      return
    }

    setIsSearchingTitles(true)

    const response = await getTitles()
      .searchTitles({
        search,
        size: 8,
      })
      .catch(() => null)

    setTitleSearchResults(response?.content || [])
    setIsSearchingTitles(false)
  }

  const handleSaveCollection = async () => {
    if (!isOwner || !collection?.id || isSaving) {
      return
    }

    const nextName = name.trim()

    if (!nextName) {
      setNoticeText("Название коллекции не может быть пустым")
      return
    }

    setIsSaving(true)

    const updatedCollection = await getCollections()
      .updateCollection(collection.id, {
        name: nextName,
        description: description.trim() || undefined,
        isPublic,
      })
      .catch(() => null)

    if (!updatedCollection) {
      setNoticeText("Не удалось сохранить изменения")
      setIsSaving(false)
      return
    }

    setCollection(updatedCollection)
    setName(updatedCollection.name || "")
    setDescription(updatedCollection.description || "")
    setIsPublic(Boolean(updatedCollection.isPublic))
    setNoticeText("Изменения сохранены")
    setIsSaving(false)
  }

  const handleAddTitle = async (title: TitleResponse) => {
    if (!isOwner || !collection?.id || !title.id || isSaving) {
      return
    }

    if ((collection.titleIds || []).includes(title.id)) {
      setNoticeText("Этот тайтл уже есть в коллекции")
      return
    }

    setIsSaving(true)

    const updatedCollection = await getCollections()
      .addTitleToCollection(collection.id, title.id)
      .catch(() => null)

    if (!updatedCollection) {
      setNoticeText("Не удалось добавить тайтл")
      setIsSaving(false)
      return
    }

    setCollection(updatedCollection)
    setTitleMap((prev) => {
      const nextMap = new Map(prev)
      nextMap.set(title.id!, title)
      return nextMap
    })
    setNoticeText(`Тайтл «${title.name || "без названия"}» добавлен`)
    setIsSaving(false)
  }

  const handleRemoveTitle = async (titleId: string) => {
    if (!isOwner || !collection?.id || isSaving) {
      return
    }

    setIsSaving(true)

    const updatedCollection = await getCollections()
      .removeTitleFromCollection(collection.id, titleId)
      .catch(() => null)

    if (!updatedCollection) {
      setNoticeText("Не удалось удалить тайтл")
      setIsSaving(false)
      return
    }

    setCollection(updatedCollection)
    setNoticeText("Тайтл удален из коллекции")
    setIsSaving(false)
  }

  const handleCopyPublicLink = async () => {
    if (!collection?.isPublic || !globalThis.window?.location) {
      return
    }

    await navigator.clipboard
      .writeText(globalThis.window.location.href)
      .then(() => setNoticeText("Ссылка скопирована"))
      .catch(() => setNoticeText("Не удалось скопировать ссылку"))
  }

  const handleDeleteCollection = async () => {
    if (!isOwner || !collection?.id || isDeleting) {
      return
    }

    setIsDeleting(true)

    const deleteResult = await getCollections()
      .deleteCollection(collection.id)
      .then(() => true)
      .catch(() => false)

    if (!deleteResult) {
      setNoticeText("Не удалось удалить коллекцию")
      setIsDeleting(false)
      return
    }

    setIsDeleteDialogOpen(false)
    router.replace("/collections")
  }

  if (isLoading) {
    return (
      <UserSpacePage>
        <CollectionPageSkeleton />
      </UserSpacePage>
    )
  }

  if (!collection || errorText) {
    return (
      <UserSpacePage>
        <Card className="border border-border/70 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle>Коллекция недоступна</CardTitle>
            <CardDescription>
              {errorText || "Не удалось загрузить коллекцию"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/collections">К коллекциям</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/catalog">Открыть каталог</Link>
            </Button>
          </CardContent>
        </Card>
      </UserSpacePage>
    )
  }

  return (
    <UserSpacePage>
      <section className="space-y-6">
        <Card className="border border-border/70 bg-card/90 shadow-sm">
          <CardHeader className="border-b border-border/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <CardTitle className="text-2xl">{collection.name || "Коллекция"}</CardTitle>
                <CardDescription>{collection.description || "Описание пока не добавлено."}</CardDescription>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={collection.isPublic ? "default" : "secondary"} className="rounded-full px-3 py-1">
                    {collection.isPublic ? "Публичная" : "Приватная"}
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {collection.titleIds?.length || 0} тайтлов
                  </Badge>
                  {isOwner ? (
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      Владелец
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/collections">Назад к списку</Link>
                </Button>
                {collection.isPublic ? (
                  <Button variant="outline" onClick={() => void handleCopyPublicLink()}>
                    <HugeiconsIcon icon={Link01Icon} strokeWidth={1.8} className="size-4" />
                    Копировать ссылку
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 pt-6 text-sm text-muted-foreground sm:grid-cols-3">
            <div>Создана: {formatDateTime(collection.createdAt)}</div>
            <div>Обновлена: {formatDateTime(collection.updatedAt)}</div>
            <div>{collection.isPublic ? "Коллекция доступна по ссылке" : "Коллекция доступна только владельцу"}</div>
          </CardContent>
        </Card>

        {noticeText ? (
          <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm">
            {noticeText}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon icon={ViewIcon} strokeWidth={1.8} className="size-5" />
                Тайтлы в коллекции
              </CardTitle>
              <CardDescription>
                Открывайте тайтлы напрямую из коллекции. Публичную коллекцию может просматривать любой пользователь по ссылке.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              {cardItems.length > 0 ? (
                <TitleCardGrid items={cardItems} className="md:grid-cols-3 xl:grid-cols-3" />
              ) : (
                <EmptyStateCard
                  title="Коллекция пока пуста"
                  description="Добавьте тайтлы из страницы тайтла или через поиск справа."
                  actionHref="/catalog"
                  actionLabel="Перейти в каталог"
                />
              )}

              {isOwner && collectionTitles.length > 0 ? (
                <div className="space-y-2">
                  {collectionTitles.map((title) => (
                    <div
                      key={title.id || title.slug || title.name}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 p-3"
                    >
                      <Link
                        href={`/titles/${title.slug || title.id}`}
                        className="min-w-0 truncate text-sm font-medium hover:underline"
                      >
                        {title.name || "Без названия"}
                      </Link>
                      {title.id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleRemoveTitle(title.id!)}
                          disabled={isSaving}
                        >
                          Удалить
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {isOwner ? (
              <Card className="border border-border/70 bg-card/90 shadow-sm">
                <CardHeader className="border-b border-border/70">
                  <CardTitle className="flex items-center gap-2">
                    <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.8} className="size-5" />
                    Редактирование
                  </CardTitle>
                  <CardDescription>
                    Меняйте название, описание и приватность коллекции.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <Input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                    }}
                    placeholder="Название коллекции"
                  />

                  <Textarea
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value)
                    }}
                    placeholder="Описание коллекции"
                    rows={4}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={isPublic ? "default" : "outline"}
                      onClick={() => {
                        setIsPublic(true)
                      }}
                    >
                      <HugeiconsIcon icon={Tag01Icon} strokeWidth={1.8} className="size-4" />
                      Публичная
                    </Button>
                    <Button
                      variant={!isPublic ? "default" : "outline"}
                      onClick={() => {
                        setIsPublic(false)
                      }}
                    >
                      <HugeiconsIcon icon={LockIcon} strokeWidth={1.8} className="size-4" />
                      Приватная
                    </Button>
                  </div>

                  <Button onClick={() => void handleSaveCollection()} disabled={isSaving}>
                    Сохранить изменения
                  </Button>

                  <AlertDialog
                    open={isDeleteDialogOpen}
                    onOpenChange={setIsDeleteDialogOpen}
                  >
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={isDeleting || isSaving}>
                        Удалить коллекцию
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить коллекцию?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Это действие необратимо. Коллекция «{collection.name || "без названия"}» будет удалена вместе со списком тайтлов.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={(event) => {
                            event.preventDefault()
                            void handleDeleteCollection()
                          }}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Удаляем..." : "Удалить"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            ) : null}

            {isOwner ? (
              <Card className="border border-border/70 bg-card/90 shadow-sm">
                <CardHeader className="border-b border-border/70">
                  <CardTitle>Добавить тайтлы</CardTitle>
                  <CardDescription>
                    Найдите тайтл и добавьте его в текущую коллекцию.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex gap-2">
                    <Input
                      value={titleSearch}
                      onChange={(event) => {
                        setTitleSearch(event.target.value)
                      }}
                      placeholder="Название тайтла"
                    />
                    <Button
                      variant="outline"
                      onClick={() => void performTitleSearch()}
                      disabled={isSearchingTitles}
                    >
                      Найти
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {titleSearchResults.map((title) => {
                      const titleId = title.id || ""
                      const isAlreadyAdded = (collection.titleIds || []).includes(titleId)

                      return (
                        <div
                          key={title.id || title.slug || title.name}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 p-3"
                        >
                          <Link
                            href={`/titles/${title.slug || title.id}`}
                            className="min-w-0 truncate text-sm font-medium hover:underline"
                          >
                            {title.name || "Без названия"}
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!title.id || isAlreadyAdded || isSaving}
                            onClick={() => void handleAddTitle(title)}
                          >
                            {isAlreadyAdded ? "Уже в коллекции" : "Добавить"}
                          </Button>
                        </div>
                      )
                    })}

                    {titleSearch && titleSearchResults.length === 0 && !isSearchingTitles ? (
                      <p className="text-sm text-muted-foreground">По запросу ничего не найдено.</p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border border-border/70 bg-card/90 shadow-sm">
                <CardHeader>
                  <CardTitle>Режим просмотра</CardTitle>
                  <CardDescription>
                    Только владелец может редактировать состав и параметры коллекции.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {isAuthenticated
                    ? "Если это ваша коллекция, проверьте, что вы вошли под нужным аккаунтом."
                    : "Авторизуйтесь, чтобы управлять своими коллекциями."}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>
    </UserSpacePage>
  )
}


