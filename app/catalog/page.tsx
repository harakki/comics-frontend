import { Suspense } from "react"
import { CatalogContent } from "./catalog-content"

export default function CatalogPage() {
  return (
    <Suspense>
      <CatalogContent />
    </Suspense>
  )
}
