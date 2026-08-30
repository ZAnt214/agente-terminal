import {
  Brain,
  Circle,
  Square,
  Terminal as TerminalIcon,
  Wrench,
  Zap,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "#/components/ui/button.tsx"

type AgentLineKind = "goal" | "thought" | "command" | "log" | "done" | "error"

interface AgentLine {
  id: number
  kind: AgentLineKind
  text: string
  step?: number
}

interface AgentEvent {
  type: "thought" | "command" | "log" | "done" | "error"
  text?: string
  command?: string
  message?: string
  step?: number
  summary?: string
}

const EXAMPLE_GOALS = [
  "Crie um projeto React chamado meu-app e instale o Tailwind",
  "Verifique a versão do Node instalada",
  "Liste os arquivos do diretório atual",
]

export function AgentPanel() {
  const [lines, setLines] = useState<AgentLine[]>([])
  const [goal, setGoal] = useState("")
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(0)
  const nextId = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  const add = (kind: AgentLineKind, text: string, s?: number) => {
    const id = nextId.current++
    setLines((prev) => [...prev, { id, kind, text, step: s }])
  }

  useEffect(() => {
    const el = logRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const onScroll = () => {
    const el = logRef.current
    if (!el) return
    atBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24
  }

  const stop = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  const start = async () => {
    const target = goal.trim()
    if (!target || running) return

    setLines([])
    setStep(0)
    add("goal", `Objetivo: ${target}`)
    setRunning(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: target }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const msg = (await res.json().catch(() => null)) as { error?: string }
        add("error", `error: ${msg?.error ?? `HTTP ${res.status}`}`)
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
          const evt = JSON.parse(dataLine.slice(6)) as AgentEvent
          if (evt.type === "thought") {
            add("thought", evt.text ?? "", evt.step)
            setStep(evt.step ?? 0)
          } else if (evt.type === "command") {
            add("command", evt.command ?? "", evt.step)
          } else if (evt.type === "log") {
            add("log", evt.text ?? "")
          } else if (evt.type === "done") {
            add("done", evt.summary ?? "Objetivo concluído.")
            setRunning(false)
          } else if (evt.type === "error") {
            add("error", evt.message ?? "Erro desconhecido")
            setRunning(false)
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") add("error", String(e))
      setRunning(false)
    } finally {
      abortRef.current = null
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {/* Goal bar */}
      <div className="px-2 pt-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-400 to-fuchsia-500 text-black shadow-lg shadow-fuchsia-500/20">
            <Brain className="size-5" strokeWidth={2.5} />
          </div>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void start()}
            disabled={running}
            placeholder="Ex: Crie um projeto React chamado meu-app e instale o Tailwind…"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-400/20 disabled:opacity-50"
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
              type="button"
              size="icon"
              onClick={() => void start()}
              className="size-11 bg-gradient-to-br from-violet-400 to-fuchsia-500 text-black shadow-lg shadow-fuchsia-500/20 hover:opacity-90"
              title="Iniciar agente"
            >
              <Zap className="size-4 fill-current" />
            </Button>
          )}
        </div>
      </div>

      {/* Examples */}
      <div className="px-2 pt-2 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {EXAMPLE_GOALS.map((g) => (
            <button
              key={g}
              onClick={() => setGoal(g)}
              disabled={running}
              className="shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:border-fuchsia-400/40 hover:bg-fuchsia-400/10 hover:text-fuchsia-200 disabled:opacity-40"
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Status strip */}
      <div className="flex items-center justify-between px-2 pt-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 font-mono text-[11px] text-zinc-500">
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 " +
              (running
                ? "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300"
                : "border-zinc-700 bg-zinc-800/60 text-zinc-500")
            }
          >
            <Circle
              className={
                "size-2 fill-current " +
                (running ? "animate-pulse text-fuchsia-400" : "text-zinc-600")
              }
            />
            {running ? "agente executando" : "agente em espera"}
          </span>
          {running && (
            <span className="text-zinc-400">passo {step} de até 10</span>
          )}
        </div>
      </div>

      {/* Agent log window */}
      <div className="min-h-0 flex-1 px-2 py-3 sm:px-6">
        <div
          ref={logRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto rounded-xl border border-white/10 bg-black/60 p-4 font-mono text-[13px] leading-relaxed shadow-inner shadow-black/60"
          aria-label="Log do agente autônomo"
          role="log"
        >
          {lines.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Wrench className="size-8 text-zinc-700" />
              <p className="mt-3 max-w-sm text-sm text-zinc-500">
                Descreva um objetivo em linguagem natural e o agente vai
                planejar, executar comandos e corrigir erros até concluir.
              </p>
            </div>
          )}
          {lines.map((line) => (
            <div key={line.id} className="whitespace-pre-wrap break-words">
              <AgentLineView line={line} />
            </div>
          ))}
          {running && (
            <div className="mt-1 flex items-center gap-2 text-zinc-500">
              <span className="cursor-blink size-2.5 bg-fuchsia-400" />
              <span className="text-xs italic">agente pensando…</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function AgentLineView({ line }: { line: AgentLine }) {
  if (line.kind === "goal") {
    return (
      <span className="font-semibold text-fuchsia-300">
        <span className="mr-1 text-fuchsia-500">◆</span>
        {line.text}
      </span>
    )
  }
  if (line.kind === "thought") {
    return (
      <span className="text-zinc-200">
        <span className="mr-1 inline-flex size-3.5 translate-y-[2px] items-center justify-center rounded bg-violet-500/20 text-[10px] text-violet-300">
          {line.step ?? "?"}
        </span>
        <Brain className="mr-1 inline size-3 text-violet-400" />
        {line.text}
      </span>
    )
  }
  if (line.kind === "command") {
    return (
      <span className="font-medium text-emerald-300">
        <TerminalIcon className="mr-1 inline size-3 text-emerald-500" />${" "}
        {line.text}
      </span>
    )
  }
  if (line.kind === "log") {
    return <span className="text-zinc-500">{line.text}</span>
  }
  if (line.kind === "done") {
    return (
      <span className="text-emerald-400">
        <span className="mr-1">✓</span>
        {line.text}
      </span>
    )
  }
  return (
    <span className="font-medium text-rose-400">
      <span className="mr-1">✕</span>
      {line.text}
    </span>
  )
}
