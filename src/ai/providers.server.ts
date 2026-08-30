import "@tanstack/react-start/server-only"

// Função para obter variáveis de ambiente de forma compatível
function getEnvVar(key: string): string | undefined {
  // Tentar process.env primeiro (Node.js, Railway)
  if (typeof process !== "undefined" && process.env) {
    return process.env[key]
  }
  // Fallback para globalThis (pode ser necessário em alguns ambientes)
  return (globalThis as any)[key]
}

/** Configuração de cada provedor de IA disponível na fila de fallback. */
export interface AIProviderConfig {
  /** Nome amigável usado nas mensagens de log. */
  name: string
  /** Endpoint HTTP (chat/completions no formato OpenAI). */
  url: string
  /** Identificador do modelo a ser usado nesse provedor. */
  model: string
  /** Nome da variável de ambiente que guarda a API key. */
  envKey: string
}

/**
 * Fila de provedores de IA. A ordem aqui define a ordem de tentativa: quando um
 * esgota o rate limit, o sistema segue para o próximo.
 */
export const aiProviders: AIProviderConfig[] = [
  {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4o-mini",
    envKey: "OPENROUTER_API_KEY",
  },
  {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "qwen/qwen3.8-27b",
    envKey: "GROQ_API_KEY",
  },
  {
    name: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
    model: "gemini-3.6-flash",
    envKey: "GEMINI_API_KEY",
  },
]

/** Mensagem no histórico de conversa enviado à IA. */
export interface AIMessage {
  role: "system" | "user" | "assistant"
  content: string
}

/** Resposta final devolvida ao frontend. */
export interface AIAnswer {
  provider: string
  text: string
  ok: boolean
}

/** Converte o histórico em payload para Gemini (formato contents). */
function toGeminiContents(messages: AIMessage[]) {
  const contents: Array<{
    role: string
    parts: Array<{ text: string }>
  }> = []

  let system = ""
  for (const m of messages) {
    if (m.role === "system") {
      system = (system ? system + "\n\n" : "") + m.content
      continue
    }
    const text = system ? `${system}\n\n${m.content}` : m.content
    system = ""
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    })
  }
  if (system) contents.push({ role: "user", parts: [{ text: system }] })
  return contents
}

/**
 * Faz uma chamada HTTP para um provedor específico.
 *
 * Suporta dois formatos de API:
 * - OpenAI-compatível (OpenRouter, Groq): `choices[0].message.content`
 * - Gemini: `candidates[0].content.parts[0].text`
 */
async function callProvider(
  provider: AIProviderConfig,
  messages: AIMessage[],
): Promise<string> {
  const apiKey = getEnvVar(provider.envKey as string)
  if (!apiKey) {
    throw new Error(`[Fallback] Chave "${provider.envKey}" não configurada`)
  }

  const isGemini = provider.url.includes("generativelanguage.googleapis.com")

  const url = isGemini
    ? `${provider.url}?key=${encodeURIComponent(apiKey)}`
    : provider.url

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (!isGemini) headers.Authorization = `Bearer ${apiKey}`

  const body = isGemini
    ? { contents: toGeminiContents(messages) }
    : {
        model: provider.model,
        messages,
        temperature: 0.7,
      }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = new Error(
      `[Fallback] ${provider.name} respondeu HTTP ${response.status}`,
    ) as Error & { status?: number }
    error.status = response.status
    throw error
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }

  const text = isGemini
    ? data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")
    : data.choices?.[0]?.message?.content

  if (!text || text.trim().length === 0) {
    throw new Error(`[Fallback] ${provider.name} retornou resposta vazia`)
  }

  return text
}

/**
 * Função assíncrona recursiva de fallback.
 *
 * Tenta o provedor em `providerIndex`; se a chamada falhar — especialmente com
 * 429 (Too Many Requests) ou erros 5xx — parte para o próximo provedor da fila.
 * Quando não houver mais provedores, devolve uma mensagem limpa ao frontend.
 */
export async function askAIWithFallback(
  messages: AIMessage[],
  providerIndex = 0,
): Promise<AIAnswer> {
  // Acabaram os provedores: avisa o frontend com uma mensagem limpa.
  if (providerIndex >= aiProviders.length) {
    return {
      provider: "todos",
      ok: false,
      text: "Todas as IAs esgotaram seus limites de requisições no momento. Tente novamente em alguns instantes.",
    }
  }

  const provider = aiProviders[providerIndex]

  try {
    const text = await callProvider(provider, messages)
    return { provider: provider.name, text, ok: true }
  } catch (error) {
    const status = (error as { status?: number }).status
    // 429 = rate limit; 5xx = erro de servidor. Ambas disparam o fallback.
    const shouldFallback =
      status === 429 || (status !== undefined && status >= 500 && status < 600)

    if (!shouldFallback) {
      // Erro não retentável (ex: 400, 401): não faz sentido trocar de IA.
      throw error
    }

    console.error(
      `[Fallback] Limite da IA ${providerIndex + 1} (${provider.name}) atingido ` +
        `(HTTP ${status ?? "erro"}). Trocando para IA ${providerIndex + 2}...`,
    )

    return askAIWithFallback(messages, providerIndex + 1)
  }
}
