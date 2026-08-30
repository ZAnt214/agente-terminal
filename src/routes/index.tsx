import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowUpRight,
  Braces,
  History,
  Play,
  RotateCw,
  Sparkles,
  Square,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { MessageFeed, type ChatMessage } from "#/components/message-feed.tsx"
import { PromptInput } from "#/components/prompt-input.tsx"
import { HistorySheet, type Session } from "#/components/sidebar.tsx"
import { Button } from "#/components/ui/button.tsx"

export const Route = createFileRoute("/")({ component: Home })

interface ChatSession extends Session {
  messages: ChatMessage[]
}

interface AgentEvent {
  type: "thought" | "command" | "log" | "done" | "error"
  text?: string
  command?: string
  message?: string
  step?: number
  summary?: string
}

type LogKind = "cmd" | "stdout" | "stderr" | "system" | "ok" | "err"
interface ShellLine {
  id: number
  kind: LogKind
  text: string
}
interface ExecEvent {
  stream: "stdout" | "stderr" | "exit" | "error"
  text?: string
  code?: number | null
}

const SHELL_PRESETS = [
  "pwd",
  "ls -la",
  "whoami",
  "node -v",
  "npm -v",
  "git status",
  "date",
]

function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [chatRunning, setChatRunning] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [view, setView] = useState<"chat" | "shell">("chat")
  const [chatInput, setChatInput] = useState("")

  // Shell (modo terminal)
  const [shellLines, setShellLines] = useState<ShellLine[]>([])
  const [shellInput, setShellInput] = useState("")
  const [shellRunning, setShellRunning] = useState(false)
  const [shellHistory, setShellHistory] = useState<string[]>([])
  const [shellHistoryIdx, setShellHistoryIdx] = useState(-1)
  const shellLogRef = useRef<HTMLDivElement>(null)
  const shellAtBottom = useRef(true)
  const nextId = useRef(1)
  const nextMsg = useRef(1)
  const nextStep = useRef(1)
  const nextSess = useRef(1)
  const currentStepRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const running = view === "chat" ? chatRunning : shellRunning

  const active = sessions.find((s) => s.id === activeId) ?? null

  const newSession = () => {
    const id = nextSess.current++
    setSessions((prev) => [
      { id, title: "", ts: "agora", messages: [] },
      ...prev,
    ])
    setActiveId(id)
    setView("chat")
    setHistoryOpen(false)
  }

  // Garante que existe uma conversa ativa, criando uma se necessário.
  const ensureSession = (): number => {
    if (activeId != null) return activeId
    const id = nextSess.current++
    setSessions((prev) => [
      { id, title: "", ts: "agora", messages: [] },
      ...prev,
    ])
    setActiveId(id)
    return id
  }

  const deleteSession = (id: number) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeId === id)
      setActiveId(sessions.find((s) => s.id !== id)?.id ?? null)
  }

  const sendGoal = async (raw: string) => {
    const prompt = raw.trim()
    if (!prompt || chatRunning) return
    const sessId = ensureSession()

    const uid = nextMsg.current++
    const aid = nextMsg.current++
    const patch = (fn: (m: ChatMessage[]) => ChatMessage[]) =>
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessId
            ? {
                ...s,
                title: s.title || prompt,
                messages: fn(s.messages),
              }
            : s,
        ),
      )

    patch((msgs) => [
      ...msgs,
      { id: uid, role: "user", content: prompt, steps: [], status: "done" },
      {
        id: aid,
        role: "assistant",
        content: "",
        steps: [],
        status: "running",
      },
    ])
    setChatInput("")
    setChatRunning(true)
    currentStepRef.current = null

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: prompt }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

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
            const stepId = nextStep.current++
            currentStepRef.current = stepId
            patch((msgs) =>
              msgs.map((m) =>
                m.id === aid
                  ? {
                      ...m,
                      status: "running",
                      steps: [
                        ...m.steps,
                        {
                          id: stepId,
                          num: m.steps.length + 1,
                          thought: evt.text ?? "",
                          command: "",
                          logs: "",
                          running: true,
                        },
                      ],
                    }
                  : m,
              ),
            )
          } else if (evt.type === "command") {
            const stepId = currentStepRef.current
            if (stepId != null)
              patch((msgs) =>
                msgs.map((m) =>
                  m.id === aid
                    ? {
                        ...m,
                        steps: m.steps.map((st) =>
                          st.id === stepId
                            ? { ...st, command: evt.command ?? "" }
                            : st,
                        ),
                      }
                    : m,
                ),
              )
          } else if (evt.type === "log") {
            const stepId = currentStepRef.current
            if (stepId != null)
              patch((msgs) =>
                msgs.map((m) =>
                  m.id === aid
                    ? {
                        ...m,
                        steps: m.steps.map((st) =>
                          st.id === stepId
                            ? { ...st, logs: st.logs + (evt.text ?? "") }
                            : st,
                        ),
                      }
                    : m,
                ),
              )
          } else if (evt.type === "done") {
            patch((msgs) =>
              msgs.map((m) =>
                m.id === aid
                  ? {
                      ...m,
                      content: evt.summary ?? "",
                      status: "done",
                      steps: m.steps.map((st) => ({ ...st, running: false })),
                    }
                  : m,
              ),
            )
            setChatRunning(false)
          } else if (evt.type === "error") {
            patch((msgs) =>
              msgs.map((m) =>
                m.id === aid
                  ? {
                      ...m,
                      content: evt.message ?? "Erro ao executar.",
                      status: "error",
                      steps: m.steps.map((st) => ({ ...st, running: false })),
                    }
                  : m,
              ),
            )
            setChatRunning(false)
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        patch((msgs) =>
          msgs.map((m) =>
            m.id === aid ? { ...m, content: String(e), status: "error" } : m,
          ),
        )
      }
      setChatRunning(false)
    } finally {
      abortRef.current = null
    }
  }

  const stopChat = () => {
    abortRef.current?.abort()
    currentStepRef.current = null
    const sessId = activeId
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessId
          ? {
              ...s,
              messages: s.messages.map((m) =>
                m.status === "running"
                  ? {
                      ...m,
                      status: "error",
                      content: "Execução interrompida pelo usuário.",
                      steps: m.steps.map((st) => ({ ...st, running: false })),
                    }
                  : m,
              ),
            }
          : s,
      ),
    )
    setChatRunning(false)
  }

  // ------- Shell (modo terminal) -------
  const addShell = (kind: LogKind, text: string) =>
    setShellLines((prev) => [...prev, { id: nextId.current++, kind, text }])

  useEffect(() => {
    const el = shellLogRef.current
    if (el && shellAtBottom.current) el.scrollTop = el.scrollHeight
  }, [shellLines])

  const onShellScroll = () => {
    const el = shellLogRef.current
    if (!el) return
    shellAtBottom.current =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 24
  }

  const runShell = async (raw: string) => {
    const command = raw.trim()
    if (!command || shellRunning) return
    setShellHistory((h) => (h[h.length - 1] === command ? h : [...h, command]))
    setShellHistoryIdx(-1)
    setShellInput("")
    addShell("cmd", `$ ${command}`)
    setShellRunning(true)

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
        addShell("err", `error: ${msg?.error ?? `HTTP ${res.status}`}`)
        setShellRunning(false)
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
          if (evt.stream === "stdout") addShell("stdout", evt.text ?? "")
          else if (evt.stream === "stderr") addShell("stderr", evt.text ?? "")
          else if (evt.stream === "error") addShell("err", evt.text ?? "")
          else if (evt.stream === "exit") {
            addShell(evt.code === 0 ? "ok" : "err", `— exit ${evt.code}`)
            setShellRunning(false)
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") addShell("err", String(e))
      setShellRunning(false)
    } finally {
      abortRef.current = null
    }
  }

  const onShellKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void runShell(shellInput)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (shellHistory.length === 0) return
      const n = Math.max(
        0,
        shellHistoryIdx === -1 ? shellHistory.length - 1 : shellHistoryIdx - 1,
      )
      setShellHistoryIdx(n)
      setShellInput(shellHistory[n])
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      const n = shellHistoryIdx + 1
      if (n >= shellHistory.length) {
        setShellHistoryIdx(-1)
        setShellInput("")
      } else {
        setShellHistoryIdx(n)
        setShellInput(shellHistory[n])
      }
    }
  }

  return (
    <div className="min-h-dvh bg-[#07090c] text-zinc-200">
      <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col border-x border-white/5 bg-[#0a0d12] shadow-2xl shadow-black">
        {/* Topo */}
        <header className="safe-top shrink-0 border-b border-white/5 bg-[#0a0d12]/95 backdrop-blur">
          <div className="flex items-center gap-2.5 px-3 pt-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-cyan-400 text-brand-foreground">
              <Sparkles className="size-4" strokeWidth={2.4} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[13px] font-bold tracking-tight text-zinc-100">
                dev·console <span className="font-normal text-zinc-500">/</span>{" "}
                <span className="text-brand">agent</span>
              </div>
            </div>

            <span
              className={
                "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10.5px] " +
                (running
                  ? "border-brand/30 bg-brand/10 text-brand"
                  : "border-white/10 bg-white/[0.03] text-zinc-400")
              }
              title="Conexão com o agente via streaming"
            >
              <span
                className={
                  "size-1.5 rounded-full " +
                  (running ? "bg-brand status-dot" : "bg-emerald-400")
                }
              />
              {running ? "executando" : "online"}
            </span>

            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="rounded-xl p-2 text-zinc-300 transition-colors hover:bg-white/5 hover:text-zinc-50"
              title="Histórico"
              aria-label="Abrir histórico"
            >
              <History className="size-5" />
            </button>
          </div>

          {/* Alternância Chat / Shell */}
          <nav
            className="mx-3 mt-2.5 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/30 p-1"
            aria-label="Modo"
          >
            <button
              type="button"
              onClick={() => setView("chat")}
              className={
                "rounded-xl py-2.5 text-center font-mono text-[12.5px] font-semibold transition-colors " +
                (view === "chat"
                  ? "bg-brand text-brand-foreground shadow-md shadow-brand/20"
                  : "text-zinc-500 hover:text-zinc-300")
              }
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setView("shell")}
              className={
                "rounded-xl py-2.5 text-center font-mono text-[12.5px] font-semibold transition-colors " +
                (view === "shell"
                  ? "bg-brand text-brand-foreground shadow-md shadow-brand/20"
                  : "text-zinc-500 hover:text-zinc-300")
              }
            >
              Shell
            </button>
          </nav>
          <div className="h-2.5" />
        </header>

        {/* Conteúdo */}
        <div className="flex min-h-0 flex-1 flex-col">
          {view === "chat" ? (
            <>
              <div className="min-h-0 flex-1">
                <MessageFeed
                  messages={active?.messages ?? []}
                  onPickSuggestion={(p) => void sendGoal(p)}
                />
              </div>
              <PromptInput
                value={chatInput}
                onChange={setChatInput}
                onSend={() => void sendGoal(chatInput)}
                onStop={stopChat}
                running={chatRunning}
              />
            </>
          ) : (
            <>
              <div className="min-h-0 flex-1 px-3 pb-2 pt-2">
                <div
                  ref={shellLogRef}
                  onScroll={onShellScroll}
                  className="h-full overflow-y-auto rounded-2xl border border-white/10 bg-black/50 p-4 font-mono text-[12.5px] leading-relaxed shadow-inner shadow-black/60"
                  role="log"
                  aria-label="Saída do terminal"
                >
                  {shellLines.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <Braces className="size-8 text-zinc-700" />
                      <p className="mt-3 text-sm text-zinc-500">
                        Digite um comando abaixo ou escolha um atalho.
                      </p>
                    </div>
                  )}
                  {shellLines.map((line) => (
                    <div
                      key={line.id}
                      className="whitespace-pre-wrap break-words"
                    >
                      <ShellLineView line={line} />
                    </div>
                  ))}
                  {shellRunning && (
                    <div className="mt-1 flex items-center gap-2 text-zinc-500">
                      <span className="cursor-blink size-2.5 bg-brand" />
                      <span className="text-xs italic">executando…</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-3 pb-2">
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                  {SHELL_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => void runShell(p)}
                      disabled={shellRunning}
                      className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 font-mono text-xs text-zinc-300 transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand disabled:opacity-40"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <footer className="safe-bottom border-t border-white/5 bg-[#0a0d12] px-3 pt-2.5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void runShell(shellInput)
                  }}
                  className="flex w-full items-center gap-2"
                >
                  <span className="font-mono text-sm font-bold text-brand">
                    $
                  </span>
                  <input
                    value={shellInput}
                    onChange={(e) => setShellInput(e.target.value)}
                    onKeyDown={onShellKey}
                    disabled={shellRunning}
                    placeholder="digite um comando…"
                    spellCheck={false}
                    autoComplete="off"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
                  />
                  {shellRunning ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => abortRef.current?.abort()}
                      title="Interromper"
                      className="size-11 shrink-0 border-zinc-700 bg-zinc-800/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    >
                      <Square className="size-4 fill-current" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="icon"
                      className="size-11 shrink-0 rounded-xl bg-brand text-brand-foreground shadow-md shadow-brand/30 hover:brightness-110"
                      title="Executar"
                    >
                      {shellHistory.length > 0 ? (
                        <RotateCw className="size-4" />
                      ) : (
                        <Play className="size-4 fill-current" />
                      )}
                    </Button>
                  )}
                </form>
                <p className="mt-2 flex items-center justify-center gap-1 pb-0.5 text-center font-mono text-[10px] text-zinc-600">
                  <ArrowUpRight className="size-3" /> setas ↑↓ histórico · shell
                  de demonstração em tempo real
                </p>
              </footer>
            </>
          )}
        </div>

        {/* Gaveta de histórico */}
        <HistorySheet
          sessions={sessions.map(({ messages: _m, ...rest }) => rest)}
          activeId={activeId}
          open={historyOpen}
          onSelect={setActiveId}
          onNew={newSession}
          onDelete={deleteSession}
          onClose={() => setHistoryOpen(false)}
        />
      </div>
    </div>
  )
}

function ShellLineView({ line }: { line: ShellLine }) {
  if (line.kind === "cmd")
    return (
      <span className="font-semibold text-brand">
        <span className="mr-1 text-brand/70">$</span>
        {line.text}
      </span>
    )
  if (line.kind === "stdout")
    return <span className="text-zinc-200">{line.text}</span>
  if (line.kind === "stderr")
    return <span className="text-amber-400">{line.text}</span>
  if (line.kind === "ok")
    return <span className="text-zinc-500">{line.text}</span>
  return <span className="font-medium text-rose-400">{line.text}</span>
}
