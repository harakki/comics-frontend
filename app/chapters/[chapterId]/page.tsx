"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { buildLoginHref, hasAuthToken, initKeycloak } from "@/lib/axios-instance"
import { getChapters } from "@/lib/api/chapters/chapters"
import type { ChapterDetailsResponse } from "@/lib/api/api.schemas"

export default function ChapterPage() {
  const params = useParams<{ chapterId: string | string[] }>()
  const router = useRouter()

  const chapterId = useMemo(() => {
    const value = params?.chapterId
    return Array.isArray(value) ? value[0] || "" : value || ""
  }, [params?.chapterId])

  const [chapter, setChapter] = useState<ChapterDetailsResponse | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRead, setIsRead] = useState(false)
  const [isUpdatingRead, setIsUpdatingRead] = useState(false)
  const [nextUnreadChapterId, setNextUnreadChapterId] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)

  const loginHref = buildLoginHref(`/chapters/${chapterId}`)

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
    if (!chapterId) {
      setErrorText("Не удалось определить главу")
      setIsLoading(false)
      return
    }

    let isMounted = true

    const loadChapter = async () => {
      setIsLoading(true)
      setErrorText(null)
      setIsRead(false)
      setNextUnreadChapterId(null)

      try {
        const details = await getChapters().getFullChapter(chapterId)

        if (!isMounted) {
          return
        }

        setChapter(details)

        if (!isAuthenticated) {
          return
        }

        const readStatus = await getChapters().isChapterRead(chapterId).catch(() => null)

        if (!isMounted) {
          return
        }

        setIsRead(Boolean(readStatus?.isRead))
      } catch {
        if (!isMounted) {
          return
        }

        setChapter(null)
        setErrorText("Глава не найдена")
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadChapter()

    return () => {
      isMounted = false
    }
  }, [chapterId, isAuthenticated])

  const handleMarkRead = async () => {
    if (!isAuthenticated || !chapterId) {
      return
    }

    setIsUpdatingRead(true)

    try {
      const response = await getChapters().recordChapterRead(chapterId, {
        readTimeMillis: 0,
      })

      setIsRead(true)
      setNextUnreadChapterId(response?.chapterId || null)
    } finally {
      setIsUpdatingRead(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl p-6">
        <p className="text-sm text-muted-foreground">Загрузка главы...</p>
      </div>
    )
  }

  if (!chapter || errorText) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Глава не найдена</h1>
        <p className="text-sm text-muted-foreground">
          {errorText || "Не удалось загрузить главу"}
        </p>
        <Button asChild>
          <Link href="/">На главную</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">
          Глава {chapter.displayNumber || "?"}
          {chapter.name ? `: ${chapter.name}` : ""}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          {chapter.titleId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/titles/${chapter.titleId}`}>К тайтлу</Link>
            </Button>
          ) : null}

          {chapter.prevChapterId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/chapters/${chapter.prevChapterId}`}>
                Предыдущая
              </Link>
            </Button>
          ) : null}

          {chapter.nextChapterId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/chapters/${chapter.nextChapterId}`}>Следующая</Link>
            </Button>
          ) : null}

          {isAuthenticated ? (
            <Button
              type="button"
              size="sm"
              disabled={isUpdatingRead}
              onClick={() => {
                void handleMarkRead()
              }}
            >
              {isRead ? "Прочитано" : "Отметить прочитанной"}
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href={loginHref}>Войти для отметки прочтения</Link>
            </Button>
          )}

          {nextUnreadChapterId ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                router.push(`/chapters/${nextUnreadChapterId}`)
              }}
            >
              Открыть следующую непрочитанную
            </Button>
          ) : null}
        </div>
      </header>

      <section className="space-y-4">
        {chapter.pages && chapter.pages.length > 0 ? (
          chapter.pages.map((page, index) => (
            <article
              key={page.id || page.mediaId || `${page.pageOrder || index}`}
              className="overflow-hidden rounded-lg border bg-card"
            >
              <div className="border-b px-3 py-2 text-xs text-muted-foreground">
                Страница {page.pageOrder || index + 1}
              </div>
              {page.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={page.url}
                  alt={`Страница ${page.pageOrder || index + 1}`}
                  className="w-full"
                  loading="lazy"
                />
              ) : (
                <div className="p-4 text-sm text-muted-foreground">
                  URL страницы отсутствует
                </div>
              )}
            </article>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            У этой главы пока нет страниц
          </p>
        )}
      </section>
    </div>
  )
}

