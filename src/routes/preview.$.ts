import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { getPreviewPort } from "#/agent/preview.server.ts"

/**
 * /preview/* — proxy reverso para o servidor de desenvolvimento ao vivo do
 * projeto atual do agente (iniciado via POST /api/preview-start). Encaminha
 * o caminho e a query string exatamente como recebidos: o processo filho é
 * iniciado com "--base /preview/" (quando é um projeto Vite) para que os
 * caminhos de asset já saiam corretos com esse prefixo.
 *
 * Limitação: não há proxy de WebSocket aqui, então o HMR/live-reload do
 * dev server não funciona através desta rota — só o carregamento normal
 * de páginas e assets via HTTP.
 */
async function proxyToPreview(request: Request): Promise<Response> {
  const port = getPreviewPort()
  if (!port) {
    return new Response(
      "Nenhum preview ativo no momento. Clique em ▶ (play) na conversa para iniciar o servidor de desenvolvimento do projeto.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    )
  }

  const incoming = new URL(request.url)
  const target = `http://127.0.0.1:${port}${incoming.pathname}${incoming.search}`

  const headers = new Headers(request.headers)
  headers.delete("host")

  const hasBody = !(request.method === "GET" || request.method === "HEAD")

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // @ts-expect-error necessário para encaminhar um body em streaming
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
    })

    const resHeaders = new Headers(upstream.headers)
    // Evita inconsistência entre o encoding do upstream e o corpo já decodificado pelo fetch
    resHeaders.delete("content-encoding")
    resHeaders.delete("content-length")

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    })
  } catch {
    return new Response(
      "Não foi possível conectar ao servidor de desenvolvimento. Ele pode ainda estar iniciando — tente novamente em alguns segundos.",
      { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    )
  }
}

export const Route = createFileRoute("/preview/$")({
  server: {
    handlers: {
      GET: ({ request }) => proxyToPreview(request),
      HEAD: ({ request }) => proxyToPreview(request),
      POST: ({ request }) => proxyToPreview(request),
      PUT: ({ request }) => proxyToPreview(request),
      PATCH: ({ request }) => proxyToPreview(request),
      DELETE: ({ request }) => proxyToPreview(request),
    },
  },
})
