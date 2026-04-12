"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react"

import { BookOpen01Icon } from "@hugeicons/core-free-icons"

import { DashboardHero, UserSpacePage } from "@/components/user-space"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { MediaImage } from "@/components/ui/media-image"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type {
  AuthorCreateRequest,
  AuthorResponse,
  PublisherCreateRequest,
  PublisherResponse,
  TagCreateRequest,
  TagResponse,
  TitleCreateRequest,
  TitleResponse,
  TitleUpdateRequest,
} from "@/lib/api/api.schemas"
import {
  TagCreateRequestType,
  TitleCreateRequestContentRating,
  TitleCreateRequestTitleStatus,
  TitleCreateRequestType,
} from "@/lib/api/api.schemas"
import { getAuthors } from "@/lib/api/authors/authors"
import { getPublishers } from "@/lib/api/publishers/publishers"
import { getTags } from "@/lib/api/tags/tags"
import { getTitles } from "@/lib/api/titles/titles"
import { getMedia } from "@/lib/api/media/media"
import {
  buildLoginHref,
  getAuthTokenClaims,
  hasAuthToken,
  initKeycloak,
} from "@/lib/axios-instance"
import { hasAdminRole } from "@/lib/user-space"
import { CONTENT_RATING_LABELS, TITLE_TYPE_LABELS } from "@/lib/constants"

type AdminTab = "titles" | "authors" | "publishers" | "tags"

type TitleAuthorRole = "STORY" | "ART" | "STORY_AND_ART"

type DeleteTarget =
  | { kind: "title"; id: string; label: string }
  | { kind: "author"; id: string; label: string }
  | { kind: "publisher"; id: string; label: string }
  | { kind: "tag"; id: string; label: string }

type AuthorFormState = {
  name: string
  slug: string
  description: string
  websiteUrls: string
  countryIsoCode: string
  mainCoverMediaId: string
}

export default function AdminPage() {
  return <AdminWorkspace />
}

type PublisherFormState = {
  name: string
  slug: string
  description: string
  websiteUrls: string
  countryIsoCode: string
  logoMediaId: string
}

type TagFormState = {
  name: string
  slug: string
  type: (typeof TagCreateRequestType)[keyof typeof TagCreateRequestType] | ""
  description: string
}

type TitleFormState = {
  name: string
  slug: string
  description: string
  type:
    | (typeof TitleCreateRequestType)[keyof typeof TitleCreateRequestType]
    | ""
  titleStatus:
    | (typeof TitleCreateRequestTitleStatus)[keyof typeof TitleCreateRequestTitleStatus]
    | ""
  releaseYear: string
  contentRating:
    | (typeof TitleCreateRequestContentRating)[keyof typeof TitleCreateRequestContentRating]
    | ""
  countryIsoCode: string
  mainCoverMediaId: string
}

const ENTITY_PAGE_SIZE = 200
const TITLE_PAGE_SIZE = 100
const DEFAULT_ADMIN_TAB: AdminTab = "titles"
const TITLE_AUTHOR_ROLES: TitleAuthorRole[] = ["STORY", "ART", "STORY_AND_ART"]

const toTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

const toStringValue = (value: unknown) =>
  typeof value === "string" ? value : ""

const toOptionalTrimmedString = (value: unknown) => {
  const normalized = toTrimmedString(value)
  return normalized || undefined
}

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") {
    return fallback
  }

  const maybeError = error as {
    response?: {
      status?: number
      data?: {
        detail?: unknown
        title?: unknown
        message?: unknown
      }
    }
  }

  const response = maybeError.response

  if (!response) {
    return fallback
  }

  const detail = toTrimmedString(response.data?.detail)
  const title = toTrimmedString(response.data?.title)
  const message = toTrimmedString(response.data?.message)
  const reason = detail || message || title

  if (reason) {
    return `${fallback}: ${reason}`
  }

  if (response.status) {
    return `${fallback} (HTTP ${response.status})`
  }

  return fallback
}

const createEmptyAuthorForm = (): AuthorFormState => ({
  name: "",
  slug: "",
  description: "",
  websiteUrls: "",
  countryIsoCode: "",
  mainCoverMediaId: "",
})

const createEmptyPublisherForm = (): PublisherFormState => ({
  name: "",
  slug: "",
  description: "",
  websiteUrls: "",
  countryIsoCode: "",
  logoMediaId: "",
})

const createEmptyTagForm = (): TagFormState => ({
  name: "",
  slug: "",
  type: TagCreateRequestType.GENRE,
  description: "",
})

const createEmptyTitleForm = (): TitleFormState => ({
  name: "",
  slug: "",
  description: "",
  type: TitleCreateRequestType.MANGA,
  titleStatus: TitleCreateRequestTitleStatus.ONGOING,
  releaseYear: "",
  contentRating: TitleCreateRequestContentRating.TWELVE_PLUS,
  countryIsoCode: "JP",
  mainCoverMediaId: "",
})

const normalizeIdList = (values: (string | undefined | null)[]) =>
  values.map(toTrimmedString).filter((value): value is string => Boolean(value))

const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

const joinLines = (values?: string[]) => (values || []).join("\n")

const normalizeCountryCode = (value: string) =>
  toTrimmedString(value).toUpperCase().slice(0, 2)

const parseOptionalYear = (value: string) => {
  const trimmed = toTrimmedString(value)

  if (!trimmed) {
    return undefined
  }

  const parsed = Number.parseInt(trimmed, 10)

  return Number.isInteger(parsed) && parsed >= 0 ? String(parsed) : undefined
}

const toTitleAuthorMap = (
  authors?: TitleResponse["authors"]
): Record<string, TitleAuthorRole> => {
  const result: Record<string, TitleAuthorRole> = {}

  ;(authors || []).forEach((entry) => {
    const authorId = entry.author?.id

    if (authorId) {
      result[authorId] = (entry.role as TitleAuthorRole) || "STORY"
    }
  })

  return result
}

const toIdList = <T extends { id?: string }>(items?: T[]) =>
  normalizeIdList((items || []).map((item) => item.id))

const formatTitleValue = (value?: string) => toTrimmedString(value) || "—"

const formatCardList = (values: string[], emptyText = "—") =>
  values.length > 0 ? values.join(", ") : emptyText

const getEntityLabel = (value?: string | null, fallback = "Элемент") =>
  toTrimmedString(value) || fallback

const toggleListItem = (
  values: string[],
  item: string,
  shouldInclude: boolean
) =>
  shouldInclude
    ? [...new Set([...values, item])]
    : values.filter((value) => value !== item)

const toggleAuthorRole = (
  values: Record<string, TitleAuthorRole>,
  authorId: string,
  shouldInclude: boolean,
  fallbackRole: TitleAuthorRole = "STORY"
) => {
  if (shouldInclude) {
    return {
      ...values,
      [authorId]: values[authorId] || fallbackRole,
    }
  }

  const next = { ...values }
  delete next[authorId]
  return next
}

const fetchAllTitles = async () => {
  const firstPage = await getTitles().searchTitles({
    page: 0,
    size: TITLE_PAGE_SIZE,
    sort: ["updatedAt,DESC"],
  })

  const pages = Math.max(1, firstPage.page?.totalPages || 1)
  const items = [...(firstPage.content || [])]

  if (pages <= 1) {
    return items
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, async (_, index) => {
      const response = await getTitles().searchTitles({
        page: index + 1,
        size: TITLE_PAGE_SIZE,
        sort: ["updatedAt,DESC"],
      })

      return response.content || []
    })
  )

  return [...items, ...rest.flat()]
}

// noinspection JSComplexity
//noinspection JSComplexity
function AdminWorkspace() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [activeTab, setActiveTab] = useState<AdminTab>(DEFAULT_ADMIN_TAB)

  const [titles, setTitles] = useState<TitleResponse[]>([])
  const [authors, setAuthors] = useState<AuthorResponse[]>([])
  const [publishers, setPublishers] = useState<PublisherResponse[]>([])
  const [tags, setTags] = useState<TagResponse[]>([])

  const [titleSearch, setTitleSearch] = useState("")
  const [titleAuthorFilter, setTitleAuthorFilter] = useState("")
  const [titlePublisherFilter, setTitlePublisherFilter] = useState("")
  const [titleTagFilter, setTitleTagFilter] = useState("")
  const [authorSearch, setAuthorSearch] = useState("")
  const [publisherSearch, setPublisherSearch] = useState("")
  const [tagSearch, setTagSearch] = useState("")

  const [isTitleDialogOpen, setIsTitleDialogOpen] = useState(false)
  const [isAuthorDialogOpen, setIsAuthorDialogOpen] = useState(false)
  const [isPublisherDialogOpen, setIsPublisherDialogOpen] = useState(false)
  const [isCoverUploading, setIsCoverUploading] = useState(false)
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null)

  const [titleMessage, setTitleMessage] = useState<string | null>(null)
  const [authorMessage, setAuthorMessage] = useState<string | null>(null)
  const [publisherMessage, setPublisherMessage] = useState<string | null>(null)
  const [tagMessage, setTagMessage] = useState<string | null>(null)

  const [authorForm, setAuthorForm] = useState<AuthorFormState>(
    createEmptyAuthorForm
  )
  const [publisherForm, setPublisherForm] = useState<PublisherFormState>(
    createEmptyPublisherForm
  )
  const [tagForm, setTagForm] = useState<TagFormState>(createEmptyTagForm)
  const [titleForm, setTitleForm] =
    useState<TitleFormState>(createEmptyTitleForm)

  const [editingAuthorId, setEditingAuthorId] = useState<string | null>(null)
  const [editingPublisherId, setEditingPublisherId] = useState<string | null>(
    null
  )
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)

  const [titleAuthorRoles, setTitleAuthorRoles] = useState<
    Record<string, TitleAuthorRole>
  >({})
  const [titlePublisherIds, setTitlePublisherIds] = useState<string[]>([])
  const [titleTagIds, setTitleTagIds] = useState<string[]>([])

  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadAuthors = useCallback(async () => {
    try {
      const response = await getAuthors().searchAuthors({
        page: 0,
        size: ENTITY_PAGE_SIZE,
        sort: ["name,ASC"],
      })

      setAuthors(
        (response.content || [])
          .slice()
          .sort((left, right) =>
            (left.name || "").localeCompare(right.name || "", "ru")
          )
      )
    } catch {
      setAuthors([])
    }
  }, [])

  const loadPublishers = useCallback(async () => {
    try {
      const response = await getPublishers().searchPublishers({
        page: 0,
        size: ENTITY_PAGE_SIZE,
        sort: ["name,ASC"],
      })

      setPublishers(
        (response.content || [])
          .slice()
          .sort((left, right) =>
            (left.name || "").localeCompare(right.name || "", "ru")
          )
      )
    } catch {
      setPublishers([])
    }
  }, [])

  const loadTags = useCallback(async () => {
    try {
      const response = await getTags().getTags({
        page: 0,
        size: ENTITY_PAGE_SIZE,
        sort: ["name,ASC"],
      })

      setTags(
        (response.content || [])
          .slice()
          .sort((left, right) =>
            (left.name || "").localeCompare(right.name || "", "ru")
          )
      )
    } catch {
      setTags([])
    }
  }, [])

  const loadTitles = useCallback(async () => {
    try {
      setTitles(await fetchAllTitles())
    } catch {
      setTitles([])
    }
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadAuthors(),
      loadPublishers(),
      loadTags(),
      loadTitles(),
    ])
  }, [loadAuthors, loadPublishers, loadTags, loadTitles])

  useEffect(() => {
    let isMounted = true

    const bootstrap = async () => {
      setIsBootstrapping(true)

      const authenticated = await initKeycloak().catch(() => false)
      const nextClaims = getAuthTokenClaims()
      const nextIsAuthenticated = authenticated || hasAuthToken()
      const nextIsAdmin = hasAdminRole(nextClaims)

      if (!isMounted) {
        return
      }

      setIsAuthenticated(nextIsAuthenticated)
      setIsAdmin(nextIsAdmin)

      if (!nextIsAdmin) {
        setIsBootstrapping(false)
        return
      }

      await refreshAll()

      if (isMounted) {
        setIsBootstrapping(false)
      }
    }

    void bootstrap()

    return () => {
      isMounted = false
    }
  }, [refreshAll])

  const filteredAuthors = useMemo(() => {
    const query = authorSearch.trim().toLowerCase()

    if (!query) {
      return authors
    }

    return authors.filter((author) =>
      [author.name, author.slug, author.countryIsoCode]
        .filter(Boolean)
        .some((value) => (value || "").toLowerCase().includes(query))
    )
  }, [authorSearch, authors])

  const filteredPublishers = useMemo(() => {
    const query = publisherSearch.trim().toLowerCase()

    if (!query) {
      return publishers
    }

    return publishers.filter((publisher) =>
      [publisher.name, publisher.slug, publisher.countryIsoCode]
        .filter(Boolean)
        .some((value) => (value || "").toLowerCase().includes(query))
    )
  }, [publisherSearch, publishers])

  const filteredTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase()

    if (!query) {
      return tags
    }

    return tags.filter((tag) =>
      [tag.name, tag.slug, tag.type, tag.description]
        .filter(Boolean)
        .some((value) => (value || "").toLowerCase().includes(query))
    )
  }, [tagSearch, tags])

  const filteredTitles = useMemo(() => {
    const query = titleSearch.trim().toLowerCase()

    if (!query) {
      return titles
    }

    return titles.filter((title) =>
      [title.name, title.slug, title.description, title.countryIsoCode]
        .filter(Boolean)
        .some((value) => (value || "").toLowerCase().includes(query))
    )
  }, [titleSearch, titles])

  const filteredTitleAuthors = useMemo(() => {
    const query = toTrimmedString(titleAuthorFilter).toLowerCase()

    if (!query) {
      return authors
    }

    return authors.filter((author) =>
      [author.name, author.slug]
        .filter(Boolean)
        .some((value) => toTrimmedString(value).toLowerCase().includes(query))
    )
  }, [authors, titleAuthorFilter])

  const filteredTitlePublishers = useMemo(() => {
    const query = toTrimmedString(titlePublisherFilter).toLowerCase()

    if (!query) {
      return publishers
    }

    return publishers.filter((publisher) =>
      [publisher.name, publisher.slug]
        .filter(Boolean)
        .some((value) => toTrimmedString(value).toLowerCase().includes(query))
    )
  }, [publishers, titlePublisherFilter])

  const filteredTitleTags = useMemo(() => {
    const query = toTrimmedString(titleTagFilter).toLowerCase()

    if (!query) {
      return tags
    }

    return tags.filter((tag) =>
      [tag.name, tag.slug]
        .filter(Boolean)
        .some((value) => toTrimmedString(value).toLowerCase().includes(query))
    )
  }, [tags, titleTagFilter])

  const titleAuthorCount = Object.keys(titleAuthorRoles).length

  const getImageDimensions = (file: File) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file)
      const image = new Image()

      image.onload = () => {
        const width = image.naturalWidth || 0
        const height = image.naturalHeight || 0
        URL.revokeObjectURL(objectUrl)
        resolve({ width, height })
      }

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error("Не удалось прочитать изображение"))
      }

      image.src = objectUrl
    })

  const resetAuthorForm = () => {
    setEditingAuthorId(null)
    setAuthorForm(createEmptyAuthorForm())
    setAuthorMessage(null)
  }

  const resetPublisherForm = () => {
    setEditingPublisherId(null)
    setPublisherForm(createEmptyPublisherForm())
    setPublisherMessage(null)
  }

  const resetTagForm = () => {
    setEditingTagId(null)
    setTagForm(createEmptyTagForm())
    setTagMessage(null)
  }

  const resetTitleForm = () => {
    setEditingTitleId(null)
    setTitleForm(createEmptyTitleForm())
    setTitleAuthorRoles({})
    setTitlePublisherIds([])
    setTitleTagIds([])
    setTitleAuthorFilter("")
    setTitlePublisherFilter("")
    setTitleTagFilter("")
    setCoverUploadError(null)
    setTitleMessage(null)
  }

  const openCreateTitleDialog = () => {
    resetTitleForm()
    setIsTitleDialogOpen(true)
  }

  const openCreateAuthorDialog = () => {
    resetAuthorForm()
    setIsAuthorDialogOpen(true)
  }

  const openCreatePublisherDialog = () => {
    resetPublisherForm()
    setIsPublisherDialogOpen(true)
  }

  const startEditingAuthor = (author: AuthorResponse) => {
    setActiveTab("authors")
    setEditingAuthorId(author.id || null)
    setAuthorForm({
      name: toStringValue(author.name),
      slug: toStringValue(author.slug),
      description: toStringValue(author.description),
      websiteUrls: joinLines(author.websiteUrls),
      countryIsoCode: toStringValue(author.countryIsoCode),
      mainCoverMediaId: toStringValue(author.mainCoverMediaId),
    })
    setAuthorMessage(null)
    setIsAuthorDialogOpen(true)
  }

  const startEditingPublisher = (publisher: PublisherResponse) => {
    setActiveTab("publishers")
    setEditingPublisherId(publisher.id || null)
    setPublisherForm({
      name: toStringValue(publisher.name),
      slug: toStringValue(publisher.slug),
      description: toStringValue(publisher.description),
      websiteUrls: joinLines(publisher.websiteUrls),
      countryIsoCode: toStringValue(publisher.countryIsoCode),
      logoMediaId: toStringValue(publisher.logoMediaId),
    })
    setPublisherMessage(null)
    setIsPublisherDialogOpen(true)
  }

  const startEditingTag = (tag: TagResponse) => {
    setActiveTab("tags")
    setEditingTagId(tag.id || null)
    setTagForm({
      name: toStringValue(tag.name),
      slug: toStringValue(tag.slug),
      type: tag.type || TagCreateRequestType.GENRE,
      description: toStringValue(tag.description),
    })
    setTagMessage(null)
  }

  const startEditingTitle = (title: TitleResponse) => {
    setActiveTab("titles")
    setEditingTitleId(title.id || null)
    setTitleForm({
      name: toStringValue(title.name),
      slug: toStringValue(title.slug),
      description: toStringValue(title.description),
      type: title.type || TitleCreateRequestType.MANGA,
      titleStatus: title.titleStatus || TitleCreateRequestTitleStatus.ONGOING,
      releaseYear: toStringValue(title.releaseYear),
      contentRating:
        title.contentRating || TitleCreateRequestContentRating.TWELVE_PLUS,
      countryIsoCode: toStringValue(title.countryIsoCode),
      mainCoverMediaId: toStringValue(title.mainCoverMediaId),
    })
    setTitleAuthorRoles(toTitleAuthorMap(title.authors))
    setTitlePublisherIds(
      normalizeIdList(
        (title.publishers || []).map((entry) => entry.publisher?.id)
      )
    )
    setTitleTagIds(toIdList(title.tags))
    setTitleAuthorFilter("")
    setTitlePublisherFilter("")
    setTitleTagFilter("")
    setCoverUploadError(null)
    setTitleMessage(null)
    setIsTitleDialogOpen(true)
  }

  const handleTitleCoverUpload = async (file: File) => {
    setCoverUploadError(null)
    setIsCoverUploading(true)

    try {
      const { width, height } = await getImageDimensions(file)
      const upload = await getMedia().generateUploadUrl({
        originalFilename: file.name || "cover",
        contentType: file.type || "application/octet-stream",
        width: Math.min(4100, Math.max(1, width)),
        height: Math.min(4100, Math.max(1, height)),
      })

      if (!upload.id || !upload.url) {
        setCoverUploadError("Не удалось получить ссылку загрузки")
        return
      }

      const response = await fetch(upload.url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      })

      if (!response.ok) {
        setCoverUploadError("Ошибка загрузки файла")
        return
      }

      setTitleForm((previous) => ({ ...previous, mainCoverMediaId: upload.id || "" }))
    } catch {
      setCoverUploadError("Не удалось загрузить обложку")
    } finally {
      setIsCoverUploading(false)
    }
  }

  const submitAuthor = async (
    event: Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0]
  ) => {
    event.preventDefault()

    const name = toTrimmedString(authorForm.name)

    if (!name) {
      setAuthorMessage("У автора должно быть название")
      return
    }

    const payload: AuthorCreateRequest = {
      name,
      slug: toOptionalTrimmedString(authorForm.slug),
      description: toOptionalTrimmedString(authorForm.description),
      websiteUrls: splitLines(authorForm.websiteUrls),
      countryIsoCode:
        normalizeCountryCode(authorForm.countryIsoCode) || undefined,
      mainCoverMediaId: toOptionalTrimmedString(authorForm.mainCoverMediaId),
    }

    try {
      if (editingAuthorId) {
        await getAuthors().updateAuthor(editingAuthorId, payload)
        setAuthorMessage("Автор обновлён")
      } else {
        await getAuthors().createAuthor(payload)
        setAuthorMessage("Автор создан")
      }

      setIsAuthorDialogOpen(false)
      resetAuthorForm()
      await loadAuthors()
    } catch (error) {
      setAuthorMessage(getApiErrorMessage(error, "Не удалось сохранить автора"))
    }
  }

  const submitPublisher = async (
    event: Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0]
  ) => {
    event.preventDefault()

    const name = toTrimmedString(publisherForm.name)

    if (!name) {
      setPublisherMessage("У издателя должно быть название")
      return
    }

    const payload: PublisherCreateRequest = {
      name,
      slug: toOptionalTrimmedString(publisherForm.slug),
      description: toOptionalTrimmedString(publisherForm.description),
      websiteUrls: splitLines(publisherForm.websiteUrls),
      countryIsoCode:
        normalizeCountryCode(publisherForm.countryIsoCode) || undefined,
      logoMediaId: toOptionalTrimmedString(publisherForm.logoMediaId),
    }

    try {
      if (editingPublisherId) {
        await getPublishers().updatePublisher(editingPublisherId, payload)
        setPublisherMessage("Издатель обновлён")
      } else {
        await getPublishers().createPublisher(payload)
        setPublisherMessage("Издатель создан")
      }

      setIsPublisherDialogOpen(false)
      resetPublisherForm()
      await loadPublishers()
    } catch (error) {
      setPublisherMessage(
        getApiErrorMessage(error, "Не удалось сохранить издателя")
      )
    }
  }

  const submitTag = async (
    event: Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0]
  ) => {
    event.preventDefault()

    const name = toTrimmedString(tagForm.name)

    if (!name) {
      setTagMessage("У тега должно быть название")
      return
    }

    if (!tagForm.type) {
      setTagMessage("Выберите тип тега")
      return
    }

    const payload: TagCreateRequest = {
      name,
      slug: toOptionalTrimmedString(tagForm.slug),
      type: tagForm.type,
      description: toOptionalTrimmedString(tagForm.description),
    }

    try {
      if (editingTagId) {
        await getTags().updateTag(editingTagId, payload)
        setTagMessage("Тег обновлён")
      } else {
        await getTags().createTag(payload)
        setTagMessage("Тег создан")
      }

      resetTagForm()
      await loadTags()
    } catch (error) {
      setTagMessage(getApiErrorMessage(error, "Не удалось сохранить тег"))
    }
  }

  const submitTitle = async (
    event: Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0]
  ) => {
    event.preventDefault()

    const name = toTrimmedString(titleForm.name)

    if (!name) {
      setTitleMessage("У тайтла должно быть название")
      return
    }

    if (!titleForm.type || !titleForm.titleStatus || !titleForm.contentRating) {
      setTitleMessage("Заполните тип, статус и возрастной рейтинг тайтла")
      return
    }

    if (!normalizeCountryCode(titleForm.countryIsoCode)) {
      setTitleMessage("Укажите код страны тайтла")
      return
    }

    const basePayload: TitleUpdateRequest = {
      name,
      slug: toOptionalTrimmedString(titleForm.slug),
      description: toOptionalTrimmedString(titleForm.description),
      type: titleForm.type,
      titleStatus: titleForm.titleStatus,
      releaseYear: parseOptionalYear(titleForm.releaseYear),
      contentRating: titleForm.contentRating,
      countryIsoCode: normalizeCountryCode(titleForm.countryIsoCode),
      mainCoverMediaId: toOptionalTrimmedString(titleForm.mainCoverMediaId),
    }

    try {
      if (editingTitleId) {
        await getTitles().updateTitle(editingTitleId, basePayload)
        setTitleMessage("Тайтл обновлён")
      } else {
        const createPayload: TitleCreateRequest = {
          ...basePayload,
          name,
          type: titleForm.type,
          titleStatus: titleForm.titleStatus,
          contentRating: titleForm.contentRating,
          countryIsoCode: normalizeCountryCode(titleForm.countryIsoCode),
          authorIds: Object.fromEntries(
            Object.entries(titleAuthorRoles).map(([authorId, role]) => [
              authorId,
              role,
            ])
          ),
          publisherIds: titlePublisherIds,
          tagIds: titleTagIds,
        }

        await getTitles().createTitle(createPayload)
        setTitleMessage("Тайтл создан")
      }

      setIsTitleDialogOpen(false)
      resetTitleForm()
      await loadTitles()
    } catch (error) {
      setTitleMessage(getApiErrorMessage(error, "Не удалось сохранить тайтл"))
    }
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) {
      return
    }

    setIsDeleting(true)

    try {
      switch (pendingDelete.kind) {
        case "author":
          await getAuthors().deleteAuthor(pendingDelete.id)
          if (editingAuthorId === pendingDelete.id) {
            resetAuthorForm()
          }
          await loadAuthors()
          break
        case "publisher":
          await getPublishers().deletePublisher(pendingDelete.id)
          if (editingPublisherId === pendingDelete.id) {
            resetPublisherForm()
          }
          await loadPublishers()
          break
        case "tag":
          await getTags().deleteTag(pendingDelete.id)
          if (editingTagId === pendingDelete.id) {
            resetTagForm()
          }
          await loadTags()
          break
        case "title":
          await getTitles().deleteTitle(pendingDelete.id)
          if (editingTitleId === pendingDelete.id) {
            resetTitleForm()
          }
          await loadTitles()
          break
      }

      setPendingDelete(null)
    } catch {
      switch (pendingDelete.kind) {
        case "author":
          setAuthorMessage("Не удалось удалить автора")
          break
        case "publisher":
          setPublisherMessage("Не удалось удалить издателя")
          break
        case "tag":
          setTagMessage("Не удалось удалить тег")
          break
        case "title":
          setTitleMessage("Не удалось удалить тайтл")
          break
      }
    } finally {
      setIsDeleting(false)
    }
  }

  if (!isBootstrapping && (!isAuthenticated || !isAdmin)) {
    return (
      <UserSpacePage>
        <Card className="border border-border/70 bg-card/90 shadow-sm">
          <CardHeader className="border-b border-border/70">
            <CardTitle>Доступ к админке закрыт</CardTitle>
            <CardDescription>
              Для работы с тайтлами, авторами, издателями и тегами нужна учётная
              запись с admin-ролью.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-muted-foreground">
              Войдите под администратором или запросите доступ у команды
              проекта.
            </p>
            <Button asChild>
              <Link href={buildLoginHref("/admin")}>Войти в админку</Link>
            </Button>
          </CardContent>
        </Card>
      </UserSpacePage>
    )
  }

  return (
    <UserSpacePage>
      <DashboardHero
        eyebrow="Админка"
        title="Контентная панель"
        description="Создавайте и редактируйте тайтлы, авторов, издателей и теги в одном месте. Публичные сущности сразу становятся доступны в каталоге и на связанных страницах."
        badges={
          <>
            <Badge className="rounded-full px-3 py-1">Админ-доступ</Badge>
            <Badge
              variant="outline"
              className="rounded-full bg-background/70 px-3 py-1"
            >
              Тайтлы: {titles.length}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full bg-background/70 px-3 py-1"
            >
              Авторы: {authors.length}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full bg-background/70 px-3 py-1"
            >
              Издатели: {publishers.length}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full bg-background/70 px-3 py-1"
            >
              Теги: {tags.length}
            </Badge>
          </>
        }
        actions={[
          {
            href: "/catalog",
            label: "Открыть каталог",
            icon: BookOpen01Icon,
            variant: "outline",
          },
        ]}
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AdminTab)}
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="titles">Тайтлы</TabsTrigger>
          <TabsTrigger value="authors">Авторы</TabsTrigger>
          <TabsTrigger value="publishers">Издатели</TabsTrigger>
          <TabsTrigger value="tags">Теги</TabsTrigger>
        </TabsList>

        <TabsContent value="titles" className="mt-6 space-y-6">
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Тайтлы</CardTitle>
                  <CardDescription>
                    Создавайте новые тайтлы или редактируйте существующие в модальном
                    окне.
                  </CardDescription>
                </div>
                <Button type="button" onClick={openCreateTitleDialog}>
                  Создать тайтл
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-medium">
                      Существующие тайтлы
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Выбирайте тайтл для редактирования или удаления.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={titleSearch}
                      onChange={(event) => setTitleSearch(event.target.value)}
                      placeholder="Поиск по тайтлам"
                      className="w-64"
                    />
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      {filteredTitles.length}/{titles.length}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredTitles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Тайтлы не найдены.
                    </p>
                  ) : (
                    filteredTitles.map((title) => {
                      if (!title.id) {
                        return null
                      }

                      const authorLabels = (title.authors || [])
                        .map((entry) => entry.author?.name || "")
                        .filter(Boolean)
                      const publisherLabels = (title.publishers || [])
                        .map((entry) => entry.publisher?.name || "")
                        .filter(Boolean)
                      const tagLabels = (title.tags || [])
                        .map((entry) => entry.name || "")
                        .filter(Boolean)

                      return (
                        <Card
                          key={title.id}
                          size="sm"
                          className="h-full border border-border/70 bg-background/80"
                        >
                          <CardHeader className="border-b border-border/70">
                            <CardTitle className="text-sm">
                              {title.name || "Без названия"}
                            </CardTitle>
                            <CardDescription className="text-xs">
                              {title.slug ? `/${title.slug}` : "Без slug"}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3 pt-3 text-sm">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">
                                {TITLE_TYPE_LABELS[title.type || ""] ||
                                  title.type ||
                                  "Тип"}
                              </Badge>
                              <Badge variant="secondary">
                                {title.titleStatus || "Статус"}
                              </Badge>
                              <Badge variant="outline">
                                {CONTENT_RATING_LABELS[
                                  title.contentRating || ""
                                ] ||
                                  title.contentRating ||
                                  "Рейтинг"}
                              </Badge>
                            </div>
                            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                              <div>
                                Страна: {formatTitleValue(title.countryIsoCode)}
                              </div>
                              <div>
                                Год: {formatTitleValue(title.releaseYear)}
                              </div>
                              <div className="sm:col-span-2">
                                Обложка:{" "}
                                {formatTitleValue(title.mainCoverMediaId)}
                              </div>
                            </div>
                            <p className="line-clamp-3 text-xs text-muted-foreground">
                              {toTrimmedString(title.description) ||
                                "Описание не добавлено"}
                            </p>
                            <div className="space-y-2 text-xs">
                              <div>
                                <span className="font-medium">Авторы:</span>{" "}
                                {formatCardList(authorLabels)}
                              </div>
                              <div>
                                <span className="font-medium">Издатели:</span>{" "}
                                {formatCardList(publisherLabels)}
                              </div>
                              <div>
                                <span className="font-medium">Теги:</span>{" "}
                                {formatCardList(tagLabels)}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => startEditingTitle(title)}
                              >
                                Редактировать
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  setPendingDelete({
                                    kind: "title",
                                    id: title.id as string,
                                    label:
                                      title.name ||
                                      title.slug ||
                                      title.id ||
                                      "Тайтл",
                                  })
                                }
                              >
                                Удалить
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="authors" className="mt-6 space-y-6">
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Авторы</CardTitle>
                  <CardDescription>
                    Создавайте новых авторов и редактируйте существующих во
                    всплывающем окне.
                  </CardDescription>
                </div>
                <Button type="button" onClick={openCreateAuthorDialog}>
                  Создать автора
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Input
                    value={authorSearch}
                    onChange={(event) => setAuthorSearch(event.target.value)}
                    placeholder="Поиск по авторам"
                    className="w-64"
                  />
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {filteredAuthors.length}/{authors.length}
                  </Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredAuthors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Авторы не найдены.
                    </p>
                  ) : (
                    filteredAuthors.map((author) => {
                      if (!author.id) return null

                      return (
                        <Card
                          key={author.id}
                          size="sm"
                          className="h-full border border-border/70 bg-background/80"
                        >
                          <CardHeader className="border-b border-border/70">
                            <CardTitle className="text-sm">
                              {author.name || "Без названия"}
                            </CardTitle>
                            <CardDescription className="text-xs">
                              {author.slug ? `/${author.slug}` : "Без slug"}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3 pt-3 text-xs">
                            <div className="flex flex-wrap gap-2">
                              {author.countryIsoCode ? (
                                <Badge variant="outline">
                                  {author.countryIsoCode}
                                </Badge>
                              ) : null}
                              {author.mainCoverMediaId ? (
                                <Badge variant="secondary">Cover ID</Badge>
                              ) : null}
                            </div>
                            <p className="line-clamp-3 text-muted-foreground">
                              {toTrimmedString(author.description) ||
                                "Описание не добавлено"}
                            </p>
                            {author.websiteUrls?.length ? (
                              <p className="text-muted-foreground">
                                {author.websiteUrls.join(", ")}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => startEditingAuthor(author)}
                              >
                                Редактировать
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  setPendingDelete({
                                    kind: "author",
                                    id: author.id as string,
                                    label:
                                      author.name ||
                                      author.slug ||
                                      author.id ||
                                      "Автор",
                                  })
                                }
                              >
                                Удалить
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="publishers" className="mt-6 space-y-6">
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Издатели</CardTitle>
                  <CardDescription>
                    Создавайте новых издателей и редактируйте существующих во
                    всплывающем окне.
                  </CardDescription>
                </div>
                <Button type="button" onClick={openCreatePublisherDialog}>
                  Создать издателя
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Input
                    value={publisherSearch}
                    onChange={(event) => setPublisherSearch(event.target.value)}
                    placeholder="Поиск по издателям"
                    className="w-64"
                  />
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {filteredPublishers.length}/{publishers.length}
                  </Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredPublishers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Издатели не найдены.
                    </p>
                  ) : (
                    filteredPublishers.map((publisher) => {
                      if (!publisher.id) return null

                      return (
                        <Card
                          key={publisher.id}
                          size="sm"
                          className="h-full border border-border/70 bg-background/80"
                        >
                          <CardHeader className="border-b border-border/70">
                            <CardTitle className="text-sm">
                              {publisher.name || "Без названия"}
                            </CardTitle>
                            <CardDescription className="text-xs">
                              {publisher.slug
                                ? `/${publisher.slug}`
                                : "Без slug"}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3 pt-3 text-xs">
                            <div className="flex flex-wrap gap-2">
                              {publisher.countryIsoCode ? (
                                <Badge variant="outline">
                                  {publisher.countryIsoCode}
                                </Badge>
                              ) : null}
                              {publisher.logoMediaId ? (
                                <Badge variant="secondary">Logo ID</Badge>
                              ) : null}
                            </div>
                            <p className="line-clamp-3 text-muted-foreground">
                              {toTrimmedString(publisher.description) ||
                                "Описание не добавлено"}
                            </p>
                            {publisher.websiteUrls?.length ? (
                              <p className="text-muted-foreground">
                                {publisher.websiteUrls.join(", ")}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => startEditingPublisher(publisher)}
                              >
                                Редактировать
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  setPendingDelete({
                                    kind: "publisher",
                                    id: publisher.id as string,
                                    label:
                                      publisher.name ||
                                      publisher.slug ||
                                      publisher.id ||
                                      "Издатель",
                                  })
                                }
                              >
                                Удалить
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tags" className="mt-6 space-y-6">
          <Card className="border border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="border-b border-border/70">
              <CardTitle>
                {editingTagId ? "Редактирование тега" : "Новый тег"}
              </CardTitle>
              <CardDescription>
                Теги используются в каталоге, на страницах тайтлов и при
                создании подборок.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <form
                onSubmit={(event) => {
                  void submitTag(event)
                }}
                className="grid gap-4 lg:grid-cols-2"
              >
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Название</span>
                  <Input
                    value={tagForm.name}
                    onChange={(event) =>
                      setTagForm((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Название тега"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Slug</span>
                  <Input
                    value={tagForm.slug}
                    onChange={(event) =>
                      setTagForm((previous) => ({
                        ...previous,
                        slug: event.target.value,
                      }))
                    }
                    placeholder="genre-action"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Тип</span>
                  <select
                    value={tagForm.type}
                    onChange={(event) =>
                      setTagForm((previous) => ({
                        ...previous,
                        type: event.target.value as TagFormState["type"],
                      }))
                    }
                    className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm"
                  >
                    {Object.values(TagCreateRequestType).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm lg:col-span-2">
                  <span className="text-muted-foreground">Описание</span>
                  <Textarea
                    rows={3}
                    value={tagForm.description}
                    onChange={(event) =>
                      setTagForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Краткая информация"
                  />
                </label>
                <div className="flex flex-wrap gap-3 lg:col-span-2">
                  <Button type="submit">
                    {editingTagId ? "Сохранить тег" : "Создать тег"}
                  </Button>
                  {editingTagId ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetTagForm}
                    >
                      Отменить
                    </Button>
                  ) : null}
                </div>
                {tagMessage ? (
                  <p className="text-sm text-muted-foreground lg:col-span-2">
                    {tagMessage}
                  </p>
                ) : null}
              </form>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Input
                    value={tagSearch}
                    onChange={(event) => setTagSearch(event.target.value)}
                    placeholder="Поиск по тегам"
                    className="w-64"
                  />
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {filteredTags.length}/{tags.length}
                  </Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Теги не найдены.
                    </p>
                  ) : (
                    filteredTags.map((tag) => {
                      if (!tag.id) return null

                      return (
                        <Card
                          key={tag.id}
                          size="sm"
                          className="h-full border border-border/70 bg-background/80"
                        >
                          <CardHeader className="border-b border-border/70">
                            <CardTitle className="text-sm">
                              {tag.name || "Без названия"}
                            </CardTitle>
                            <CardDescription className="text-xs">
                              {tag.slug ? `/${tag.slug}` : "Без slug"}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3 pt-3 text-xs">
                            <div className="flex flex-wrap gap-2">
                              {tag.type ? (
                                <Badge variant="outline">{tag.type}</Badge>
                              ) : null}
                            </div>
                            <p className="line-clamp-3 text-muted-foreground">
                              {toTrimmedString(tag.description) ||
                                "Описание не добавлено"}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => startEditingTag(tag)}
                              >
                                Редактировать
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  setPendingDelete({
                                    kind: "tag",
                                    id: tag.id as string,
                                    label:
                                      tag.name || tag.slug || tag.id || "Тег",
                                  })
                                }
                              >
                                Удалить
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isTitleDialogOpen} onOpenChange={setIsTitleDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {editingTitleId ? "Редактирование тайтла" : "Новый тайтл"}
            </DialogTitle>
            <DialogDescription>
              Заполните метаданные, выберите авторов/издателей/теги и загрузите
              обложку.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              void submitTitle(event)
            }}
            className="space-y-6"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Название</span>
                <Input
                  value={titleForm.name}
                  onChange={(event) =>
                    setTitleForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Название тайтла"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Slug</span>
                <Input
                  value={titleForm.slug}
                  onChange={(event) =>
                    setTitleForm((previous) => ({
                      ...previous,
                      slug: event.target.value,
                    }))
                  }
                  placeholder="naruto"
                />
              </label>

              <label className="space-y-1 text-sm lg:col-span-2">
                <span className="text-muted-foreground">Описание</span>
                <Textarea
                  rows={4}
                  value={titleForm.description}
                  onChange={(event) =>
                    setTitleForm((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Короткое описание"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Тип</span>
                <select
                  value={titleForm.type}
                  onChange={(event) =>
                    setTitleForm((previous) => ({
                      ...previous,
                      type: event.target.value as TitleFormState["type"],
                    }))
                  }
                  className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm"
                >
                  {Object.values(TitleCreateRequestType).map((item) => (
                    <option key={item} value={item}>
                      {TITLE_TYPE_LABELS[item] || item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Статус</span>
                <select
                  value={titleForm.titleStatus}
                  onChange={(event) =>
                    setTitleForm((previous) => ({
                      ...previous,
                      titleStatus: event.target.value as TitleFormState["titleStatus"],
                    }))
                  }
                  className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm"
                >
                  {Object.values(TitleCreateRequestTitleStatus).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Возрастной рейтинг</span>
                <select
                  value={titleForm.contentRating}
                  onChange={(event) =>
                    setTitleForm((previous) => ({
                      ...previous,
                      contentRating: event.target.value as TitleFormState["contentRating"],
                    }))
                  }
                  className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm"
                >
                  {Object.values(TitleCreateRequestContentRating).map((item) => (
                    <option key={item} value={item}>
                      {CONTENT_RATING_LABELS[item] || item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Год выпуска</span>
                <Input
                  type="number"
                  value={titleForm.releaseYear}
                  onChange={(event) =>
                    setTitleForm((previous) => ({
                      ...previous,
                      releaseYear: event.target.value,
                    }))
                  }
                  placeholder="2024"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Страна (ISO)</span>
                <Input
                  value={titleForm.countryIsoCode}
                  onChange={(event) =>
                    setTitleForm((previous) => ({
                      ...previous,
                      countryIsoCode: event.target.value,
                    }))
                  }
                  placeholder="JP"
                  maxLength={2}
                />
              </label>

              <label className="space-y-1 text-sm lg:col-span-2">
                <span className="text-muted-foreground">Media ID обложки</span>
                <Input
                  value={titleForm.mainCoverMediaId}
                  onChange={(event) =>
                    setTitleForm((previous) => ({
                      ...previous,
                      mainCoverMediaId: event.target.value,
                    }))
                  }
                  placeholder="main-cover-media-id"
                />
              </label>

              <label className="space-y-1 text-sm lg:col-span-2">
                <span className="text-muted-foreground">Загрузка обложки</span>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      void handleTitleCoverUpload(file)
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {isCoverUploading ? "Загружаем обложку..." : "Поддерживаются изображения."}
                </p>
                {coverUploadError ? (
                  <p className="text-xs text-destructive">{coverUploadError}</p>
                ) : null}
              </label>

              <div className="lg:col-span-2">
                <div className="relative h-56 overflow-hidden rounded-xl border bg-muted">
                  <MediaImage
                    mediaId={titleForm.mainCoverMediaId}
                    alt={titleForm.name || "Обложка тайтла"}
                    fill
                    className="object-cover"
                  />
                </div>
              </div>
            </div>

            {editingTitleId ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                Связи изменяются только при создании (временно).
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="space-y-3 rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Авторы</h3>
                  <Badge variant="outline" className="rounded-full px-2 py-0.5">
                    {titleAuthorCount}
                  </Badge>
                </div>
                <Input
                  value={titleAuthorFilter}
                  onChange={(event) => setTitleAuthorFilter(event.target.value)}
                  placeholder="Поиск автора"
                />
                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {filteredTitleAuthors.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Авторы не найдены.</p>
                  ) : (
                    filteredTitleAuthors.map((author) => {
                      if (!author.id) {
                        return null
                      }

                      const isSelected = Boolean(titleAuthorRoles[author.id])

                      return (
                        <div key={author.id} className="rounded-xl border bg-background/60 p-3">
                          <label aria-label={author.name || "Автор"} className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={isSelected}
                              onChange={(event) => {
                                setTitleAuthorRoles((previous) =>
                                  toggleAuthorRole(
                                    previous,
                                    author.id as string,
                                    event.target.checked
                                  )
                                )
                              }}
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="text-sm font-medium">{author.name || "Без названия"}</div>
                              <div className="text-xs text-muted-foreground">
                                {author.slug ? `/${author.slug}` : "Без slug"}
                              </div>
                            </div>
                          </label>
                          <select
                            className="mt-3 h-8 w-full rounded-lg border bg-background px-2.5 text-sm disabled:opacity-50"
                            disabled={!isSelected}
                            value={titleAuthorRoles[author.id] || "STORY"}
                            onChange={(event) => {
                              const role = event.target.value as TitleAuthorRole
                              setTitleAuthorRoles((previous) => ({
                                ...previous,
                                [author.id as string]: role,
                              }))
                            }}
                          >
                            {TITLE_AUTHOR_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Издатели</h3>
                  <Badge variant="outline" className="rounded-full px-2 py-0.5">
                    {titlePublisherIds.length}
                  </Badge>
                </div>
                <Input
                  value={titlePublisherFilter}
                  onChange={(event) => setTitlePublisherFilter(event.target.value)}
                  placeholder="Поиск издателя"
                />
                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {filteredTitlePublishers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Издатели не найдены.</p>
                  ) : (
                    filteredTitlePublishers.map((publisher) => {
                      if (!publisher.id) {
                        return null
                      }

                      const isSelected = titlePublisherIds.includes(publisher.id)

                      return (
                        <label
                          aria-label={publisher.name || "Издатель"}
                          key={publisher.id}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background/60 p-3"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={isSelected}
                            onChange={(event) => {
                              setTitlePublisherIds((previous) =>
                                toggleListItem(
                                  previous,
                                  publisher.id as string,
                                  event.target.checked
                                )
                              )
                            }}
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="text-sm font-medium">{publisher.name || "Без названия"}</div>
                            <div className="text-xs text-muted-foreground">
                              {publisher.slug ? `/${publisher.slug}` : "Без slug"}
                            </div>
                          </div>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Теги</h3>
                  <Badge variant="outline" className="rounded-full px-2 py-0.5">
                    {titleTagIds.length}
                  </Badge>
                </div>
                <Input
                  value={titleTagFilter}
                  onChange={(event) => setTitleTagFilter(event.target.value)}
                  placeholder="Поиск тега"
                />
                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {filteredTitleTags.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Теги не найдены.</p>
                  ) : (
                    filteredTitleTags.map((tag) => {
                      if (!tag.id) {
                        return null
                      }

                      const isSelected = titleTagIds.includes(tag.id)

                      return (
                        <label
                          aria-label={tag.name || "Тег"}
                          key={tag.id}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border bg-background/60 p-3"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={isSelected}
                            onChange={(event) => {
                              setTitleTagIds((previous) =>
                                toggleListItem(previous, tag.id as string, event.target.checked)
                              )
                            }}
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="text-sm font-medium">{tag.name || "Без названия"}</div>
                            <div className="text-xs text-muted-foreground">
                              {tag.slug ? `/${tag.slug}` : "Без slug"}
                            </div>
                          </div>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {titleMessage ? <p className="text-sm text-muted-foreground">{titleMessage}</p> : null}

            <DialogFooter className="justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsTitleDialogOpen(false)
                  resetTitleForm()
                }}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={isCoverUploading}>
                {editingTitleId ? "Сохранить тайтл" : "Создать тайтл"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAuthorDialogOpen} onOpenChange={setIsAuthorDialogOpen}>
        <DialogContent className="sm:max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {editingAuthorId ? "Редактирование автора" : "Новый автор"}
            </DialogTitle>
            <DialogDescription>
              Заполните базовую информацию об авторе.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              void submitAuthor(event)
            }}
            className="grid gap-4 lg:grid-cols-2"
          >
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Название</span>
              <Input
                value={authorForm.name}
                onChange={(event) =>
                  setAuthorForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                placeholder="Имя автора"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Slug</span>
              <Input
                value={authorForm.slug}
                onChange={(event) =>
                  setAuthorForm((previous) => ({
                    ...previous,
                    slug: event.target.value,
                  }))
                }
                placeholder="author-slug"
              />
            </label>
            <label className="space-y-1 text-sm lg:col-span-2">
              <span className="text-muted-foreground">Описание</span>
              <Textarea
                rows={3}
                value={authorForm.description}
                onChange={(event) =>
                  setAuthorForm((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
                placeholder="Краткая информация"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Страна (ISO)</span>
              <Input
                value={authorForm.countryIsoCode}
                onChange={(event) =>
                  setAuthorForm((previous) => ({
                    ...previous,
                    countryIsoCode: event.target.value,
                  }))
                }
                placeholder="JP"
                maxLength={2}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Media ID обложки</span>
              <Input
                value={authorForm.mainCoverMediaId}
                onChange={(event) =>
                  setAuthorForm((previous) => ({
                    ...previous,
                    mainCoverMediaId: event.target.value,
                  }))
                }
                placeholder="author-cover-media-id"
              />
            </label>
            <label className="space-y-1 text-sm lg:col-span-2">
              <span className="text-muted-foreground">Ссылки на сайт/соцсети</span>
              <Textarea
                rows={3}
                value={authorForm.websiteUrls}
                onChange={(event) =>
                  setAuthorForm((previous) => ({
                    ...previous,
                    websiteUrls: event.target.value,
                  }))
                }
                placeholder="https://example.com\nhttps://twitter.com/example"
              />
            </label>
            {authorMessage ? (
              <p className="text-sm text-muted-foreground lg:col-span-2">{authorMessage}</p>
            ) : null}
            <DialogFooter className="gap-2 lg:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAuthorDialogOpen(false)
                  resetAuthorForm()
                }}
              >
                Отмена
              </Button>
              <Button type="submit">
                {editingAuthorId ? "Сохранить автора" : "Создать автора"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isPublisherDialogOpen} onOpenChange={setIsPublisherDialogOpen}>
        <DialogContent className="sm:max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {editingPublisherId ? "Редактирование издателя" : "Новый издатель"}
            </DialogTitle>
            <DialogDescription>
              Заполните базовую информацию об издателе.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              void submitPublisher(event)
            }}
            className="grid gap-4 lg:grid-cols-2"
          >
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Название</span>
              <Input
                value={publisherForm.name}
                onChange={(event) =>
                  setPublisherForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                placeholder="Название издателя"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Slug</span>
              <Input
                value={publisherForm.slug}
                onChange={(event) =>
                  setPublisherForm((previous) => ({
                    ...previous,
                    slug: event.target.value,
                  }))
                }
                placeholder="publisher-slug"
              />
            </label>
            <label className="space-y-1 text-sm lg:col-span-2">
              <span className="text-muted-foreground">Описание</span>
              <Textarea
                rows={3}
                value={publisherForm.description}
                onChange={(event) =>
                  setPublisherForm((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
                placeholder="Краткая информация"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Страна (ISO)</span>
              <Input
                value={publisherForm.countryIsoCode}
                onChange={(event) =>
                  setPublisherForm((previous) => ({
                    ...previous,
                    countryIsoCode: event.target.value,
                  }))
                }
                placeholder="JP"
                maxLength={2}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Logo Media ID</span>
              <Input
                value={publisherForm.logoMediaId}
                onChange={(event) =>
                  setPublisherForm((previous) => ({
                    ...previous,
                    logoMediaId: event.target.value,
                  }))
                }
                placeholder="publisher-logo-media-id"
              />
            </label>
            <label className="space-y-1 text-sm lg:col-span-2">
              <span className="text-muted-foreground">Ссылки на сайт/соцсети</span>
              <Textarea
                rows={3}
                value={publisherForm.websiteUrls}
                onChange={(event) =>
                  setPublisherForm((previous) => ({
                    ...previous,
                    websiteUrls: event.target.value,
                  }))
                }
                placeholder="https://example.com\nhttps://vk.com/example"
              />
            </label>
            {publisherMessage ? (
              <p className="text-sm text-muted-foreground lg:col-span-2">{publisherMessage}</p>
            ) : null}
            <DialogFooter className="gap-2 lg:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsPublisherDialogOpen(false)
                  resetPublisherForm()
                }}
              >
                Отмена
              </Button>
              <Button type="submit">
                {editingPublisherId ? "Сохранить издателя" : "Создать издателя"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Удалить {getEntityLabel(pendingDelete?.label)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Элемент будет удалён окончательно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleConfirmDelete()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? "Удаляем..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UserSpacePage>
  )
}
