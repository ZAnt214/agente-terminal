import type { ReactNode } from "react"

/** Renderiza um trecho inline: negrito, itálico, código e links. */
function Inline({ text }: { text: string }) {
  const tokens = text.split(
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g,
  )
  return (
    <>
      {tokens.map((t, i) => {
        if (t.startsWith("`") && t.endsWith("`") && t.length > 1) {
          return (
            <code
              key={i}
              className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[0.82em] text-brand"
            >
              {t.slice(1, -1)}
            </code>
          )
        }
        if (t.startsWith("**") && t.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-zinc-100">
              {t.slice(2, -2)}
            </strong>
          )
        }
        if (t.startsWith("*") && t.endsWith("*") && t.length > 1) {
          return <em key={i}>{t.slice(1, -1)}</em>
        }
        const link = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) {
          return (
            <a
              key={i}
              href={link[2]}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand underline decoration-brand/40 underline-offset-2"
            >
              {link[1]}
            </a>
          )
        }
        return <span key={i}>{t}</span>
      })}
    </>
  )
}

/** Divide blocos de código cercados por ``` do restante das linhas. */
function splitBlocks(raw: string): string[] {
  const lines = raw.split("\n")
  const blocks: string[] = []
  let cur: string[] = []
  let inFence = false
  let lang = ""
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (inFence) {
        blocks.push(`CODE\n${lang}\n${cur.join("\n")}`)
        cur = []
        inFence = false
        lang = ""
      } else {
        // fecha parágrafo em andamento
        if (cur.length) {
          blocks.push(cur.join("\n"))
          cur = []
        }
        inFence = true
        lang = line.replace(/^\s*```\s*/, "").trim()
      }
      continue
    }
    if (inFence) cur.push(line)
    else cur.push(line)
  }
  if (inFence) blocks.push(`CODE\n${lang}\n${cur.join("\n")}`)
  else if (cur.length) blocks.push(cur.join("\n"))
  return blocks
}

function List({ items, ordered }: { items: string[]; ordered: boolean }) {
  const Tag = (ordered ? "ol" : "ul") as "ol"
  return (
    <Tag
      className={
        "my-1.5 flex flex-col gap-1 " + (ordered ? "list-decimal" : "list-disc")
      }
    >
      {items.map((it, i) => (
        <li key={i} className="ml-5">
          <Inline text={it} />
        </li>
      ))}
    </Tag>
  )
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <pre className="my-2 overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[12.5px] leading-relaxed text-zinc-200 [scrollbar-width:thin]">
      {lang && (
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {lang}
        </div>
      )}
      <code className="whitespace-pre">{code}</code>
    </pre>
  )
}

/** Renderizador Markdown leve e seguro para as respostas do agente. */
export function Markdown({ children }: { children: string }) {
  const blocks = splitBlocks(children)
  const out: ReactNode[] = []
  let listBuf: string[] = []
  let ordered = false

  const flushList = (key: number) => {
    if (listBuf.length) {
      out.push(<List key={key} items={listBuf} ordered={ordered} />)
      listBuf = []
    }
  }

  let i = 0
  for (const block of blocks) {
    if (block.startsWith("CODE\n")) {
      flushList(i)
      const rest = block.slice(5)
      const nl = rest.indexOf("\n")
      const lang = rest.slice(0, nl)
      const code = rest.slice(nl + 1)
      out.push(<CodeBlock key={i} lang={lang} code={code} />)
      i++
      continue
    }
    const lines = block.split("\n")
    for (const line of lines) {
      const head = line.match(/^(#{1,3})\s+(.*)/)
      const listItem = line.match(/^\s*([-*]|\d+[.)])\s+(.*)/)
      const quote = line.match(/^\s*>\s?(.*)/)
      if (head) {
        flushList(i)
        const level = head[1].length
        const Tag = `h${level}` as "h2" as "h1"
        out.push(
          <Tag
            key={i}
            className={
              level === 1
                ? "mb-1.5 mt-3 text-lg font-bold text-zinc-50"
                : "mb-1 mt-2.5 text-[15px] font-semibold text-zinc-100"
            }
          >
            <Inline text={head[2]} />
          </Tag>,
        )
        i++
      } else if (listItem) {
        ordered = /^\s*\d/.test(listItem[1])
        listBuf.push(listItem[2])
      } else if (quote) {
        flushList(i)
        out.push(
          <blockquote
            key={i}
            className="my-2 border-l-2 border-brand/50 pl-3 text-zinc-400"
          >
            <Inline text={quote[1]} />
          </blockquote>,
        )
        i++
      } else if (line.trim() === "") {
        flushList(i)
      } else {
        flushList(i)
        out.push(
          <p key={i} className="my-1.5 leading-relaxed text-zinc-200">
            <Inline text={line} />
          </p>,
        )
        i++
      }
    }
  }
  flushList(i)

  return <div className="space-y-1 text-[14px]">{out}</div>
}
