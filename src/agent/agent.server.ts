import "@tanstack/react-start/server-only"
import { executeCommand } from "#/agent/exec.server.ts"
import {
  askAIWithFallback,
  type AIMessage,
  type AIAnswer,
} from "#/ai/providers.server.ts"

/** Limite máximo de iterações do loop para evitar loops infinitos. */
export const MAX_AGENT_STEPS = 20

/** Se o agente repetir o mesmo comando essa quantidade de vezes, interrompemos. */
const MAX_COMMAND_REPEATS = 3

/** Prompt de sistema que força a IA a responder estritamente em JSON. */
export const AGENT_SYSTEM_PROMPT = `Você é um engenheiro de software autônomo, especializado em desenvolvimento, com acesso a um terminal de comandos.

Sua missão é concluir o objetivo do usuário passo a passo. Para isso, você planeja o que fazer, executa um comando no terminal, analisa o resultado que lhe é devolvido e repete até o objetivo estar pronto.

FERRAMENTAS DISPONÍVEIS: você tem à disposição todo o ferramental de desenvolvimento de software e de GitHub. Você sabe usar Git (git init, clone, add, commit, push, pull, branch, remote, status, log) e o GitHub CLI (gh repo create/list, gh pr create/list/merge, gh issue list, gh auth status). Use essas ferramentas sempre que o objetivo envolver criar um repositório, versionar código, publicar no GitHub ou gerenciar PRs e issues.

REGRAS DE OURO:
1. Você DEVE responder APENAS com um objeto JSON válido. Nada de texto fora do JSON, sem markdown, sem explicações extras.
2. A estrutura obrigatória é exatamente esta:
{
  "thought": "Seu raciocínio sobre o que fazer agora e por quê",
  "command": "o comando de terminal a executar (ou null se o trabalho acabou)",
  "status": "running" | "completed" | "error"
}
3. "status" é "running" enquanto houver trabalho a fazer, "completed" quando o objetivo estiver concluído, e "error" apenas se algo não puder ser contornado.
4. "command" deve ser um único comando shell. Use null somente quando o objetivo estiver concluído (status "completed").
5. Analise com cuidado o "Resultado do comando" que o sistema lhe devolve a cada passo. Se houver erro, corrija o comando e tente de novo em vez de repetir o mesmo erro.
6. Trabalhe de forma incremental: cada passo executa UMA ação. Não tente fazer tudo de uma vez.
7. Quando terminar, devolva status "completed", command null, e um thought resumindo o que foi feito.
8. Responda em português no campo "thought".`

/** Mensagem injetada quando a IA devolve um texto fora do formato JSON. */
const FORMAT_ERROR_MESSAGE =
  "Erro de formato. Responda estritamente no formato JSON solicitado."

/** Prompt que classifica a intenção da mensagem do usuário. */
const INTENT_SYSTEM_PROMPT = `Você é um classificador de intenção. Analise a mensagem do usuário e responda APENAS com um objeto JSON:
{ "type": "task" | "ask" | "smalltalk" }

Definições:
- "task": a mensagem descreve uma tarefa concreta para executar em um terminal (criar/instalar/configurar, listar arquivos, ver versões, rodar build, gerenciar projeto, versionar código ou usar GitHub). Ex: "crie um projeto React e instale o Tailwind", "liste os arquivos", "qual a versão do node?", "crie um repositório no GitHub e faça o primeiro commit", "faça push das alterações", "crie um pull request".
- "ask": a mensagem é vaga, incompleta, uma pergunta sobre o que você pode fazer, ou um pedido de ajuda/ideias sem uma ação clara. Ex: "me ajuda", "o que você faz?", "quero fazer algo", "me dê ideias".
- "smalltalk": cumprimento, agradecimento ou assunto fora de escopo. Ex: "oi", "olá", "bom dia", "obrigado".

Regras:
- Sem verbo de ação claro ou sem objetivo executável → "ask".
- Cumprimento puro → "smalltalk".
- Dúvida sobre recursos/capacidades → "ask".
Responda apenas o JSON, sem texto extra.`

/** Prompt para gerar a resposta amigável quando a mensagem não é uma tarefa. */
const CONVERSATION_PROMPT = `Você é o "dev·console agent", uma IA que planeja, executa comandos em um terminal, analisa os resultados e se corrige até concluir uma tarefa.

Você receberá o HISTÓRICO da conversa atual e a MENSAGEM mais recente do usuário.

SE A MENSAGEM SE REFERE AO QUE JÁ FOI FEITO NESTA CONVERSA (por exemplo: "você fez algo?", "o que você fez?", "o que já foi feito?", "deu certo?", "qual o resultado?"), responda DIRETAMENTE com base no histórico:
1. Reconheça a pergunta em 1 linha.
2. Resuma especificamente o que foi feito nesta conversa, citando as ações e comandos reais do histórico. Se nada tiver sido feito, diga isso com clareza.
3. NÃO liste exemplos genéricos de capacidades nem repita opções de tarefas.

SE A MENSAGEM NÃO TIVER RELAÇÃO COM O HISTÓRICO (é sobre o que você pode fazer, pedido de ajuda, ou ideias), responda de forma amigável:
1. Cumprimente ou reconheça a mensagem (em 1 linha).
2. Explique brevemente o que você faz (planejo, executo comandos, analiso resultados e me corrijo até concluir).
3. Liste 3-5 exemplos de objetivos concretos que o usuário pode me pedir, como lista com marcadores.
4. Convide o usuário a ser específico sobre o que deseja.

Regras:
- Responda em português, em Markdown, de forma curta.
- NÃO use comandos de terminal no texto.
- NÃO invente ações que não constam no histórico.
- NÃO invente capacidades fora do escopo de um terminal/agente de desenvolvimento.`

/** Resposta padrão usada se a geração por IA falhar. */
const FALLBACK_REPLY = `## Olá! Eu sou o dev·console agent

Não identifiquei uma tarefa concreta para executar no terminal. Eu **planejo, executo comandos, analiso o resultado e me corrijo** até concluir o objetivo.

### Exemplos do que você pode me pedir

- Crie um projeto React chamado \`meu-app\` e instale o Tailwind
- Verifique a versão do Node instalada
- Liste os arquivos do diretório atual
- Instale o Tailwind CSS no projeto
- Rode o build e me diga se deu certo

Seja específico sobre o que quer que eu faça e eu executo por você.`

/** Eventos emitidos ao frontend para acompanhar a execução ao vivo. */
export type AgentEvent =
  | { type: "thought"; text: string; step: number }
  | { type: "command"; command: string; step: number }
  | { type: "log"; text: string }
  | { type: "done"; summary: string }
  | { type: "error"; message: string }

interface AgentAction {
  thought: string
  command: string | null
  status: "running" | "completed" | "error"
}

/** Extrai e valida o objeto JSON da resposta da IA, tolerando markdown. */
function parseAgentAction(raw: string): AgentAction | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
  try {
    const data = JSON.parse(cleaned) as Partial<AgentAction>
    if (typeof data !== "object" || data === null) return null
    return {
      thought:
        typeof data.thought === "string"
          ? data.thought
          : String(data.thought ?? ""),
      command: typeof data.command === "string" ? data.command : null,
      status:
        data.status === "running" ||
        data.status === "completed" ||
        data.status === "error"
          ? data.status
          : "running",
    }
  } catch {
    return null
  }
}

type Intent = "task" | "ask" | "smalltalk"

/** Uma troca (turno) anterior da conversa, usada como contexto para o agente. */
export interface ChatTurn {
  role: "user" | "assistant"
  content: string
}

/** Formata os turnos anteriores como texto legível para a IA. */
function formatHistory(history: ChatTurn[]): string {
  if (history.length === 0) return "(nenhum histórico nesta conversa)"
  return history
    .map((h) => `- ${h.role === "user" ? "Usuário" : "Agente"}: ${h.content}`)
    .join("\n")
}

/**
 * Classifica a intenção da mensagem do usuário. Se a classificação falhar,
 * assume "task" (mantém o comportamento atual de executar).
 */
async function classifyIntent(
  userGoal: string,
  history: ChatTurn[] = [],
): Promise<Intent> {
  const msgs: AIMessage[] = [
    { role: "system", content: INTENT_SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userGoal },
  ]
  try {
    const answer = await askAIWithFallback(msgs, 0)
    if (!answer.ok) return "task"
    const cleaned = answer.text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
    const data = JSON.parse(cleaned) as { type?: string }
    if (data.type === "ask" || data.type === "smalltalk") return data.type
  } catch {
    // ignore e assume task
  }
  return "task"
}

/** Gera uma resposta amigável (com sugestões) quando a mensagem não é uma tarefa. */
async function respondConversational(
  userGoal: string,
  history: ChatTurn[] = [],
): Promise<string> {
  const msgs: AIMessage[] = [
    { role: "system", content: CONVERSATION_PROMPT },
    {
      role: "user",
      content: `HISTÓRICO DA CONVERSA:\n${formatHistory(history)}\n\nMensagem do usuário: ${userGoal}`,
    },
  ]
  try {
    const answer = await askAIWithFallback(msgs, 0)
    if (answer.ok && answer.text.trim()) return answer.text.trim()
  } catch {
    // usa o fallback abaixo
  }
  return FALLBACK_REPLY
}

/**
 * Loop ReAct: planeja → executa → lê o resultado → corrige → repete.
 *
 * - Adiciona o objetivo do usuário ao histórico.
 * - Chama askAIWithFallback com o histórico acumulado.
 * - Emite o pensamento da IA ao frontend via callback (equivalente ao socket).
 * - Se houver command, executa e anexa o log ao histórico.
 * - Encerra em "completed", ou após MAX_AGENT_STEPS, ou quando a IA marca erro.
 */
export async function runAgentLoop(
  userGoal: string,
  emit: (event: AgentEvent) => void,
  prior: ChatTurn[] = [],
): Promise<void> {
  const history: AIMessage[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    ...prior.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: `Objetivo do usuário: ${userGoal}` },
  ]

  // Se a mensagem não é uma tarefa concreta (pergunta, cumprimento, vaga),
  // respondemos de forma conversacional, sem executar comandos sem sentido.
  const intent = await classifyIntent(userGoal, prior)
  if (intent === "ask" || intent === "smalltalk") {
    const reply = await respondConversational(userGoal, prior)
    emit({ type: "done", summary: reply })
    return
  }

  // Proteção contra loops sem progresso real.
  let lastCommand = ""
  let commandRepeats = 0

  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    let answer: AIAnswer
    try {
      // Perto do fim, incentiva a IA a encerrar se o objetivo já estiver pronto.
      if (step === MAX_AGENT_STEPS - 1) {
        history.push({
          role: "user",
          content:
            'ATENÇÃO: você está perto do limite de passos. Se o objetivo já estiver essencialmente cumprido, responda com status "completed" e command null para encerrar agora.',
        })
      }
      answer = await askAIWithFallback(history, 0)
    } catch {
      emit({
        type: "error",
        message:
          "Falha na chamada de IA (provavelmente chave ausente ou erro de autenticação).",
      })
      return
    }

    if (!answer.ok) {
      emit({ type: "error", message: answer.text })
      return
    }

    const action = parseAgentAction(answer.text)

    // A IA não respeitou o formato JSON: instruímos e repetimos o passo.
    if (!action) {
      history.push({ role: "user", content: FORMAT_ERROR_MESSAGE })
      continue
    }

    emit({ type: "thought", text: action.thought, step })

    if (action.status === "completed") {
      emit({ type: "done", summary: action.thought })
      return
    }

    if (action.status === "error") {
      emit({ type: "error", message: action.thought })
      return
    }

    if (action.command) {
      // Detecta repetição do mesmo comando (indício de que está travado).
      if (action.command === lastCommand) commandRepeats++
      else commandRepeats = 1
      lastCommand = action.command
      if (commandRepeats >= MAX_COMMAND_REPEATS) {
        emit({
          type: "error",
          message:
            "O agente está repetindo o mesmo comando sem progresso. Interrompi para evitar um loop; reformule o objetivo e tente de novo.",
        })
        return
      }

      emit({ type: "command", command: action.command, step })
      const logs = await executeCommand(action.command)
      emit({ type: "log", text: logs })

      // Anexa o pensamento como assistant e o resultado como nova mensagem.
      history.push({ role: "assistant", content: JSON.stringify(action) })
      history.push({
        role: "user",
        content: `Resultado do comando:\n${logs}`,
      })
    } else {
      // command null mas status running: pedimos que a IA decida o que fazer.
      history.push({
        role: "user",
        content:
          'Você devolveu command null sem marcar status "completed". Se o objetivo acabou, marque "completed". Caso contrário, envie o próximo comando.',
      })
    }
  }

  emit({
    type: "error",
    message: `Limite de ${MAX_AGENT_STEPS} passos atingido sem concluir o objetivo.`,
  })
}
