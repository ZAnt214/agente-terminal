import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { eq } from "drizzle-orm"
import {
  runAgentLoop,
  type AgentEvent,
  type ChatTurn,
} from "#/agent/agent.server.ts"
import { getDb, schema } from "#/db/client"

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          goal?: string
          history?: ChatTurn[]
          sessionId?: number
        }
        const goal = (body.goal ?? "").trim()
        const history = Array.isArray(body.history) ? body.history : []
        const sessionId = body.sessionId

        if (!goal) {
          return Response.json(
            { error: "empty goal" },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          )
        }

        const encoder = new TextEncoder()
        let messageId: number | null = null
        let stepNum = 0
        let currentStepId: number | null = null

        // Se o cliente desconectar (fechar a aba, dar refresh, abortar) antes
        // do agente terminar, o controller do stream já estará fechado —
        // enqueue()/close() nele lançam "Invalid state" e, como isso acontece
        // dentro de um callback assíncrono do ReadableStream, o erro escapa
        // como exceção não tratada e derruba o processo inteiro. streamClosed
        // evita tentar mexer no controller depois de fechado.
        let streamClosed = false

        const stream = new ReadableStream<Uint8Array>({
          cancel() {
            streamClosed = true
          },
          async start(controller) {
            const db = await getDb()

            // Criar mensagem do usuário se houver sessionId
            if (db && sessionId) {
              await db
                .insert(schema.messages)
                .values({
                  sessionId,
                  role: "user",
                  content: goal,
                  status: "done",
                  createdAt: Date.now(),
                })
                .returning()

              // Criar mensagem do assistente (que será preenchida com os steps)
              const assistantMsg = await db
                .insert(schema.messages)
                .values({
                  sessionId,
                  role: "assistant",
                  content: "",
                  status: "running",
                  createdAt: Date.now(),
                })
                .returning()

              messageId = assistantMsg[0]?.id ?? null
            }

            const emit = async (event: AgentEvent) => {
              if (!streamClosed) {
                try {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
                  )
                } catch {
                  // Cliente já desconectou entre a checagem e o enqueue — ok, ignora.
                  streamClosed = true
                }
              }

              // Salvar events no banco
              if (!db || !messageId) return

              if (event.type === "thought") {
                stepNum++
                const step = await db
                  .insert(schema.steps)
                  .values({
                    messageId,
                    num: stepNum,
                    thought: event.text ?? "",
                    command: "",
                    logs: "",
                    running: 1,
                    createdAt: Date.now(),
                  })
                  .returning()
                currentStepId = step[0]?.id ?? null
              } else if (event.type === "command" && currentStepId) {
                await db
                  .update(schema.steps)
                  .set({ command: event.command ?? "" })
                  .where(eq(schema.steps.id, currentStepId))
              } else if (event.type === "log" && currentStepId) {
                const step = await db.query.steps.findFirst({
                  where: eq(schema.steps.id, currentStepId),
                })

                if (step) {
                  await db
                    .update(schema.steps)
                    .set({ logs: step.logs + (event.text ?? "") })
                    .where(eq(schema.steps.id, currentStepId))
                }
              } else if (event.type === "done" && messageId) {
                if (currentStepId) {
                  await db
                    .update(schema.steps)
                    .set({ running: 0 })
                    .where(eq(schema.steps.id, currentStepId))
                }

                await db
                  .update(schema.messages)
                  .set({
                    content: event.summary ?? "Objetivo concluído.",
                    status: "done",
                  })
                  .where(eq(schema.messages.id, messageId))

                if (sessionId) {
                  await db
                    .update(schema.sessions)
                    .set({ updatedAt: Date.now() })
                    .where(eq(schema.sessions.id, sessionId))
                }
              } else if (event.type === "error" && messageId) {
                if (currentStepId) {
                  await db
                    .update(schema.steps)
                    .set({ running: 0 })
                    .where(eq(schema.steps.id, currentStepId))
                }

                await db
                  .update(schema.messages)
                  .set({
                    content: event.message ?? "Erro ao executar.",
                    status: "error",
                  })
                  .where(eq(schema.messages.id, messageId))

                if (sessionId) {
                  await db
                    .update(schema.sessions)
                    .set({ updatedAt: Date.now() })
                    .where(eq(schema.sessions.id, sessionId))
                }
              }
            }

            try {
              await runAgentLoop(goal, emit, history)
            } catch (error) {
              await emit({
                type: "error",
                message: (error as Error).message ?? String(error),
              })
            } finally {
              if (!streamClosed) {
                try {
                  controller.close()
                } catch {
                  // Stream já fechado pelo cliente — ok, ignora.
                }
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
