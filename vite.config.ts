import { devtools } from "@happyseeds/devtools/vite"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Config baseada em @happyseeds/vite-config, mas SEM o plugin @cloudflare/vite-plugin.
// Esse plugin força o build a mirar Cloudflare Workers (gera dist/server/wrangler.json
// e usa o binário workerd no preview), o que quebra em Node.js puro (Railway) com o
// erro "Cannot read properties of undefined (reading 'glibcVersionRuntime')".
// Os imports "#/*" são resolvidos nativamente pelo Node.js/Vite via package.json "imports".
export default defineConfig({
  plugins: [devtools(), tailwindcss(), tanstackStart(), react({ compiler: true })],
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
