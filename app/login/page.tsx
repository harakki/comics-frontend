"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { hasAuthToken, initKeycloak, startLogin } from "@/lib/axios-instance"

const resolveReturnTo = (value: string | null) => {
  if (!value) {
    return "/"
  }

  try {
    const resolved = new URL(value, globalThis.window.location.origin)

    if (resolved.origin !== globalThis.window.location.origin) {
      return "/"
    }

    const nextPath = `${resolved.pathname}${resolved.search}${resolved.hash}`

    if (!nextPath || nextPath.startsWith("/login")) {
      return "/"
    }

    return nextPath
  } catch {
    return "/"
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [returnTo, setReturnTo] = useState("/")

  useEffect(() => {
    let isMounted = true

    const openLogin = async () => {
      const nextReturnTo = resolveReturnTo(
        new URLSearchParams(globalThis.window.location.search).get("returnTo")
      )

      if (!isMounted) {
        return
      }

      setReturnTo(nextReturnTo)

      try {
        const authenticated = await initKeycloak().catch(() => false)

        if (!isMounted) {
          return
        }

        if (authenticated || hasAuthToken()) {
          router.replace(nextReturnTo)
          return
        }

        await startLogin(nextReturnTo)
      } catch {
        if (!isMounted) {
          return
        }

        setError("Не удалось открыть страницу входа. Попробуйте ещё раз.")
      }
    }

    void openLogin()

    return () => {
      isMounted = false
    }
  }, [router])

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Вход в сервис</h1>
      <p className="text-sm text-muted-foreground">
        {error || "Перенаправляем на страницу авторизации..."}
      </p>

      {error ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            onClick={() => {
              setError(null)
              startLogin(returnTo).catch(() => {
                setError("Не удалось открыть страницу входа. Попробуйте ещё раз.")
              })
            }}
          >
            Повторить вход
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              router.push("/")
            }}
          >
            На главную
          </Button>
        </div>
      ) : null}
    </div>
  )
}



