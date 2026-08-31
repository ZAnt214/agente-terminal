import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { executeCommand } from "#/agent/exec.server.ts"

interface ExecRequest {
  command: string
}

/**
 * Shell usado pelo painel de terminal. Delega para o mesmo simulador que o
 * agente usa (exec.server.ts), garantindo que o painel direto e o agente
 * compartilhem exatamente as mesmas ferramentas (git, gh, npm, etc).
 *
 * O preview roda em Cloudflare Workers, onde o spawn de processos reais é
 * bloqueado pelo runtime; por isso usamos um shell de demonstração
 * determinístico. Em um servidor Node.js local, troque o corpo por:
 *   const child = spawn(command, { shell: true })
 * e encaminhe child.stdout/child.stderr linha a linha — sem mudanças no cliente.
 */
function looksLikeError(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return /^(bash:|git:|npm:|node:|gh:|fatal:|error:|não foi possível)/i.test(t)
}

export const Route = createFileRoute("/api/exec")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ExecRequest
        const command = (body.command ?? "").trim()

        if (!command) {
          return Response.json(
            { error: "empty command" },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          )
        }

        const text = await executeCommand(command)
        const isError = looksLikeError(text)
        const encoder = new TextEncoder()

        // Se o cliente desconectar no meio do streaming (fechar aba, refresh,
        // abortar), o controller já estará fechado — enqueue()/close() nele
        // lançam "Invalid state" e, por acontecer dentro do callback
        // assíncrono do ReadableStream, isso escapa como exceção não tratada
        // e derruba o processo inteiro. streamClosed evita isso.
        let streamClosed = false

        const stream = new ReadableStream<Uint8Array>({
          cancel() {
            streamClosed = true
          },
          async start(controller) {
            const safeEnqueue = (chunk: Uint8Array) => {
              if (streamClosed) return
              try {
                controller.enqueue(chunk)
              } catch {
                streamClosed = true
              }
            }

            if (text) {
              const streamKind = isError ? "stderr" : "stdout"
              for (const line of text.split("\n")) {
                if (!line || streamClosed) continue
                safeEnqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ stream: streamKind, text: line + "\n" })}\n\n`,
                  ),
                )
                // Pequenos atrasos dão a sensação de saída em tempo real.
                await new Promise((r) => setTimeout(r, 30))
              }
            }
            safeEnqueue(
              encoder.encode(
                `data: ${JSON.stringify({ stream: "exit", code: isError ? 1 : 0 })}\n\n`,
              ),
            )
            if (!streamClosed) {
              try {
                controller.close()
              } catch {
                // Stream já fechado pelo cliente — ok, ignora.
              }
            }
          },
        })

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          },
        })
      },
    },
  },
})
