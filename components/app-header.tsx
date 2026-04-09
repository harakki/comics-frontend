"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { buildLoginHref, hasAuthToken, initKeycloak } from "@/lib/axios-instance"
import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  label: string
}

const primaryNavItems: NavItem[] = [
  { href: "/catalog", label: "Каталог" },
  { href: "/library", label: "Библиотека" },
  { href: "/collections", label: "Коллекции" },
  { href: "/search", label: "Поиск" },
]

const navLinkClassName =
  "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"

export function AppHeader() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const syncAuthState = async () => {
      const authenticated = await initKeycloak().catch(() => false)
      setIsAuthenticated(authenticated || hasAuthToken())
    }

    void syncAuthState()

    const syncFromStorage = () => {
      setIsAuthenticated(hasAuthToken())
    }

    globalThis.addEventListener("storage", syncFromStorage)

    return () => {
      globalThis.removeEventListener("storage", syncFromStorage)
    }
  }, [])

  const isProfileActive =
    pathname === "/profile" || pathname.startsWith("/profile/")
  const currentPath = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname
  const loginHref = buildLoginHref(currentPath)
  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          MangaDex
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {primaryNavItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  navLinkClassName,
                  isActive && "bg-accent text-foreground"
                )}
              >
                {item.label}
              </Link>
            )
          })}

          {isAuthenticated ? (
            <Link
              href="/profile"
              className={cn(
                navLinkClassName,
                isProfileActive && "bg-accent text-foreground"
              )}
            >
              Профиль
            </Link>
          ) : (
            <Button asChild size="sm">
              <Link href={loginHref}>Войти</Link>
            </Button>
          )}
        </nav>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="md:hidden"
          aria-label={isMobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-header-menu"
          onClick={() => {
            setIsMobileMenuOpen((prev) => !prev)
          }}
        >
          Меню
        </Button>
      </div>

      {isMobileMenuOpen && (
        <div id="mobile-header-menu" className="border-t px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {primaryNavItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobileMenu}
                  className={cn(
                    navLinkClassName,
                    isActive && "bg-accent text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              )
            })}

            {isAuthenticated ? (
              <Link
                href="/profile"
                onClick={closeMobileMenu}
                className={cn(
                  navLinkClassName,
                  isProfileActive && "bg-accent text-foreground"
                )}
              >
                Профиль
              </Link>
            ) : (
              <Button asChild size="sm" className="mt-2 w-full">
                <Link href={loginHref} onClick={closeMobileMenu}>
                  Войти
                </Link>
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
