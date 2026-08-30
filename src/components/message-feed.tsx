import { Sparkles } from "lucide-react"
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
  "Crie um repositório no GitHub e faça o primeiro commit",
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
    atBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 60
  }

  if (messages.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-5 pb-6 pt-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand to-cyan-400 text-brand-foreground shadow-lg shadow-brand/25">
          <Sparkles className="size-8" strokeWidth={2.2} />
        </div>
        <h1 className="mt-5 text-[22px] font-bold tracking-tight text-zinc-50">
          dev·console agent
        </h1>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-zinc-400">
          Descreva um objetivo e o agente planeja, executa comandos no terminal,
          lê os logs e se corrige até concluir.
        </p>
        <div className="mt-7 flex w-full flex-col gap-2.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPickSuggestion(s)}
              className="w-full rounded-2xl border border-white/10 bg-surface px-4 py-3.5 text-left text-[14px] leading-snug text-zinc-200 transition-colors hover:border-brand/40 hover:bg-brand/[0.06] hover:text-zinc-50 active:scale-[0.99]"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="h-full overflow-y-auto px-3.5 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="log"
      aria-live="polite"
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        {messages.map((msg) =>
          msg.role === "user" ? (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[86%] rounded-2xl rounded-tr-sm bg-brand/15 px-4 py-2.5 text-[14px] leading-relaxed text-zinc-50">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex items-start gap-2.5">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-cyan-400 text-brand-foreground">
                <Sparkles className="size-3.5" strokeWidth={2.4} />
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
