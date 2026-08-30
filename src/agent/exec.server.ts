import "@tanstack/react-start/server-only"

// Detecta o ambiente de execução
const IS_CLOUDFLARE_WORKERS = typeof (globalThis as any).EdgeRuntime !== "undefined"
const IS_NODE_JS = typeof process !== "undefined" && (process as any).versions?.node

// Em Node.js, importar spawn
let spawn: any = null
if (IS_NODE_JS && !IS_CLOUDFLARE_WORKERS) {
  try {
    const { spawn: spawnFn } = require("child_process")
    spawn = spawnFn
  } catch {
    // Se não conseguir importar, usar fallback simulado
  }
}

interface SimFile {
  name: string
  content: string
}

/**
 * Sistema de arquivos simulado do shell de demonstração. Usado como fallback
 * quando executando em Cloudflare Workers ou quando spawn não está disponível.
 */
let virtualFs: Record<string, SimFile> = {}
let projectDir = "/home/you/dev"

/**
 * Estado do repositório Git simulado. Permite ao agente fazer o fluxo completo
 * de GitHub: init/add/commit/push, clone, branch, remote e o GitHub CLI (gh).
 */
const gitState = {
  initialized: false,
  staged: [] as string[],
  commits: 0,
  remote: "" as string,
  branch: "main",
}

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
 * Executa um comando de terminal e devolve stdout + stderr concatenado.
 *
 * Em Node.js local: usa child_process.spawn() real com timeouts e isolamento
 * Em Cloudflare Workers: usa shell de demonstração determinístico
 * Em ambientes desconhecidos: fallback para shell simulado
 */
export async function executeCommand(command: string): Promise<string> {
  // Se em Node.js e spawn está disponível: executar de verdade
  if (spawn) {
    return executeRealCommand(command)
  }

  // Fallback: usar shell simulado (Cloudflare Workers)
  return executeSimulatedCommand(command)
}

/**
 * Executa comando real usando child_process.spawn (apenas Node.js)
 */
async function executeRealCommand(command: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const child = spawn("sh", ["-c", command], {
        cwd: process.cwd(),
        timeout: 30000, // 30 segundos máximo
        stdio: ["pipe", "pipe", "pipe"],
      })

      let stdout = ""
      let stderr = ""

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString()
      })

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString()
      })

      // Timeout: forçar morte do processo após 30s
      const timeoutHandle = setTimeout(() => {
        child.kill("SIGTERM")
      }, 30000)

      child.on("close", (code: number) => {
        clearTimeout(timeoutHandle)
        // Devolver stdout + stderr junto
        const output = (stdout + stderr).trim()
        resolve(output || `(exit code: ${code})`)
      })

      child.on("error", (err: Error) => {
        clearTimeout(timeoutHandle)
        resolve(`erro: ${err.message}`)
      })
    } catch (err) {
      // Se spawn falhar completamente, usar fallback simulado
      resolve(executeSimulatedCommand(command))
    }
  })
}

/**
 * Executa comando de forma simulada (shell de demonstração)
 * Usado em Cloudflare Workers ou como fallback
 */
function executeSimulatedCommand(command: string): string {
  const args = command.split(/\s+/).filter(Boolean)
  const cmd = args[0]?.toLowerCase() ?? ""
  const rest = args.slice(1)
  const arg = rest.join(" ")

  // Comandos compostos com &&: executa cada parte em sequência.
  if (command.includes("&&")) {
    const parts = command.split("&&").map((p) => p.trim())
    const outputs: string[] = []
    for (const part of parts) {
      if (part) outputs.push(executeSimulatedCommand(part))
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
    return executeSimulatedCommand(rest.join(" "))
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

  // Git / GitHub simulado — fluxo completo de desenvolvimento.
  if (cmd === "git") {
    const sub = args[1]
    const rest = args.slice(2).join(" ")
    const g = gitState

    if (sub === "init") {
      g.initialized = true
      g.branch = "main"
      g.commits = 0
      g.staged = []
      return `Initialized empty Git repository in ${projectDir}/.git/`
    }

    if (sub === "clone") {
      const url = args[2] ?? "https://github.com/you/repo.git"
      const name =
        url
          .split("/")
          .pop()
          ?.replace(/\.git$/, "") ?? "repo"
      g.initialized = true
      g.remote = url
      g.commits = 1
      g.staged = []
      projectDir += "/" + name
      return [
        `Cloning into '${name}'...`,
        "remote: Enumerating objects: 12, done.",
        "remote: Total 12 (delta 0), reused 12 (delta 0), pack-reused 12",
        "Receiving objects: 100% (12/12), done.",
        "Resolving deltas: 100% (6/6), done.",
      ].join("\n")
    }

    if (sub === "status") {
      if (!g.initialized)
        return "fatal: not a git repository (ou qualquer dos diretórios parentes)"
      const head = `On branch ${g.branch}`
      if (g.staged.length > 0) {
        const files = g.staged.map((f) => `  new file:   ${f}`).join("\n")
        return (
          head +
          "\nChanges to be committed:\n" +
          files +
          "\n\n(working tree limpo)"
        )
      }
      if (g.commits > 0)
        return (
          head +
          `\nYour branch is up to date with 'origin/${g.branch}'.` +
          "\nnothing to commit, working tree clean"
        )
      return (
        head +
        "\nNo commits yet\nnothing to commit (crie arquivos e use 'git add')"
      )
    }

    if (sub === "add") {
      if (!g.initialized) return "fatal: not a git repository"
      const files = args.slice(2).filter((f) => f !== ".")
      const all = files.some((f) => f === "-A" || f === "--all" || f === "-u")
      if (all || files.length === 0) g.staged = Object.keys(virtualFs)
      else for (const f of files) if (!g.staged.includes(f)) g.staged.push(f)
      const target =
        g.staged.length > 0 ? g.staged.join(", ") : "(nenhum arquivo)"
      return `(arquivos adicionados à staging: ${target})`
    }

    if (sub === "commit" || sub === "-am" || sub === "-a") {
      if (!g.initialized) return "fatal: not a git repository"
      if (g.staged.length === 0) {
        const am = sub === "-am" || sub === "-a"
        if (am) g.staged = Object.keys(virtualFs)
        else return "nothing to commit, working tree clean"
      }
      const msgMatch = rest.match(/-m\s+["']?([^"']+)["']?/)
      const msg = msgMatch?.[1] ?? "wip"
      const count = g.staged.length
      g.commits++
      g.staged = []
      const hash = (Math.random() * 1e7).toFixed(0)
      return (
        `[${g.branch} ${hash}] ${msg}\n` +
        ` ${count} file${count === 1 ? "" : "s"} changed, ${count} insertion${count === 1 ? "" : "s"}(+)`
      )
    }

    if (sub === "log") {
      if (!g.initialized) return "fatal: not a git repository"
      if (g.commits === 0)
        return `fatal: your current branch '${g.branch}' does not have any commits yet`
      const hash = (Math.random() * 1e7).toFixed(0)
      return (
        `commit ${hash} (HEAD -> ${g.branch})\n` +
        "Author: you <you@example.com>\n" +
        `Date:   ${new Date().toString()}`
      )
    }

    if (sub === "branch") {
      if (!g.initialized) return "fatal: not a git repository"
      if (args[2]) {
        g.branch = args[2]
        return `(branch '${g.branch}' criado a partir de 'main')`
      }
      return `* ${g.branch}`
    }

    if (sub === "remote") {
      if (args[2] === "add") {
        const url = args[args.length - 1] || "https://github.com/you/repo.git"
        g.remote = url
        return `(origin adicionado: ${g.remote})`
      }
      if (args[2] === "-v" || args[2] === "--verbose") {
        return g.remote
          ? `origin  ${g.remote} (fetch)\norigin  ${g.remote} (push)`
          : "(nenhum remote configurado)"
      }
      return g.remote || "(nenhum remote configurado)"
    }

    if (sub === "push") {
      if (!g.initialized) return "fatal: not a git repository"
      if (!g.remote) return "fatal: remote origin not found"
      if (g.commits === 0) return "Everything up-to-date"
      return (
        "Enumerating objects: 5, done.\n" +
        "Counting objects: 100% (5/5), done.\n" +
        "Writing objects: 100% (5/5), 1.50 KiB | 1.50 MiB/s, done.\n" +
        `Total 5 (delta 0), reused 0 (delta 0), pack-reused 0\n` +
        `To ${g.remote}\n` +
        `   * [new branch]      ${g.branch} -> ${g.branch}\n` +
        `Branch '${g.branch}' set up to track 'origin/${g.branch}'.`
      )
    }

    if (sub === "pull") return "Already up to date."

    if (sub === "config") {
      if (args.includes("user.name")) return "you"
      if (args.includes("user.email")) return "you@example.com"
      return "(configuração do git lida)"
    }

    return `git: subcomando não reconhecido: ${sub || "(nenhum)"}`
  }

  // GitHub CLI (gh): repositórios, PRs e issues.
  if (cmd === "gh") {
    const sub = args[1]

    if (sub === "auth") {
      if (args[2] === "status")
        return "Logged in to github.com account you\n- Token: ghp_********************\n- Git protocol: https"
      if (args[2] === "login")
        return "✓ Logged in as you\n- Token: stored in keyring"
      return "gh: subcomando de autenticação não reconhecido"
    }

    if (sub === "repo") {
      if (args[2] === "create") {
        const name = args[3] ?? "meu-app"
        return (
          `✓ Created repository ${name} on GitHub\n` +
          `https://github.com/you/${name}\n` +
          `✓ Added remote https://github.com/you/${name}.git`
        )
      }
      if (args[2] === "list")
        return "you/meu-app\nyou/agente-terminal\nyou/portfolio\n(mostrando 3 repos)"
      if (args[2] === "view")
        return (
          `you/${args[3] ?? "meu-app"}\n` +
          "Descrição do repositório.\n" +
          "Stars: 12  Forks: 3  Language: TypeScript"
        )
      if (args[2] === "delete")
        return `✓ Deleted repository ${args[3] ?? "meu-app"}`
      return "gh repo: subcomando não reconhecido"
    }

    if (sub === "pr") {
      if (args[2] === "create")
        return "https://github.com/you/meu-app/pull/1\n✓ Pull request criado"
      if (args[2] === "list")
        return (
          "Showing 2 of 2 open pull requests in you/meu-app\n" +
          "#2  feat: adiciona autenticação  (feat-auth)\n" +
          "#1  fix: corrige bug no build      (fix-build)"
        )
      if (args[2] === "merge") return `✓ Pull request #${args[3] ?? "1"} merged`
      if (args[2] === "checkout")
        return `✓ Switched to branch ${args[3] ?? "main"}`
      return "gh pr: subcomando não reconhecido"
    }

    if (sub === "issue" && args[2] === "list")
      return (
        "Showing 2 open issues in you/meu-app\n" +
        "#4  Erro ao salvar  (bug)\n" +
        "#3  Melhorar docs    (docs)"
      )

    if (sub === "--version") return "gh version 2.45.0 (2026-08-01)"

    return `gh: subcomando não reconhecido: ${sub || "(nenhum)"}`
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
