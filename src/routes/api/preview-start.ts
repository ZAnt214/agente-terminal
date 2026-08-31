import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { getCurrentDir } from "#/agent/exec.server.ts"
import { startPreview } from "#/agent/preview.server.ts"

/**
 * POST /api/preview-start — sobe (ou reinicia) o servidor de desenvolvimento
 * do projeto em que o agente está trabalhando atualmente, e devolve a URL
 * onde ele fica acessível via proxy (/preview/...).
 */
export const Route = createFileRoute("/api/preview-start")({
  server: {
    handlers: {
      POST: async () => {
        const dir = getCurrentDir()
        const result = await startPreview(dir)

        if (!result.ok) {
          return Response.json(
            { ok: false, error: result.error },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          )
        }

        return Response.json(
          { ok: true, url: "/preview/" },
          { headers: { "Cache-Control": "no-store" } },
        )
      },
    },
  },
})
