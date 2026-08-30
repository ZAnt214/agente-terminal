import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { runAgentLoop, type AgentEvent } from "#/agent/agent.server.ts"

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { goal?: string }
        const goal = (body.goal ?? "").trim()

        if (!goal) {
          return Response.json(
            { error: "empty goal" },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          )
        }

        const encoder = new TextEncoder()

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const emit = (event: AgentEvent) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              )
            }
            try {
              await runAgentLoop(goal, emit)
            } catch (error) {
              emit({
                type: "error",
                message: (error as Error).message ?? String(error),
              })
            } finally {
              controller.close()
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
