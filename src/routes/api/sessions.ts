import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"
import { desc } from "drizzle-orm"
import { getDb, schema } from "#/db/client"

/**
 * Rota para listar sessões e criar novas
 * GET /api/sessions - listar todas
 * POST /api/sessions - criar nova
 */
export const Route = createFileRoute("/api/sessions")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const db = await getDb()
          if (!db) {
            return Response.json(
              { error: "Database not available" },
              { status: 503 },
            )
          }

          const allSessions = await db
            .select()
            .from(schema.sessions)
            .orderBy(desc(schema.sessions.updatedAt))

          return Response.json(allSessions, {
            headers: { "Cache-Control": "no-store" },
          })
        } catch (error) {
          console.error("GET /api/sessions error:", error)
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          )
        }
      },

      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { title?: string }

          const db = await getDb()
          if (!db) {
            return Response.json(
              { error: "Database not available" },
              { status: 503 },
            )
          }

          const result = await db
            .insert(schema.sessions)
            .values({
              title: body.title || "Sem título",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
            .returning()

          const session = result[0]
          return Response.json(session, { status: 201 })
        } catch (error) {
          console.error("POST /api/sessions error:", error)
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          )
        }
      },
    },
  },
})
