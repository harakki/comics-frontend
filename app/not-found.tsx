import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">Ошибка 404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Страница не найдена</h1>
      <p className="text-sm text-muted-foreground">
        Возможно, ссылка устарела или адрес введен с ошибкой.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/">На главную</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/catalog">Открыть каталог</Link>
        </Button>
      </div>
    </div>
  )
}

