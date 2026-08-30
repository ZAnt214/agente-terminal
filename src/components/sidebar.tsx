import { MessageSquarePlus, Sparkles, Trash2, X } from "lucide-react"

export interface Session {
  id: number
  title: string
  ts: string
}

interface HistorySheetProps {
  sessions: Session[]
  activeId: number | null
  open: boolean
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
  onClose: () => void
}

/** Gaveta (bottom-sheet) com o histórico de conversas, pensada para mobile. */
export function HistorySheet({
  sessions,
  activeId,
  open,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: HistorySheetProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      {/* Fundo escurecido */}
      <div
        className="sheet-backdrop absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden
      />

      {/* Painel */}
      <div className="sheet-panel relative flex max-h-[78dvh] flex-col rounded-t-3xl border-t border-white/10 bg-[#0d1117] shadow-2xl shadow-black">
        {/* Puxador */}
        <div className="flex shrink-0 flex-col items-center pt-2.5">
          <span className="h-1 w-9 rounded-full bg-white/15" />
        </div>

        {/* Cabeçalho da gaveta */}
        <div className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-cyan-400 text-brand-foreground">
            <Sparkles className="size-4" strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold text-zinc-100">
              Histórico
            </div>
            <div className="truncate text-[11px] text-zinc-500">
              {sessions.length} conversa{sessions.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            title="Fechar"
            aria-label="Fechar histórico"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-3 pb-1">
          <button
            type="button"
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3 py-3 text-[14px] font-semibold text-brand-foreground shadow-md shadow-brand/20 transition-all hover:brightness-110"
          >
            <MessageSquarePlus className="size-4" strokeWidth={2.4} />
            Nova conversa
          </button>
        </div>

        {/* Lista */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2 [scrollbar-width:thin]">
          {sessions.length === 0 ? (
            <p className="px-2 py-4 text-center text-[13px] text-zinc-600">
              Nenhuma conversa ainda.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {sessions.map((s) => {
                const active = s.id === activeId
                return (
                  <div
                    key={s.id}
                    className={
                      "group flex items-center gap-1.5 rounded-2xl border px-2.5 py-2.5 transition-colors " +
                      (active
                        ? "border-brand/30 bg-brand/[0.08]"
                        : "border-transparent hover:bg-white/5")
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(s.id)
                        onClose()
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className={
                          "size-2 shrink-0 rounded-full " +
                          (active ? "bg-brand" : "bg-zinc-700")
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] text-zinc-200">
                          {s.title || "Nova conversa"}
                        </span>
                        <span className="block text-[10.5px] text-zinc-600">
                          {s.ts}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id)}
                      className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                      title="Excluir"
                      aria-label="Excluir conversa"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
