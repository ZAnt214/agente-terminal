import "@tanstack/react-start/server-only"

interface SimFile {
  name: string
  content: string
}

/**
 * Sistema de arquivos simulado do shell de demonstração. Mantém um estado
 * mínimo (criação de arquivos) para que o agente consiga concluir objetivos.
 */
let virtualFs: Record<string, SimFile> = {}
let projectDir = "/home/you/dev"

function resetFs() {
  virtualFs = {
    "package.json": {
      name: "package.json",
      content: `{\n  "name": "meu-app",\n  "version": "0.0.0",\n  "type": "module",\n  "scripts": { "dev": "vite", "build": "vite build" }\n}`,
    },
    "src/index.tsx": {
      name: "src/index.tsx",
      content: `import React from "react"\nimport { createRoot } from "react-dom/client"\n\ncreateRoot(document.getElementById("root")!).render(<h1>meu-app</h1>)`,
    },
    "vite.config.ts": {
      name: "vite.config.ts",
      content: `import { defineConfig } from "vite"\nimport react from "@vitejs/plugin-react"\n\nexport default defineConfig({ plugins: [react()] })`,
    },
    "src/styles.css": {
      name: "src/styles.css",
      content: `@import "tailwindcss";`,
    },
    "tailwind.config.js": {
      name: "tailwind.config.js",
      content: `/** @type {import('tailwindcss').Config} */\nexport default { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] }`,
    },
  }
}
resetFs()

/**
 * Executa um comando de terminal e devolve todo o log (stdout + stderr)
 * concatenado, como o agente precisa para ler o resultado.
 *
 * Nota de plataforma: o preview roda em Cloudflare Workers, onde o spawn de
 * processos reais é bloqueado pelo runtime. Por isso usamos um shell de
 * demonstração determinístico. Em um servidor Node.js local, troque o corpo
 * por:
 *
 *   import { spawn } from "node:child_process"
 *   const child = spawn(command, { shell: true })
 *   let logs = ""
 *   child.stdout.on("data", (d) => (logs += d.toString()))
 *   child.stderr.on("data", (d) => (logs += d.toString()))
 *   return await new Promise((resolve, reject) => {
 *     child.on("error", reject)
 *     child.on("close", (code) => resolve(logs.trim()))
 *   })
 */
export async function executeCommand(command: string): Promise<string> {
  const args = command.split(/\s+/).filter(Boolean)
  const cmd = args[0]?.toLowerCase() ?? ""
  const rest = args.slice(1)
  const arg = rest.join(" ")

  // Comandos compostos com &&: executa cada parte em sequência.
  if (command.includes("&&")) {
    const parts = command.split("&&").map((p) => p.trim())
    const outputs: string[] = []
    for (const part of parts) {
      if (part) outputs.push(await executeCommand(part))
    }
    return outputs.filter(Boolean).join("\n")
  }

  // Criador de projetos via npx (create-react-app / vite).
  if (cmd === "npx") {
    const lower = command.toLowerCase()
    if (lower.includes("create-react-app") || lower.includes("vite")) {
      const name = arg.match(/meu-app|(\w+)/)?.[1] ?? "meu-app"
      projectDir += "/" + name
      return [
        `Creating a new React app in ${projectDir}.`,
        "",
        "Installing packages. This might take a couple of minutes.",
        "added 1422 packages in 38s",
        `Success! Created ${name} at ${projectDir}`,
        "Inside that directory, you can run several commands:",
        "  npm start / npm run dev",
        "  npm run build",
        "We suggest that you begin by typing:",
        `  cd ${name}`,
        "  npm start",
      ].join("\n")
    }
    return `npx: não foi possível baixar o pacote ${arg}`
  }

  // Gerenciador de pacotes npm.
  if (cmd === "npm") {
    if (arg === "-v" || arg === "--version") return "10.9.2"
    if (arg.includes("create vite")) {
      const name = arg.match(/vite@latest\s+(\S+)/)?.[1] ?? "meu-app"
      projectDir += "/" + name
      return [
        "Scaffolding project in " + projectDir + "...",
        "Done. Now run:",
        "  cd " + name,
        "  npm install",
      ].join("\n")
    }
    if (arg === "init -y" || arg === "init") {
      return 'Wrote to package.json:\n{\n  "name": "meu-app",\n  "version": "0.0.0"\n}'
    }
    if (arg.includes("create-react-app")) {
      const name = arg.match(/(\S+)\s*$/)?.[1] ?? "meu-app"
      projectDir += "/" + name
      return [
        `Creating a new React app in ${projectDir}.`,
        "added 1422 packages in 38s",
        `Success! Created ${name} at ${projectDir}`,
      ].join("\n")
    }
    if (arg === "install" || arg === "i") {
      return [
        "npm install",
        "added 154 packages, and audited 155 packages in 3s",
        "found 0 vulnerabilities",
      ].join("\n")
    }
    if (arg.includes("tailwind")) {
      return [
        "npm install tailwindcss @tailwindcss/vite",
        "added 14 packages in 2s",
        "Configured @tailwindcss/vite plugin.",
        "created src/styles.css",
        "Tailwind CSS instalado e configurado com sucesso.",
      ].join("\n")
    }
    if (
      arg === "install -g create-react-app" ||
      arg === "install -g npm" ||
      arg === "install -g npm@latest"
    ) {
      return "added 1 package in 1s"
    }
    if (arg === "run dev" || arg === "run dev -- --host") {
      return [
        "> meu-app@0.0.0 dev",
        "  VITE v8.2.2  ready in 320 ms",
        "  ➜  Local:   http://localhost:5173/",
        "  ➜  Network: http://192.168.1.10:5173/",
      ].join("\n")
    }
    if (arg.startsWith("run build")) {
      return [
        "> meu-app@0.0.0 build",
        "vite v8.2.2 building for production...",
        "transforming...",
        "✓ 2156 modules transformed.",
        "dist/index.html                 0.39 kB │ gzip:  0.26 kB",
        "dist/assets/index-jgkkjtIl.js  429.63 kB │ gzip: 135.03 kB",
        "✓ built in 2.03s",
      ].join("\n")
    }
    return `npm: subcomando não reconhecido: ${arg || "(nenhum)"}`
  }

  // sudo: apenas repassa o comando.
  if (cmd === "sudo") {
    return await executeCommand(rest.join(" "))
  }

  // Variações de "cd": move para o diretório do projeto simulado.
  if (cmd === "cd") {
    if (arg && arg !== ".." && arg !== "/" && arg !== "~") {
      projectDir += "/" + arg.replace(/^\//, "").replace(/\/$/, "")
    }
    return `(pwd atualizado: ${projectDir})`
  }
  if (cmd === "pwd") return projectDir

  // Versões de ferramentas instaladas.
  if (cmd === "node") {
    if (arg === "-v" || arg === "--version") return "v22.14.0"
    if (arg.startsWith("--version")) return "v22.14.0"
    return `node: uso incorreto dos argumentos: ${arg}`
  }

  // Listar / ler arquivos do sistema de arquivos virtual.
  if (cmd === "ls" || cmd === "dir") {
    const names = Object.keys(virtualFs)
    if (names.length === 0) return ""
    return names.join("\n")
  }
  if (cmd === "cat") {
    const file = arg.replace(/^\.\//, "")
    if (virtualFs[file]) return virtualFs[file].content
    return `cat: ${arg}: No such file or directory`
  }
  if (cmd === "mkdir") {
    virtualFs[arg.replace(/\/$/, "")] = { name: arg, content: "" }
    return `(diretório ${arg} criado)`
  }
  if (cmd === "touch") {
    virtualFs[arg] = virtualFs[arg] ?? { name: arg, content: "" }
    return `(arquivo ${arg} atualizado)`
  }

  // Git simulado.
  if (cmd === "git") {
    if (arg === "status")
      return "On branch main\nnothing to commit, working tree clean"
    if (arg === "init")
      return `Initialized empty Git repository in ${projectDir}/.git/`
    if (arg === "log")
      return `commit bdcda48a (HEAD -> main)\nAuthor: you\nDate: Sat Aug 30 16:26:00 2026`
    if (arg.startsWith("add")) return "(arquivos adicionados à staging)"
    if (arg.startsWith("commit"))
      return `[main ${(Math.random() * 1e7).toFixed(0)}] commit feito`
    return `git: subcomando não reconhecido: ${arg || "(nenhum)"}`
  }

  // Utilitários comuns de verificação de ambiente.
  if (cmd === "which" || cmd === "command") {
    if (arg.includes("node")) return "/usr/local/bin/node"
    if (arg.includes("npm")) return "/usr/local/bin/npm"
    if (arg.includes("git")) return "/usr/local/bin/git"
    return `which: no ${arg} in (PATH)`
  }
  if (cmd === "echo") return arg
  if (cmd === "whoami") return "you"
  if (cmd === "date") return new Date().toString()
  if (cmd === "clear") return ""

  // Ferramentas de configuração de Tailwind.
  if (cmd === "tailwindcss") {
    return [
      "tailwindcss v4",
      "Detected PostCSS and Vite.",
      "✓ Wrote tailwind.config.js",
      "✓ Wrote src/styles.css",
    ].join("\n")
  }

  return `bash: ${cmd}: command not found`
}
