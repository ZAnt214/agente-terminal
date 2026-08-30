import { Sparkles, User as UserIcon } from "lucide-react"
import { useEffect, useRef } from "react"

import { ActionCard } from "#/components/action-card.tsx"
import { Markdown } from "#/components/markdown.tsx"

export interface AgentStep {
  id: number
  num: number
  thought: string
  command: string
  logs: string
  running: boolean
}

export interface ChatMessage {
  id: number
  role: "user" | "assistant"
  content: string
  steps: AgentStep[]
  status: "idle" | "running" | "done" | "error"
}

const SUGGESTIONS = [
  "Crie um projeto React chamado meu-app e instale o Tailwind",
  "Verifique a versão do Node instalada",
  "Liste os arquivos do diretório atual",
]

interface MessageFeedProps {
  messages: ChatMessage[]
  onPickSuggestion: (prompt: string) => void
}

export function MessageFeed({ messages, onPickSuggestion }: MessageFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
  }

  if (messages.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-cyan-400 text-brand-foreground shadow-lg shadow-brand/20">
          <Sparkles className="size-7" strokeWidth={2.2} />
        </div>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-zinc-50">
          dev·console agent
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
          Descreva um objetivo e o agente planeja, executa comandos no terminal,
          lê os logs e se corrige até concluir — com fallback de IA em vários
          provedores.
        </p>
        <div className="mt-6 flex w-full max-w-xl flex-col gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPickSuggestion(s)}
              className="rounded-xl border border-white/10 bg-surface px-4 py-3 text-left text-[13px] text-zinc-300 transition-colors hover:border-brand/40 hover:bg-brand/[0.06] hover:text-zinc-100"
            >
              {s}
            </button>
          ))}
        </div>
        <p className="mt-6 text-[11px] text-zinc-600">
          O agente responde em JSON e mostra cada passo em um card colapsável.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="h-full overflow-y-auto px-3 py-5 sm:px-5 [scrollbar-width:thin]"
      role="log"
      aria-live="polite"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {messages.map((msg) =>
          msg.role === "user" ? (
            <div key={msg.id} className="flex justify-end">
              <div className="flex max-w-[85%] items-start gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-zinc-300">
                  <UserIcon className="size-4" />
                </div>
                <div className="rounded-2xl rounded-tr-sm border border-white/10 bg-surface-2 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-zinc-100">
                  {msg.content}
                </div>
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex items-start gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-cyan-400 text-brand-foreground">
                <Sparkles className="size-4" strokeWidth={2.4} />
              </div>
              <div className="min-w-0 flex-1 space-y-2.5">
                {msg.steps.map((step) => (
                  <ActionCard key={step.id} step={step} />
                ))}

                {msg.status === "running" && msg.steps.length === 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-[13px] text-zinc-400">
                    <span className="status-dot size-2 rounded-full bg-brand" />
                    <span>Planejando os primeiros passos…</span>
                  </div>
                )}

                {msg.status === "error" && (
                  <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-3 text-[13px] text-rose-200">
                    {msg.content || "O agente não conseguiu concluir a tarefa."}
                  </div>
                )}

                {msg.content && msg.status !== "error" && (
                  <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-surface px-4 py-3.5">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                )}

                {msg.status === "running" && (
                  <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                    <span className="status-dot size-1.5 rounded-full bg-brand" />
                    agente executando…
                  </div>
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
