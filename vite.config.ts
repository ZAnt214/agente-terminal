import { defineConfig } from "@happyseeds/vite-config"

export default defineConfig({
  server: {
    middlewareMode: true,
    allowedHosts: [
      "agente-terminal-production.up.railway.app",
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
    ],
  },
})
