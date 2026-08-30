import { ArrowUp, Square } from "lucide-react"
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
  placeholder = "Descreva um objetivo…",
}: PromptInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Expande verticalmente conforme o conteúdo cresce.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }, [value])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!running) onSend()
    }
  }

  const canSend = value.trim().length > 0 && !running

  return (
    <div className="safe-bottom px-3 pb-1.5 pt-1.5">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-end gap-2 rounded-[22px] border border-white/10 bg-surface py-2 pl-4 pr-2 shadow-xl shadow-black/50 transition-colors focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/20">
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            className="max-h-[160px] min-w-0 flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 outline-none disabled:opacity-60"
          />
          {running ? (
            <button
              type="button"
              onClick={onStop}
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Interromper"
              aria-label="Interromper"
            >
              <Square className="size-4 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-foreground shadow-md shadow-brand/30 transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              title="Enviar"
              aria-label="Enviar"
            >
              <ArrowUp className="size-5" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
