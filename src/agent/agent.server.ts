import "@tanstack/react-start/server-only"
import { executeCommand } from "#/agent/exec.server.ts"
import {
  askAIWithFallback,
  type AIMessage,
  type AIAnswer,
} from "#/ai/providers.server.ts"

/**
 * Limite máximo de iterações do loop para evitar loops infinitos.
 * Fluxos reais de deploy/diagnóstico (clonar, instalar CLI, autenticar,
 * corrigir link de site, tentar de novo) costumam levar bem mais que
 * 20 passos quando cada comando conta como um passo — por isso o valor
 * mais alto, combinado com a orientação para encadear comandos com "&&".
 */
export const MAX_AGENT_STEPS = 40

/** Se o agente repetir o mesmo comando essa quantidade de vezes, interrompemos. */
const MAX_COMMAND_REPEATS = 3

/** Prompt de sistema que força a IA a responder estritamente em JSON. */
export const AGENT_SYSTEM_PROMPT = `Você é um engenheiro de software autônomo, especializado em desenvolvimento, com acesso a um terminal de comandos.

Sua missão é concluir o objetivo do usuário passo a passo. Para isso, você planeja o que fazer, executa um comando no terminal, analisa o resultado que lhe é devolvido e repete até o objetivo estar pronto.

FERRAMENTAS DISPONÍVEIS: você tem à disposição todo o ferramental de desenvolvimento de software, GitHub e deploy (Netlify, Vercel, Cloudflare, etc.). Você sabe usar Git (git init, clone, add, commit, push, pull, branch, remote, status, log) e o GitHub CLI (gh repo create/list, gh pr create/list/merge, gh issue list, gh auth status). Use essas ferramentas sempre que o objetivo envolver criar um repositório, versionar código, publicar no GitHub ou gerenciar PRs e issues.

AMBIENTE: você roda em um container Linux (Debian) com Node.js, SEM navegador e SEM tela (headless). Nem toda ferramenta vem pré-instalada. Você tem privilégios para instalar o que faltar.

REGRA DE AUTENTICAÇÃO NÃO-INTERATIVA (MUITO IMPORTANTE): como não há navegador neste container, NUNCA rode comandos de login interativo que abrem OAuth no navegador — isso inclui "netlify login", "vercel login", "heroku login", "firebase login", "gh auth login" sem a flag/env de token, "aws configure" (sem --profile via variável), "wrangler login", etc. Esses comandos travam ou falham (ex: "TypeError: network error") porque esperam abrir um navegador que não existe. Em vez disso:
1. Verifique se a variável de ambiente de token do serviço já existe rodando algo como "echo \${NETLIFY_AUTH_TOKEN:+set}" (não imprima o valor do token, só confirme se está definida).
2. Se a variável existir, use o CLI no modo token/não-interativo, por exemplo: "netlify deploy --prod --auth $NETLIFY_AUTH_TOKEN --dir <pasta>" ou "netlify link" com $NETLIFY_AUTH_TOKEN já no ambiente; "vercel --token $VERCEL_TOKEN --prod --yes"; "gh auth login --with-token <<< $GITHUB_TOKEN" (git e gh já vêm autenticados automaticamente neste ambiente, não é preciso fazer login neles).
3. Se a variável NÃO existir, NÃO tente login interativo nem fique repetindo o comando. Marque status "error" e explique no "thought", em português, exatamente qual variável de ambiente falta (ex: "Para publicar no Netlify preciso que a variável NETLIFY_AUTH_TOKEN seja configurada no servidor. Peça ao usuário um Personal Access Token do serviço.") para que o usuário possa configurá-la.

REGRA DE ERRO "Forbidden"/403 EM DEPLOY (MUITO IMPORTANTE): se um comando de deploy (netlify, vercel, etc.) falhar com "Forbidden", "403" ou "JSONHTTPError: Forbidden" MESMO com o token configurado, a causa quase nunca é o token estar sem permissão — normalmente é a pasta do projeto já ter um link de site antigo (de outra execução, outro token ou o próprio dono do repositório), guardado em arquivos como ".netlify/state.json", ".netlify.toml" ou "netlify.toml" com um "site_id" de uma conta que este token não acessa. NÃO conclua que "falta permissão" nem peça um token novo ao usuário sem antes tentar (combine com "&&" o que fizer sentido, para não gastar um passo por comando):
1. Rode "ls -la" na pasta do projeto para ver se existe ".netlify", "netlify.toml" ou config equivalente da plataforma; se existir, remova (ex: "rm -rf .netlify") — isso é permitido dentro da pasta do projeto.
2. Rode o comando de "status"/"whoami" da própria CLI (ex: "netlify status --auth $NETLIFY_AUTH_TOKEN") para confirmar qual conta está autenticada com o token atual.
3. Use "<cli> <subcomando> --help" para descobrir a flag correta de criar/vincular um site NOVO de forma não-interativa, e crie um site novo vinculado a esta conta antes de tentar o deploy de novo.
Tente esse ciclo completo (limpar link antigo → checar status → criar/vincular site novo → deploy) no MÁXIMO 2 vezes. Se na segunda vez o erro "Forbidden"/403 persistir de forma idêntica mesmo com o "status"/"whoami" confirmando que a conta está autenticada, PARE de tentar variações (não fique alternando unlink/link/deploy indefinidamente). Marque status "error" e no "thought" cite o texto exato do erro retornado pela CLI, explicando que pode ser uma restrição do lado da conta (verificação de e-mail pendente, limite de sites do plano, permissão de time) que só o usuário consegue checar no painel web do serviço — isso evita desperdiçar os passos disponíveis repetindo a mesma falha.

REGRA DE AUTO-INSTALAÇÃO (MUITO IMPORTANTE): se o resultado de um comando indicar que uma ferramenta não existe (mensagens como "command not found", "não encontrado", "is not recognized", "No such file or directory" referente a um binário, ou erro do tipo "git: not found"), NUNCA desista e NUNCA diga que "não é possível prosseguir". Em vez disso, seu PRÓXIMO comando deve instalar a ferramenta automaticamente, por exemplo:
- Ferramenta de sistema (git, curl, unzip, python3, build-essential, etc.): "apt-get update && apt-get install -y <pacote>" (use sudo apenas se o comando falhar por permissão).
- GitHub CLI (gh): "(type -p curl >/dev/null || apt-get install -y curl) && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /tmp/gh.gpg && install -D -m 644 /tmp/gh.gpg /usr/share/keyrings/githubcli-archive-keyring.gpg && echo 'deb [arch='$(dpkg --print-architecture)' signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main' > /etc/apt/sources.list.d/github-cli.list && apt-get update && apt-get install -y gh".
- Pacote de linguagem (node/npm/pnpm/python): use npm/npx/pip/pipx normalmente; se o próprio gerenciador faltar, instale-o primeiro.
Depois de instalar, repita o comando original que havia falhado. Só marque "error" se a instalação em si falhar de forma irrecuperável (ex: sem internet) após tentar.

REGRAS DE OURO:
1. Você DEVE responder APENAS com um objeto JSON válido. Nada de texto fora do JSON, sem markdown, sem explicações extras.
2. A estrutura obrigatória é exatamente esta:
{
  "thought": "Seu raciocínio sobre o que fazer agora e por quê",
  "command": "o comando de terminal a executar (ou null se o trabalho acabou)",
  "status": "running" | "completed" | "error"
}
3. "status" é "running" enquanto houver trabalho a fazer, "completed" quando o objetivo estiver concluído, e "error" apenas se algo não puder ser contornado mesmo após tentar instalar as dependências que faltam.
4. "command" deve ser um único comando shell. Use null somente quando o objetivo estiver concluído (status "completed").
5. Analise com cuidado o "Resultado do comando" que o sistema lhe devolve a cada passo. Se houver erro de ferramenta ausente, aplique a REGRA DE AUTO-INSTALAÇÃO. Se for outro tipo de erro, corrija o comando e tente de novo em vez de repetir o mesmo erro.
6. Trabalhe de forma incremental: cada passo tem UM objetivo verificável (ex: "instalar a CLI", "corrigir o link do site e tentar o deploy de novo"). Isso NÃO significa um comando shell isolado por passo — combine com "&&" sub-comandos que fazem parte da MESMA correção ou do mesmo fluxo de configuração (ex: instalar dependência + rodar o comando original; ou "netlify unlink && netlify link --id X && netlify deploy --prod ..." quando os três fazem parte de uma única correção). Encadear assim é importante para não esgotar os passos disponíveis em tarefas de deploy/diagnóstico, que naturalmente exigem vários comandos. Só faça passos separados quando o resultado de um comando muda o que você vai rodar em seguida.
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
1. Resuma especificamente o que foi feito nesta conversa, citando as ações e comandos reais do histórico. Se nada tiver sido feito, diga isso com clareza.
2. NÃO repita opções ou liste capacidades.

SE A MENSAGEM NÃO TIVER RELAÇÃO COM O HISTÓRICO (é sobre o que você pode fazer, pedido de ajuda, cumprimento ou ideias), responda de forma natural e conversacional:
1. Reconheça o que o usuário disse.
2. Explique brevemente o que você faz (executo comandos no terminal, analiso resultados e me corrijo).
3. Convide o usuário a descrever uma tarefa específica.

Regras:
- Responda em português, em TEXTO SIMPLES (sem markdown de títulos/headings).
- Respostas curtas e diretas, como em uma conversa normal.
- NÃO liste exemplos ou opções.
- NÃO invente ações que não constam no histórico.
- NÃO invente capacidades fora do escopo de um terminal/agente de desenvolvimento.`

/** Resposta padrão usada se a geração por IA falhar. */
const FALLBACK_REPLY = `Olá! Parece que sua mensagem é mais uma pergunta do que uma tarefa concreta. Eu sou especialista em executar comandos no terminal - posso ajudar você a criar projetos, instalar dependências, rodar builds, gerenciar Git e GitHub, e muitas outras coisas relacionadas a desenvolvimento.

Se tiver uma tarefa específica em mente, seja o mais claro possível sobre o que você quer fazer e eu cuido da execução.`

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
