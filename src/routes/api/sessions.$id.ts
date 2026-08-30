import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { eq, asc } from "drizzle-orm"
import { getDb, schema } from "#/db/client"

/**
 * GET /api/sessions/:id - obter sessão com suas mensagens
 * PUT /api/sessions/:id - atualizar título
 * DELETE /api/sessions/:id - deletar sessão
 */
export const Route = createFileRoute("/api/sessions/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const sessionId = parseInt(params.id, 10)

          if (!sessionId) {
            return Response.json(
              { error: "Invalid session ID" },
              { status: 400 },
            )
          }

          const db = await getDb()
          if (!db) {
            return Response.json(
              { error: "Database not available" },
              { status: 503 },
            )
          }

          const session = await db.query.sessions.findFirst({
            where: eq(schema.sessions.id, sessionId),
            with: {
              messages: {
                with: {
                  steps: {
                    orderBy: [asc(schema.steps.num)],
                  },
                },
                orderBy: [asc(schema.messages.createdAt)],
              },
            },
          })

          if (!session) {
            return Response.json({ error: "Session not found" }, { status: 404 })
          }

          return Response.json(session, {
            headers: { "Cache-Control": "no-store" },
          })
        } catch (error) {
          console.error("GET /api/sessions/:id error:", error)
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          )
        }
      },

      PUT: async ({ request, params }) => {
        try {
          const sessionId = parseInt(params.id, 10)
          const body = (await request.json()) as { title?: string }

          if (!sessionId) {
            return Response.json(
              { error: "Invalid session ID" },
              { status: 400 },
            )
          }

          const db = await getDb()
          if (!db) {
            return Response.json(
              { error: "Database not available" },
              { status: 503 },
            )
          }

          const result = await db
            .update(schema.sessions)
            .set({
              title: body.title || "Sem título",
              updatedAt: Date.now(),
            })
            .where(eq(schema.sessions.id, sessionId))
            .returning()

          if (result.length === 0) {
            return Response.json({ error: "Session not found" }, { status: 404 })
          }

          return Response.json(result[0], {
            headers: { "Cache-Control": "no-store" },
          })
        } catch (error) {
          console.error("PUT /api/sessions/:id error:", error)
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          )
        }
      },

      DELETE: async ({ params }) => {
        try {
          const sessionId = parseInt(params.id, 10)

          if (!sessionId) {
            return Response.json(
              { error: "Invalid session ID" },
              { status: 400 },
            )
          }

          const db = await getDb()
          if (!db) {
            return Response.json(
              { error: "Database not available" },
              { status: 503 },
            )
          }

          await db
            .delete(schema.sessions)
            .where(eq(schema.sessions.id, sessionId))

          return Response.json({ ok: true }, {
            headers: { "Cache-Control": "no-store" },
          })
        } catch (error) {
          console.error("DELETE /api/sessions/:id error:", error)
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          )
        }
      },
    },
  },
})
