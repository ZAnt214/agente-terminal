import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { reactRouter } from "@tanstack/react-router/vite"

export default defineConfig({
  plugins: [react(), reactRouter()],
  server: {
    middlewareMode: true,
    allowedHosts: [
      "agente-terminal-production.up.railway.app",
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
    ],
  },
  ssr: {
    external: ["better-sqlite3"],
  },
})
