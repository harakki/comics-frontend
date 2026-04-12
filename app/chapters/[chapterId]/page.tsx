"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { getChapters } from "@/lib/api/chapters/chapters"
import type { ChapterDetailsResponse } from "@/lib/api/api.schemas"

export default function ChapterPage() {
  const params = useParams<{ chapterId: string | string[] }>()

  const chapterId = useMemo(() => {
    const value = params?.chapterId
    return Array.isArray(value) ? value[0] || "" : value || ""
  }, [params?.chapterId])

  const [chapter, setChapter] = useState<ChapterDetailsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorText, setErrorText] = useState<string | null>(null)

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

      try {
        const details = await getChapters().getFullChapter(chapterId)

        if (!isMounted) {
          return
        }

        setChapter(details)
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
  }, [chapterId])

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
    <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">
          Глава {chapter.displayNumber || "?"}
          {chapter.name ? `: ${chapter.name}` : ""}
        </h1>
      </header>

      <section className="space-y-4">
        {chapter.pages && chapter.pages.length > 0 ? (
          chapter.pages.map((page, index) => (
            <article
              key={page.id || page.mediaId || `${page.pageOrder || index}`}
              className="overflow-hidden border bg-card"
            >
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

      <nav className="sticky bottom-3 z-20 -mx-1 grid grid-cols-3 items-center gap-2 border bg-background/95 px-1 py-2 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80">
        {chapter.prevChapterId ? (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link
              href={`/chapters/${chapter.prevChapterId}`}
              className="flex items-center justify-center gap-2"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} className="size-4" />
              <span>Назад</span>
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full" disabled>
            <span className="flex items-center justify-center gap-2">
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} className="size-4" />
              <span>Назад</span>
            </span>
          </Button>
        )}

        {chapter.titleId ? (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href={`/titles/${chapter.titleId}`}>К тайтлу</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full" disabled>
            К тайтлу
          </Button>
        )}

        {chapter.nextChapterId ? (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link
              href={`/chapters/${chapter.nextChapterId}`}
              className="flex items-center justify-center gap-2"
            >
              <span>Вперед</span>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} className="size-4" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full" disabled>
            <span className="flex items-center justify-center gap-2">
              <span>Вперед</span>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} className="size-4" />
            </span>
          </Button>
        )}
      </nav>
    </div>
  )
}

