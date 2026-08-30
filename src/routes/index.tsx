import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowUpRight,
  Braces,
  Circle,
  Eraser,
  Play,
  RotateCw,
  Square,
  Terminal as TerminalIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { AgentPanel } from "#/components/agent-panel.tsx"
import { Button } from "#/components/ui/button.tsx"

export const Route = createFileRoute("/")({ component: Home })

type LogKind = "cmd" | "stdout" | "stderr" | "system" | "ok" | "err"

interface LogEntry {
  id: number
  kind: LogKind
  text: string
}

interface ExecEvent {
  stream: "stdout" | "stderr" | "exit" | "error"
  text?: string
  code?: number | null
}

const PRESETS = [
  "pwd",
  "ls -la",
  "whoami",
  "node -v",
  "npm -v",
  "git status",
  "echo hello world",
  "date",
]

function Home() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [input, setInput] = useState("")
  const [running, setRunning] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [view, setView] = useState<"terminal" | "agent">("terminal")
  const nextId = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const atBottomRef = useRef(true)

  const add = (kind: LogKind, text: string) => {
    const id = nextId.current++
    setEntries((prev) => [...prev, { id, kind, text }])
  }

  // Auto-scroll keeps the newest line visible while the user hasn't scrolled up.
  useEffect(() => {
    const el = logRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [entries])

  const onScroll = () => {
    const el = logRef.current
    if (!el) return
    atBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24
  }

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  const run = async (raw: string) => {
    const command = raw.trim()
    if (!command || running) return

    setHistory((h) => (h[h.length - 1] === command ? h : [...h, command]))
    setHistoryIdx(-1)
    setInput("")
    add("cmd", `$ ${command}`)
    setRunning(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const msg = (await res.json().catch(() => null)) as { error?: string }
        add("err", `error: ${msg?.error ?? `HTTP ${res.status}`}`)
        setRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const dataLine = rawEvent
            .split("\n")
            .find((l) => l.startsWith("data: "))
          if (!dataLine) continue
          const evt = JSON.parse(dataLine.slice(6)) as ExecEvent
          if (evt.stream === "stdout") add("stdout", evt.text ?? "")
          else if (evt.stream === "stderr") add("stderr", evt.text ?? "")
          else if (evt.stream === "error") add("err", evt.text ?? "")
          else if (evt.stream === "exit") {
            if (evt.code === 0) add("ok", `— exited with code ${evt.code}`)
            else add("err", `— exited with code ${evt.code}`)
            setRunning(false)
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") add("err", String(e))
      setRunning(false)
    } finally {
      abortRef.current = null
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(input)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (history.length === 0) return
      const next = Math.max(
        0,
        historyIdx === -1 ? history.length - 1 : historyIdx - 1,
      )
      setHistoryIdx(next)
      setInput(history[next])
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (historyIdx === -1) return
      const next = historyIdx + 1
      if (next >= history.length) {
        setHistoryIdx(-1)
        setInput("")
      } else {
        setHistoryIdx(next)
        setInput(history[next])
      }
    }
  }

  const clear = () => {
    setEntries([])
    atBottomRef.current = true
  }

  const status = running ? "running" : "idle"

  return (
    <main className="flex min-h-dvh flex-col bg-[#07090d] text-zinc-200">
      {/* Top chrome */}
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#0c0f16] px-4 py-3 sm:px-6">
        <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 text-black shadow-lg shadow-emerald-500/20">
          <TerminalIcon className="size-5" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-mono text-sm font-bold tracking-tight text-white">
            dev·console
          </h1>
          <p className="truncate font-mono text-[11px] text-zinc-500">
            painel de terminal · shell em tempo real
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 font-mono text-[11px]">
          <nav
            className="mr-1 flex rounded-lg border border-white/10 bg-black/40 p-0.5"
            aria-label="Modo do painel"
          >
            <button
              onClick={() => setView("terminal")}
              className={
                "rounded-md px-3 py-1.5 font-mono text-xs transition-colors " +
                (view === "terminal"
                  ? "bg-emerald-400/15 text-emerald-200"
                  : "text-zinc-500 hover:text-zinc-300")
              }
            >
              Terminal
            </button>
            <button
              onClick={() => setView("agent")}
              className={
                "rounded-md px-3 py-1.5 font-mono text-xs transition-colors " +
                (view === "agent"
                  ? "bg-fuchsia-400/15 text-fuchsia-200"
                  : "text-zinc-500 hover:text-zinc-300")
              }
            >
              Agente
            </button>
          </nav>
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 " +
              (running
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-zinc-700 bg-zinc-800/60 text-zinc-400")
            }
          >
            <Circle
              className={
                "size-2 fill-current " +
                (running ? "animate-pulse text-emerald-400" : "text-zinc-500")
              }
            />
            {status}
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="text-zinc-400 hover:text-zinc-100"
            onClick={clear}
            title="Limpar log"
          >
            <Eraser className="size-3.5" />
          </Button>
        </div>
      </header>

      {view === "agent" ? (
        <AgentPanel />
      ) : (
        <>
          {/* Log window */}
          <div className="min-h-0 flex-1 px-2 py-3 sm:px-6">
            <div
              ref={logRef}
              onScroll={onScroll}
              className="h-full overflow-y-auto rounded-xl border border-white/10 bg-black/60 p-4 font-mono text-[13px] leading-relaxed shadow-inner shadow-black/60"
              aria-label="Saída do terminal"
              role="log"
            >
              {entries.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Braces className="size-8 text-zinc-700" />
                  <p className="mt-3 text-sm text-zinc-500">
                    Digite um comando abaixo ou escolha um atalho para começar.
                  </p>
                </div>
              )}
              {entries.map((entry) => (
                <div key={entry.id} className="whitespace-pre-wrap break-words">
                  <RenderLine entry={entry} />
                </div>
              ))}
              {running && (
                <div className="mt-1 flex items-center gap-2 text-zinc-500">
                  <span className="cursor-blink size-2.5 bg-emerald-400" />
                  <span className="text-xs italic">executando…</span>
                </div>
              )}
            </div>
          </div>

          {/* Presets */}
          <div className="px-2 pb-2 sm:px-6">
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => void run(p)}
                  disabled={running}
                  className="shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-200 disabled:opacity-40"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Command input */}
          <footer className="border-t border-white/10 bg-[#0c0f16] px-2 py-3 sm:px-6">
            <form
              onSubmit={onSubmit}
              className="mx-auto flex w-full max-w-5xl items-center gap-2"
            >
              <span className="font-mono text-sm font-bold text-emerald-400">
                $
              </span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={running}
                placeholder="digite um comando e pressione Enter…"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-50"
              />
              {running ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={stop}
                  title="Interromper"
                  className="size-11 border-zinc-700 bg-zinc-800/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  <Square className="size-4 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className="size-11 bg-gradient-to-br from-emerald-400 to-cyan-500 text-black shadow-lg shadow-emerald-500/20 hover:opacity-90"
                  title="Executar"
                >
                  {history.length > 0 ? (
                    <RotateCw className="size-4" />
                  ) : (
                    <Play className="size-4 fill-current" />
                  )}
                </Button>
              )}
            </form>
            <p className="mx-auto mt-2 flex max-w-5xl items-center gap-1 font-mono text-[10px] text-zinc-600">
              <ArrowUpRight className="size-3" /> setas ↑↓ para histórico ·
              conexão direta com o shell
            </p>
          </footer>
        </>
      )}
    </main>
  )
}

function RenderLine({ entry }: { entry: LogEntry }) {
  if (entry.kind === "cmd") {
    return (
      <span className="font-semibold text-emerald-300">
        <span className="mr-1 text-emerald-500">$</span>
        {entry.text}
      </span>
    )
  }
  if (entry.kind === "stdout") {
    return <span className="text-zinc-200">{entry.text}</span>
  }
  if (entry.kind === "stderr") {
    return <span className="text-amber-400">{entry.text}</span>
  }
  if (entry.kind === "ok") {
    return <span className="text-zinc-500">{entry.text}</span>
  }
  return <span className="font-medium text-rose-400">{entry.text}</span>
}
