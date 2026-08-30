import {
  Brain,
  ChevronDown,
  LoaderCircle,
  Terminal as TerminalIcon,
} from "lucide-react"
import { useState } from "react"

import type { AgentStep } from "#/components/message-feed.tsx"

interface ActionCardProps {
  step: AgentStep
}

/** Card sanfona: um passo de execução do agente (raciocínio + comando + saída). */
export function ActionCard({ step }: ActionCardProps) {
  const [open, setOpen] = useState(step.running)
  const hasOutput = step.logs.trim().length > 0

  return (
    <div
      className={
        "overflow-hidden rounded-xl border bg-surface/60 transition-colors " +
        (step.running
          ? "border-brand/30"
          : hasOutput
            ? "border-white/10"
            : "border-white/10")
      }
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]"
      >
        <span
          className={
            "flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold " +
            (step.running
              ? "bg-brand/15 text-brand"
              : "bg-white/5 text-zinc-400")
          }
        >
          {step.num}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[12.5px] font-medium text-zinc-200">
            <TerminalIcon className="size-3.5 shrink-0 text-zinc-500" />
            <span className="truncate">{step.command}</span>
          </div>
          {step.running && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-brand">
              <LoaderCircle className="size-3 animate-spin" />
              <span>executando…</span>
            </div>
          )}
        </div>

        <ChevronDown
          className={
            "size-4 shrink-0 text-zinc-500 transition-transform " +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-white/5 px-3 pb-3 pt-2.5">
          <div className="flex items-start gap-2 text-[13px] leading-relaxed text-zinc-300">
            <Brain className="mt-0.5 size-3.5 shrink-0 text-brand" />
            <p className="min-w-0">{step.thought || "Raciocinando…"}</p>
          </div>

          {step.command && (
            <div className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 font-mono text-[12px] text-emerald-300">
              <span className="mr-1.5 select-none text-zinc-600">$</span>
              {step.command}
            </div>
          )}

          {hasOutput && (
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-white/5 bg-black/60 px-2.5 py-2 font-mono text-[12px] leading-relaxed text-zinc-400 [scrollbar-width:thin]">
              {step.logs}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
