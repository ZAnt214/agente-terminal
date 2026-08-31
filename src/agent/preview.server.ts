import "@tanstack/react-start/server-only"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { getSafeEnv } from "./security"

/**
 * Gerencia um único processo de servidor de desenvolvimento (preview ao vivo)
 * por vez, para o projeto em que o agente está trabalhando. Clicar em "play"
 * de novo substitui o preview anterior.
 */
interface PreviewState {
  process: ChildProcess | null
  port: number | null
  dir: string | null
  logs: string
}

const state: PreviewState = {
  process: null,
  port: null,
  dir: null,
  logs: "",
}

/** Porta alta aleatória, para reduzir chance de colisão entre execuções. */
function pickPort(): number {
  return 30000 + Math.floor(Math.random() * 9000)
}

interface DevInfo {
  isVite: boolean
}

/** Verifica se a pasta tem um script "dev" e detecta se é um projeto Vite. */
function detectDevScript(dir: string): DevInfo | null {
  const pkgPath = join(dir, "package.json")
  if (!existsSync(pkgPath)) return null

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    if (!pkg.scripts?.dev) return null

    const isVite =
      existsSync(join(dir, "vite.config.ts")) ||
      existsSync(join(dir, "vite.config.js")) ||
      Boolean(pkg.dependencies?.vite) ||
      Boolean(pkg.devDependencies?.vite)

    return { isVite }
  } catch {
    return null
  }
}

export type StartPreviewResult =
  | { ok: true; port: number }
  | { ok: false; error: string }

/**
 * Inicia (ou reinicia) o servidor de desenvolvimento do projeto atual do
 * agente e aguarda até detectar em qual porta ele subiu.
 *
 * Limitação conhecida: HMR/live-reload via WebSocket não é proxeado (só
 * requisições HTTP comuns), então após o agente alterar arquivos pode ser
 * necessário recarregar a aba manualmente. Prefixo de base "/preview/" só é
 * aplicado automaticamente para projetos Vite — outros frameworks podem ter
 * caminhos de asset quebrados quando proxeados.
 */
export async function startPreview(dir: string): Promise<StartPreviewResult> {
  stopPreview()

  const info = detectDevScript(dir)
  if (!info) {
    return {
      ok: false,
      error:
        'Não encontrei um script "dev" em package.json nesta pasta. Peça ao agente para criar/scaffoldar um projeto antes de usar o preview.',
    }
  }

  if (!existsSync(join(dir, "node_modules"))) {
    return {
      ok: false,
      error:
        'As dependências do projeto ainda não foram instaladas. Peça ao agente para rodar "npm install" primeiro.',
    }
  }

  const port = pickPort()
  state.dir = dir
  state.logs = ""

  const args = ["run", "dev"]
  if (info.isVite) {
    args.push(
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
      "--base",
      "/preview/",
    )
  }

  const child = spawn("npm", args, {
    cwd: dir,
    env: getSafeEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  })
  state.process = child

  return new Promise((resolve) => {
    let settled = false

    const finish = (result: StartPreviewResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutHandle)
      resolve(result)
    }

    const timeoutHandle = setTimeout(() => {
      finish({
        ok: false,
        error: "Tempo esgotado esperando o servidor de desenvolvimento iniciar (30s).",
      })
    }, 30000)

    const onData = (data: Buffer) => {
      const text = data.toString()
      state.logs += text
      if (settled) return

      const match = text.match(/(?:https?:\/\/)?(?:127\.0\.0\.1|localhost):(\d+)/)
      if (match) {
        state.port = Number(match[1])
        finish({ ok: true, port: state.port })
      }
    }

    child.stdout?.on("data", onData)
    child.stderr?.on("data", onData)

    child.on("error", (err: Error) => {
      finish({ ok: false, error: `Falha ao iniciar: ${err.message}` })
    })

    child.on("close", (code: number | null) => {
      if (state.process === child) {
        state.process = null
        state.port = null
      }
      finish({
        ok: false,
        error: `O servidor encerrou antes de iniciar (código ${code}).\n${state.logs.slice(-1500)}`,
      })
    })
  })
}

/** Encerra o preview ativo, se houver. */
export function stopPreview(): void {
  if (state.process) {
    try {
      state.process.kill("SIGTERM")
    } catch {
      // processo já pode ter encerrado
    }
  }
  state.process = null
  state.port = null
}

/** Porta do preview ativo, ou null se nenhum estiver rodando. */
export function getPreviewPort(): number | null {
  return state.port
}
