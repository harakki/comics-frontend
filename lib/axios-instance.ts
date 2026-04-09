import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios"
import Keycloak from "keycloak-js"

export const AXIOS_INSTANCE = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

const keycloak = new Keycloak({
  url: process.env.NEXT_PUBLIC_KEYCLOAK_URL || "",
  realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "",
  clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || "",
})

const AUTH_TOKEN_STORAGE_KEY = "keycloak-token"

type RetryableAxiosRequestConfig = AxiosRequestConfig & { _retry?: boolean }

let keycloakInitPromise: Promise<boolean> | null = null
let refreshTokenPromise: Promise<string | null> | null = null
let logoutPromise: Promise<void> | null = null

const isBrowser = () => globalThis.window !== undefined

const persistToken = (token: string | null) => {
  if (!isBrowser()) {
    return
  }

  if (token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
    return
  }

  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}

const getToken = () => {
  if (!isBrowser()) {
    return null
  }

  return keycloak.token ?? localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
}

export const getAuthToken = () => getToken()

export const hasAuthToken = () => Boolean(getAuthToken())

export type AuthTokenClaims = {
  sub?: string
  name?: string
  preferred_username?: string
  given_name?: string
  family_name?: string
  email?: string
  email_verified?: boolean
  realm_access?: {
    roles?: string[]
  }
  resource_access?: Record<string, { roles?: string[] }>
}

const decodeBase64Url = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")

  return globalThis.atob(padded)
}

export const getAuthTokenClaims = (): AuthTokenClaims | null => {
  const token = getAuthToken()

  if (!token) {
    return null
  }

  try {
    const payload = token.split(".")[1]

    if (!payload) {
      return null
    }

    return JSON.parse(decodeBase64Url(payload)) as AuthTokenClaims
  } catch {
    return null
  }
}

const normalizeReturnTo = (returnTo?: string) => {
  if (
    !returnTo ||
    returnTo === "/login" ||
    returnTo.startsWith("/login?") ||
    returnTo.startsWith("/login#")
  ) {
    return "/"
  }

  return returnTo.startsWith("/") ? returnTo : "/"
}

export const buildLoginHref = (returnTo?: string) => {
  const normalizedReturnTo = normalizeReturnTo(returnTo)

  return `/login?returnTo=${encodeURIComponent(normalizedReturnTo)}`
}

export async function startLogin(returnTo?: string) {
  if (!isBrowser()) {
    return
  }

  await initKeycloak()

  const redirectUri = new URL(
    normalizeReturnTo(returnTo),
    globalThis.window.location.origin
  ).toString()

  await keycloak.login({ redirectUri })
}

const normalizePostLogoutRedirect = (returnTo?: string) => {
  if (!returnTo || returnTo.startsWith("/login")) {
    return "/"
  }

  return returnTo.startsWith("/") ? returnTo : "/"
}

export async function startLogout(returnTo?: string) {
  if (!isBrowser()) {
    return
  }

  const redirectPath = normalizePostLogoutRedirect(returnTo)

  persistToken(null)

  try {
    await keycloak.logout({
      redirectUri: new URL(redirectPath, globalThis.window.location.origin).toString(),
    })
  } catch {
    globalThis.window.location.assign(redirectPath)
  }
}

const triggerLogoutOnce = async () => {
  if (!isBrowser()) {
    return
  }

  logoutPromise ??= (async () => {
    await startLogout("/")
  })()

  return logoutPromise
}

export const initKeycloak = () => {
  if (!isBrowser()) {
    return Promise.resolve(false)
  }

  keycloakInitPromise ??= keycloak
    .init({
      onLoad: "check-sso",
    })
    .then((authenticated) => {
      persistToken(keycloak.token ?? null)
      return authenticated
    })
    .catch(() => false)

  return keycloakInitPromise
}

const refreshAccessToken = async () => {
  if (!isBrowser()) {
    return null
  }

  await initKeycloak()

  refreshTokenPromise ??= keycloak
    .updateToken(30)
    .then(() => {
      const nextToken = keycloak.token ?? null
      persistToken(nextToken)
      return nextToken
    })
    .catch(() => {
      persistToken(null)
      return null
    })
    .finally(() => {
      refreshTokenPromise = null
    })

  return refreshTokenPromise
}

AXIOS_INSTANCE.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

AXIOS_INSTANCE.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableAxiosRequestConfig | undefined

    if (
      !originalRequest ||
      error.response?.status !== 401 ||
      originalRequest._retry
    ) {
      if (error.response?.status === 401 && originalRequest?._retry) {
        await triggerLogoutOnce()
      }

      throw error
    }

    originalRequest._retry = true

    const freshToken = await refreshAccessToken()

    if (!freshToken) {
      await triggerLogoutOnce()
      throw error
    }

    originalRequest.headers = originalRequest.headers ?? {}
    originalRequest.headers.Authorization = `Bearer ${freshToken}`

    return AXIOS_INSTANCE(originalRequest)
  },
)

// Мутатор для Orval
export const customInstance = async <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig
): Promise<T> => {
  const { data } = await AXIOS_INSTANCE({
    ...config,
    ...options,
  })
  return data
}
