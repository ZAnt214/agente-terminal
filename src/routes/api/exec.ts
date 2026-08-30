import { createFileRoute } from "@tanstack/react-router"
import "@tanstack/react-start"

interface ExecRequest {
  command: string
}

interface ExecEvent {
  stream: "stdout" | "stderr" | "exit" | "error"
  text?: string
  code?: number | null
}

/**
 * Shell simulation used while the app runs on the Workers runtime, where real
 * process spawning is unavailable. The client contract is identical to a real
 * shell: a command POSTed here produces a stream of stdout/stderr/exit events.
 *
 * When hosting on a real Node.js process, swap this handler's body for:
 *   const child = spawn(command, { shell: true })
 * and forward `child.stdout`/`child.stderr` line-by-line — no client change.
 */
function runShell(command: string): { events: ExecEvent[] } {
  const args = command.split(/\s+/).filter(Boolean)
  const cmd = args[0]?.toLowerCase() ?? ""

  const out = (...lines: string[]) => ({
    events: lines.map((text) => ({ stream: "stdout" as const, text })),
  })
  const err = (...lines: string[]) => ({
    events: lines.map((text) => ({ stream: "stderr" as const, text })),
  })

  switch (cmd) {
    case "pwd":
      return out("/home/you/dev/project")
    case "whoami":
      return out("you")
    case "echo":
      return out(args.slice(1).join(" "))
    case "date":
      return out(new Date().toString())
    case "node":
      if (args[1] === "-v") return out("v22.14.0")
      if (args[1] === "--version") return out("v22.14.0")
      return err(`node: unrecognized arguments: ${args.slice(1).join(" ")}`)
    case "npm":
      if (args[1] === "-v") return out("10.9.2")
      if (args[1] === "--version") return out("10.9.2")
      return err(`npm: command not found: npm ${args.slice(1).join(" ")}`)
    case "ls": {
      const long = args.includes("-l") || args.includes("-la")
      if (long)
        return out(
          "total 28",
          "drwxr-xr-x  5 you you  160 Aug 30 16:26 .",
          "drwxr-xr-x  6 you you  192 Aug 30 16:26 ..",
          "-rw-r--r--  1 you you  725 Aug 30 16:26 .env",
          "-rw-r--r--  1 you you  902 Aug 30 16:26 README.md",
          "drwxr-xr-x  3 you you   96 Aug 30 16:26 src",
          "drwxr-xr-x  2 you you   64 Aug 30 16:26 scripts",
          "-rw-r--r--  1 you you 1300 Aug 30 16:26 package.json",
        )
      return out("package.json  README.md  scripts  src  .env")
    }
    case "git": {
      if (args[1] === "status")
        return out(
          "On branch main",
          "Your branch is up to date with 'origin/main'.",
          "",
          "nothing to commit, working tree clean",
        )
      if (args[1] === "log")
        return out(
          "commit bdcda48a (HEAD -> main) — init from vibe template",
          "Author: You <you@example.com>",
          "Date:   Sat Aug 30 16:26:00 2026",
        )
      return err(
        `git: unknown subcommand: ${args.slice(1).join(" ") || "(none)"}`,
      )
    }
    case "clear":
      return { events: [{ stream: "exit" as const, code: 0 }] }
    case "help":
      return out(
        "dev·console — comandos simulados disponíveis:",
        "",
        "  pwd, whoami, date, echo <texto>",
        "  ls, ls -la",
        "  node -v, npm -v",
        "  git status, git log",
        "  clear, help",
        "",
        "Este é um shell de demonstração. Em um servidor Node local,",
        "os comandos reais são executados via child_process.spawn.",
      )
    case "": {
      return { events: [] }
    }
    default:
      return {
        events: [
          {
            stream: "stderr" as const,
            text: `bash: ${cmd}: command not found`,
          },
        ],
      }
  }
}

export const Route = createFileRoute("/api/exec")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ExecRequest
        const command = (body.command ?? "").trim()

        if (!command) {
          return Response.json(
            { error: "empty command" },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          )
        }

        const { events } = runShell(command)
        const encoder = new TextEncoder()

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            for (let i = 0; i < events.length; i++) {
              const evt = events[i]
              // Small delays make the stream feel live, like real output.
              if (evt.text) {
                const text = evt.text.endsWith("\n")
                  ? evt.text
                  : evt.text + "\n"
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ ...evt, text })}\n\n`,
                  ),
                )
              }
              await new Promise((r) => setTimeout(r, 40))
            }
            const exitCode = events.some((e) => e.stream === "stderr") ? 1 : 0
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ stream: "exit", code: exitCode })}\n\n`,
              ),
            )
            controller.close()
          },
        })

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          },
        })
      },
    },
  },
})
