import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

const resolveApiTarget = () => {
  const explicit = process.env.API_PROXY_TARGET || ""

  if (explicit.trim()) {
    return explicit.replace(/\/$/, "")
  }

  const legacy = process.env.NEXT_PUBLIC_API_BASE_URL || ""
  return legacy.replace(/\/$/, "")
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "host",
  "origin",
  "referer",
  "content-length",
])

const buildTargetUrl = (request: NextRequest, path: string[]) => {
  const target = resolveApiTarget()

  if (!target) {
    throw new Error("API proxy target is not configured")
  }

  const suffix = path.map(encodeURIComponent).join("/")
  const query = request.nextUrl.search || ""

  return `${target}/api/v1/${suffix}${query}`
}

const forwardRequest = async (
  request: NextRequest,
  path: string[]
): Promise<Response> => {
  let targetUrl: string

  try {
    targetUrl = buildTargetUrl(request, path)
  } catch {
    return Response.json(
      {
        title: "Proxy configuration error",
        detail: "Set API_PROXY_TARGET in .env.local",
      },
      { status: 500 }
    )
  }

  const headers = new Headers()

  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer()
  }

  const upstream = await fetch(targetUrl, init)
  const responseHeaders = new Headers(upstream.headers)

  responseHeaders.delete("content-encoding")
  responseHeaders.delete("content-length")
  responseHeaders.delete("transfer-encoding")

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return forwardRequest(request, path)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return forwardRequest(request, path)
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return forwardRequest(request, path)
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return forwardRequest(request, path)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return forwardRequest(request, path)
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return forwardRequest(request, path)
}

