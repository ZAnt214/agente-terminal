import {
  ChevronsLeft,
  MessageSquarePlus,
  PanelLeft,
  Sparkles,
  Trash2,
} from "lucide-react"

export interface Session {
  id: number
  title: string
  ts: string
}

interface SidebarProps {
  sessions: Session[]
  activeId: number | null
  collapsed: boolean
  mobileOpen: boolean
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
  onToggleCollapse: () => void
  onCloseMobile: () => void
}

export function Sidebar({
  sessions,
  activeId,
  collapsed,
  mobileOpen,
  onSelect,
  onNew,
  onDelete,
  onToggleCollapse,
  onCloseMobile,
}: SidebarProps) {
  const content = (
    <div
      className={
        "flex h-full flex-col bg-[#0a0d12] transition-[width] " +
        (collapsed ? "w-16" : "w-72")
      }
    >
      <div className="flex h-16 items-center justify-between border-b border-white/5 px-4">
        <div
          className={
            "flex items-center gap-2.5 " +
            (collapsed ? "justify-center w-full" : "")
          }
        >
          {!collapsed && (
            <>
              <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-cyan-400 text-brand-foreground">
                <Sparkles className="size-4" strokeWidth={2.4} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-zinc-100">
                  dev·console
                </div>
                <div className="truncate text-[10px] text-zinc-500">
                  agente de terminal
                </div>
              </div>
            </>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            title="Recolher"
          >
            <ChevronsLeft className="size-4" />
          </button>
        )}
      </div>

      <div className="px-3 py-3">
        <button
          type="button"
          onClick={onNew}
          className={
            "flex w-full items-center gap-2 rounded-xl bg-brand font-medium text-brand-foreground shadow-md shadow-brand/20 transition-all hover:brightness-110 " +
            (collapsed
              ? "justify-center px-0 py-2.5"
              : "px-3 py-2.5 text-[13px]")
          }
          title={collapsed ? "Nova conversa" : undefined}
        >
          <MessageSquarePlus className="size-4" strokeWidth={2.4} />
          {!collapsed && <span>Nova conversa</span>}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
        {!collapsed && (
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Histórico
          </p>
        )}
        {sessions.length === 0 && !collapsed && (
          <p className="px-1 text-[12px] text-zinc-600">
            Nenhuma conversa ainda.
          </p>
        )}
        <div className="flex flex-col gap-1">
          {sessions.map((s) => {
            const active = s.id === activeId
            return (
              <div
                key={s.id}
                className={
                  "group flex items-center gap-1.5 rounded-lg px-2 py-2 transition-colors " +
                  (collapsed ? "justify-center" : "") +
                  (active ? " bg-brand/[0.1]" : " hover:bg-white/5")
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(s.id)
                    onCloseMobile()
                  }}
                  title={collapsed ? s.title : undefined}
                  className={
                    "flex min-w-0 flex-1 items-center gap-2 text-left " +
                    (collapsed ? "justify-center" : "")
                  }
                >
                  <span
                    className={
                      "size-1.5 shrink-0 rounded-full " +
                      (active ? "bg-brand" : "bg-zinc-700")
                    }
                  />
                  {!collapsed && (
                    <span className="truncate text-[12.5px] text-zinc-300">
                      {s.title}
                    </span>
                  )}
                </button>
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => onDelete(s.id)}
                    className="shrink-0 rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"
                    title="Excluir"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (!collapsed) {
    return (
      <>
        {/* Overlay no mobile */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            onClick={onCloseMobile}
            aria-hidden
          />
        )}
        <aside
          className={
            "z-40 h-dvh shrink-0 border-r border-white/5 lg:sticky lg:top-0 lg:flex lg:h-dvh " +
            (mobileOpen ? "fixed inset-y-0 left-0 flex" : "hidden lg:flex")
          }
        >
          {content}
        </aside>
      </>
    )
  }

  return (
    <aside className="h-dvh shrink-0 border-r border-white/5 lg:sticky lg:top-0 lg:h-dvh">
      {content}
    </aside>
  )
}

export function SidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
      title={collapsed ? "Abrir barra lateral" : "Fechar barra lateral"}
    >
      <PanelLeft className="size-4.5" />
    </button>
  )
}
