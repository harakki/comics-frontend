import type { TitleCardProps } from "@/components/title-card"
import type {
  LibraryEntryResponse,
  LibraryEntryResponseStatus,
  PageMetadata,
  TitleResponse,
  UserCollectionResponse,
} from "@/lib/api/api.schemas"
import { getCollections } from "@/lib/api/collections/collections"
import { getLibrary } from "@/lib/api/library/library"
import { getTitles } from "@/lib/api/titles/titles"
import type { AuthTokenClaims } from "@/lib/axios-instance"

const USER_SPACE_PAGE_SIZE = 50

export const LIBRARY_STATUS_LABELS: Record<string, string> = {
  TO_READ: "Хочу прочитать",
  READING: "Читаю",
  ON_HOLD: "На паузе",
  DROPPED: "Брошено",
  COMPLETED: "Завершено",
  RE_READING: "Перечитываю",
}

export const LIBRARY_STATUS_ORDER = [
  "READING",
  "RE_READING",
  "TO_READ",
  "COMPLETED",
  "ON_HOLD",
  "DROPPED",
] satisfies LibraryEntryResponseStatus[]

const IGNORED_ROLE_NAMES = new Set([
  "default-roles-master",
  "offline_access",
  "uma_authorization",
])

type CollectionsPayload = {
  content?: UserCollectionResponse[]
  page?: PageMetadata
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object"

const parseDateValue = (value?: string) => {
  if (!value) {
    return 0
  }

  const timestamp = Date.parse(value)

  return Number.isNaN(timestamp) ? 0 : timestamp
}

export const formatNumber = (value?: number | null) => {
  if (value == null || Number.isNaN(value)) {
    return "0"
  }

  return new Intl.NumberFormat("ru-RU").format(value)
}

export const formatDate = (value?: string | null) => {
  if (!value) {
    return "Нет данных"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Нет данных"
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
  }).format(date)
}

export const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "Нет данных"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Нет данных"
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export const getUserDisplayName = (claims: AuthTokenClaims | null) => {
  const fullName = [claims?.given_name, claims?.family_name]
    .filter(Boolean)
    .join(" ")
    .trim()

  return (
    fullName ||
    claims?.name ||
    claims?.preferred_username ||
    claims?.email ||
    "Читатель"
  )
}

export const getUserHandle = (claims: AuthTokenClaims | null) =>
  claims?.preferred_username || claims?.email || claims?.sub || "user"

export const getUserInitials = (claims: AuthTokenClaims | null) => {
  const label = getUserDisplayName(claims).trim()

  if (!label) {
    return "U"
  }

  const parts = label.split(/\s+/).filter(Boolean)

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}

export const getUserRoles = (claims: AuthTokenClaims | null) =>
  [...new Set(claims?.realm_access?.roles || [])].filter(
    (role) => !IGNORED_ROLE_NAMES.has(role)
  )

export const mapTitleToCard = (title: TitleResponse): TitleCardProps => ({
  id: title.id,
  titleId: title.id,
  name: title.name,
  slug: title.slug,
  mainCoverMediaId: title.mainCoverMediaId,
  type: title.type,
  contentRating: title.contentRating,
})

export const sortLibraryEntriesByUpdatedAt = (
  left: LibraryEntryResponse,
  right: LibraryEntryResponse
) => parseDateValue(right.updatedAt) - parseDateValue(left.updatedAt)

export const getLibraryStatusCountMap = (entries: LibraryEntryResponse[]) => {
  const counts = Object.fromEntries(
    LIBRARY_STATUS_ORDER.map((status) => [status, 0])
  ) as Record<LibraryEntryResponseStatus, number>

  entries.forEach((entry) => {
    if (!entry.status) {
      return
    }

    counts[entry.status] = (counts[entry.status] || 0) + 1
  })

  return counts
}

export const buildCollectionPreviewIds = (
  collections: UserCollectionResponse[],
  limitPerCollection = 3
) =>
  collections.flatMap((collection) =>
    (collection.titleIds || []).slice(0, limitPerCollection)
  )

export const getCollectionTitleCount = (collection: UserCollectionResponse) =>
  collection.titleIds?.length || 0

export const normalizeCollectionsPayload = (
  payload: unknown
): {
  items: UserCollectionResponse[]
  page?: PageMetadata
} => {
  if (Array.isArray(payload)) {
    return {
      items: payload.filter(isRecord) as UserCollectionResponse[],
    }
  }

  if (!isRecord(payload)) {
    return { items: [] }
  }

  const collectionsPayload = payload as CollectionsPayload

  if (Array.isArray(collectionsPayload.content)) {
    return {
      items: collectionsPayload.content.filter(
        (item): item is UserCollectionResponse => isRecord(item)
      ),
      page: collectionsPayload.page,
    }
  }

  if ("id" in payload || "name" in payload || "titleIds" in payload) {
    return {
      items: [payload as UserCollectionResponse],
    }
  }

  return { items: [] }
}

export const fetchTitleMap = async (titleIds: string[]) => {
  const uniqueTitleIds = [...new Set(titleIds.filter(Boolean))]

  if (uniqueTitleIds.length === 0) {
    return new Map<string, TitleResponse>()
  }

  const responses = await Promise.all(
    uniqueTitleIds.map(async (titleId) => {
      const title = await getTitles()
        .getTitle(titleId)
        .catch(() => null)

      return title ? ([titleId, title] as const) : null
    })
  )

  return new Map(
    responses.filter(
      (entry): entry is readonly [string, TitleResponse] => entry !== null
    )
  )
}

export const fetchAllLibraryEntries = async () => {
  const firstPage = await getLibrary().getMyLibrary({
    page: 0,
    size: USER_SPACE_PAGE_SIZE,
    sort: ["updatedAt,DESC"],
  })

  const firstItems = firstPage.content || []
  const totalPages = firstPage.page?.totalPages || 1

  if (totalPages <= 1) {
    return {
      items: firstItems,
      page: firstPage.page,
    }
  }

  const restPages = await Promise.allSettled(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      getLibrary().getMyLibrary({
        page: index + 1,
        size: USER_SPACE_PAGE_SIZE,
        sort: ["updatedAt,DESC"],
      })
    )
  )

  const additionalItems = restPages.flatMap((result) =>
    result.status === "fulfilled" ? result.value.content || [] : []
  )

  return {
    items: [...firstItems, ...additionalItems],
    page: firstPage.page,
  }
}

export const fetchAllCollections = async () => {
  const firstPayload = await getCollections().getMyCollections({
    page: 0,
    size: USER_SPACE_PAGE_SIZE,
    sort: ["updatedAt,DESC"],
  })

  const firstPage = normalizeCollectionsPayload(firstPayload)
  const totalPages = firstPage.page?.totalPages || 1

  if (totalPages <= 1) {
    return firstPage
  }

  const restPages = await Promise.allSettled(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      getCollections().getMyCollections({
        page: index + 1,
        size: USER_SPACE_PAGE_SIZE,
        sort: ["updatedAt,DESC"],
      })
    )
  )

  const additionalItems = restPages.flatMap((result) =>
    result.status === "fulfilled"
      ? normalizeCollectionsPayload(result.value).items
      : []
  )

  return {
    items: [...firstPage.items, ...additionalItems],
    page: firstPage.page,
  }
}
