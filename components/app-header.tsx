"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import {
  getAuthTokenClaims,
  buildLoginHref,
  hasAuthToken,
  initKeycloak,
  startLogout,
} from "@/lib/axios-instance"
import { hasAdminRole } from "@/lib/user-space"
import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  label: string
}

const primaryNavItems: NavItem[] = [
  { href: "/catalog", label: "Каталог" },
  { href: "/library", label: "Библиотека" },
  { href: "/collections", label: "Коллекции" },
]

const adminNavItem: NavItem = { href: "/admin", label: "Админ-панель" }

const navLinkClassName =
  "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [searchValue, setSearchValue] = useState(() => searchParams.get("q") || "")

  useEffect(() => {
    const syncAuthState = async () => {
      const authenticated = await initKeycloak().catch(() => false)
      const claims = getAuthTokenClaims()
      setIsAuthenticated(authenticated || hasAuthToken())
      setIsAdmin(hasAdminRole(claims))
    }

    void syncAuthState()

    const syncFromStorage = () => {
      setIsAuthenticated(hasAuthToken())
      setIsAdmin(hasAdminRole(getAuthTokenClaims()))
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
  const navItems = isAdmin ? [...primaryNavItems, adminNavItem] : primaryNavItems
  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  const handleSearchSubmit: NonNullable<ComponentProps<"form">["onSubmit"]> = (
    event
  ) => {
    event.preventDefault()

    const normalizedQuery = searchValue.trim().slice(0, 120)
    const params = new URLSearchParams()

    if (normalizedQuery) {
      params.set("q", normalizedQuery)
    }

    closeMobileMenu()
    router.push(params.toString() ? `/catalog?${params.toString()}` : "/catalog")
  }

  const handleLogout = async () => {
    closeMobileMenu()
    await startLogout("/")
  }

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          MangaDex
        </Link>

        <form onSubmit={handleSearchSubmit} className="hidden flex-1 items-center gap-2 md:flex">
          <input
            type="search"
            value={searchValue}
            onChange={(event) => {
              setSearchValue(event.target.value)
            }}
            placeholder="Найти тайтл"
            className="h-9 w-full max-w-xs rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="sm" variant="outline">
            Поиск
          </Button>
        </form>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
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
            <div className="flex items-center gap-1">
              <Link
                href="/profile"
                className={cn(
                  navLinkClassName,
                  isProfileActive && "bg-accent text-foreground"
                )}
              >
                Профиль
              </Link>
              <Button type="button" variant="outline" size="sm" onClick={() => {
                void handleLogout()
              }}>
                Выйти
              </Button>
            </div>
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
          <form onSubmit={handleSearchSubmit} className="mb-3 flex items-center gap-2">
            <input
              type="search"
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value)
              }}
              placeholder="Найти тайтл"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="sm" variant="outline">
              Поиск
            </Button>
          </form>

          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
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
              <>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => {
                    void handleLogout()
                  }}
                >
                  Выйти
                </Button>
              </>
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
