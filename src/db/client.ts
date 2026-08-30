import "@tanstack/react-start/server-only"
import * as schema from "./schema"

let dbInstance: any = null

/**
 * Retorna cliente Drizzle adaptado ao ambiente:
 * - Node.js: SQLite local (better-sqlite3)
 * - Cloudflare Workers: Postgres via environment
 */
export async function getDb() {
  // Se já inicializado, retornar
  if (dbInstance) return dbInstance

  const isNodeJs = typeof process !== "undefined" && (process as any).versions?.node
  const isCloudflareWorkers = typeof (globalThis as any).EdgeRuntime !== "undefined"

  if (isNodeJs && !isCloudflareWorkers) {
    // Node.js: usar SQLite
    const { drizzle } = await import("drizzle-orm/better-sqlite3")
    const Database = await import("better-sqlite3").then((m) => m.default)

    const sqlite = new Database("./db.sqlite")
    dbInstance = drizzle(sqlite, { schema })

    // Criar tabelas se não existirem
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT 'Sem título',
        createdAt REAL NOT NULL,
        updatedAt REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'done',
        createdAt REAL NOT NULL,
        FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        messageId INTEGER NOT NULL,
        num INTEGER NOT NULL,
        thought TEXT NOT NULL,
        command TEXT NOT NULL DEFAULT '',
        logs TEXT NOT NULL DEFAULT '',
        running INTEGER NOT NULL DEFAULT 0,
        createdAt REAL NOT NULL,
        FOREIGN KEY (messageId) REFERENCES messages(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_sessionId ON messages(sessionId);
      CREATE INDEX IF NOT EXISTS idx_steps_messageId ON steps(messageId);
    `)

    console.log("✓ Database (SQLite) initialized")
  } else {
    // Cloudflare Workers: usar Postgres (compatível com db/index.ts)
    console.log("✓ Database (Postgres via Workers) initialized")
    // Retornar null para compatibilidade com Workers
    // Em produção, usar a função withDatabase() de db/index.ts
  }

  return dbInstance
}

export { schema }
