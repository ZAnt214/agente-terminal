import { ArrowUp, LoaderCircle, Square } from "lucide-react"
import { useEffect, useRef } from "react"

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  running: boolean
  placeholder?: string
}

export function PromptInput({
  value,
  onChange,
  onSend,
  onStop,
  running,
  placeholder = "Descreva um objetivo para o agente…",
}: PromptInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Expande verticalmente conforme o conteúdo cresce.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 180) + "px"
  }, [value])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!running) onSend()
    }
  }

  const canSend = value.trim().length > 0 && !running

  return (
    <div className="px-3 pb-4 pt-2 sm:px-5">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-white/10 bg-surface shadow-lg shadow-black/40 transition-colors focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/20">
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            className="max-h-[180px] w-full resize-none bg-transparent px-4 py-3 text-[14px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <p className="px-1 text-[10.5px] text-zinc-600">
              Enter envia · Shift+Enter nova linha
            </p>
            {running ? (
              <button
                type="button"
                onClick={onStop}
                className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                title="Interromper"
              >
                <Square className="size-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                className="flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-md shadow-brand/30 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                title="Enviar"
                aria-label="Enviar"
              >
                <ArrowUp className="size-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[10.5px] text-zinc-600">
          {running && (
            <LoaderCircle className="size-3 animate-spin text-brand" />
          )}
          <span>
            {running
              ? "Agente trabalhando no terminal…"
              : "O agente executa comandos e se corrige sozinho até concluir."}
          </span>
        </p>
      </div>
    </div>
  )
}
