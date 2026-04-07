import axios, { type AxiosRequestConfig } from "axios"

export const AXIOS_INSTANCE = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

AXIOS_INSTANCE.interceptors.request.use((config) => {
  const token =
    globalThis.window === undefined
      ? null
      : localStorage.getItem("keycloak-token")

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// Мутатор Orval должен быть экспортированной функцией с установленным именем
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
