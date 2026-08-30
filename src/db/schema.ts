import { sqliteTable as table, text, integer, real } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"

/**
 * Sessions: Conversas/sessões do agente
 * Cada sessão é uma conversa independente com histórico próprio
 */
export const sessions = table("sessions", {
  id: integer().primaryKey({ autoIncrement: true }),
  title: text().notNull().default("Sem título"),
  createdAt: real().notNull().$default(() => Date.now()),
  updatedAt: real().notNull().$default(() => Date.now()),
})

/**
 * Messages: Mensagens do chat (user ou assistant)
 * Referencia uma sessão
 */
export const messages = table("messages", {
  id: integer().primaryKey({ autoIncrement: true }),
  sessionId: integer()
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: text().notNull(), // "user" ou "assistant"
  content: text().notNull(),
  status: text().notNull().default("done"), // "running", "done", "error"
  createdAt: real().notNull().$default(() => Date.now()),
})

/**
 * Steps: Passos de execução do agente (thought → command → log)
 * Um step é uma iteração do ReAct loop
 * Referencia uma mensagem do agente
 */
export const steps = table("steps", {
  id: integer().primaryKey({ autoIncrement: true }),
  messageId: integer()
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  num: integer().notNull(), // número sequencial (1, 2, 3...)
  thought: text().notNull(), // raciocínio da IA
  command: text().notNull().default(""),
  logs: text().notNull().default(""),
  running: integer().notNull().default(0), // 0=false, 1=true
  createdAt: real().notNull().$default(() => Date.now()),
})

/**
 * Relations
 */
export const sessionsRelations = relations(sessions, ({ many }) => ({
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one, many }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
  steps: many(steps),
}))

export const stepsRelations = relations(steps, ({ one }) => ({
  message: one(messages, {
    fields: [steps.messageId],
    references: [messages.id],
  }),
}))
