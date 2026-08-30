import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
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

        const stream = new ReadableStream<Uint8Array>({
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
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              )

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
                  .where((steps: any) => steps.id === currentStepId)
              } else if (event.type === "log" && currentStepId) {
                const step = (await db.query.steps.findFirst({
                  where: (steps: any) => steps.id === currentStepId,
                })) as any

                if (step) {
                  await db
                    .update(schema.steps)
                    .set({ logs: step.logs + (event.text ?? "") })
                    .where((steps: any) => steps.id === currentStepId)
                }
              } else if (event.type === "done" && messageId) {
                if (currentStepId) {
                  await db
                    .update(schema.steps)
                    .set({ running: 0 })
                    .where((steps: any) => steps.id === currentStepId)
                }

                await db
                  .update(schema.messages)
                  .set({
                    content: event.summary ?? "Objetivo concluído.",
                    status: "done",
                  })
                  .where((messages: any) => messages.id === messageId)

                if (sessionId) {
                  await db
                    .update(schema.sessions)
                    .set({ updatedAt: Date.now() })
                    .where((sessions: any) => sessions.id === sessionId)
                }
              } else if (event.type === "error" && messageId) {
                if (currentStepId) {
                  await db
                    .update(schema.steps)
                    .set({ running: 0 })
                    .where((steps: any) => steps.id === currentStepId)
                }

                await db
                  .update(schema.messages)
                  .set({
                    content: event.message ?? "Erro ao executar.",
                    status: "error",
                  })
                  .where((messages: any) => messages.id === messageId)

                if (sessionId) {
                  await db
                    .update(schema.sessions)
                    .set({ updatedAt: Date.now() })
                    .where((sessions: any) => sessions.id === sessionId)
                }
              }
            }

            try {
              await runAgentLoop(goal, emit, history)
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
