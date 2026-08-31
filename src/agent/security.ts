import "@tanstack/react-start/server-only"
import { resolve as resolvePath } from "node:path"
import { mkdirSync } from "node:fs"

/**
 * Diretório isolado onde o agente pode executar comandos
 * Tudo fora disso é bloqueado
 *
 * Resolvido para caminho absoluto e criado se necessário: como esse diretório
 * também é usado como HOME dos comandos executados (git config, gh config,
 * etc.), um caminho relativo inexistente faria essas ferramentas falharem
 * silenciosamente ao tentar escrever ali.
 */
const SAFE_BASE_DIR = resolvePath(process.env.AGENT_BASE_DIR || "./projects")
try {
  mkdirSync(SAFE_BASE_DIR, { recursive: true })
} catch {
  // Ambiente sem permissão de escrita (ex: build-time) — ignora
}

/**
 * Comandos absolutamente proibidos (destrutivos ou de risco)
 * Padrão case-insensitive
 */
const BLOCKED_COMMANDS = [
  // Destruição de dados
  /^\s*(sudo\s+)?rm\s+(-rf|-r|-f|--recursive|--force)/i,
  /^\s*(sudo\s+)?mkfs/i,
  /^\s*(sudo\s+)?dd\s+/i,
  /^\s*(sudo\s+)?fdisk\s+/i,
  /^\s*(sudo\s+)?parted\s+/i,

  // Shutdown / reboot
  /^\s*(sudo\s+)?(shutdown|reboot|halt|poweroff)/i,

  // System modification
  /^\s*(sudo\s+)?systemctl\s+(disable|stop|kill)/i,
  /^\s*(sudo\s+)?service\s+/i,
  /^\s*(sudo\s+)?systemd/i,

  // Kernel / boot
  /^\s*(sudo\s+)?(grub|lilo|kernel|initrd)/i,

  // Network modifications
  /^\s*(sudo\s+)?(iptables|firewall|ufw|ip\s+(addr|route|link))/i,

  // User/permission escalation
  /^\s*(sudo\s+)?(useradd|userdel|usermod|passwd|chmod|chown|chmod)\s+/i,
  /^\s*(sudo\s+)?visudo/i,
  /^\s*(sudo\s+)?sudo\s+/i, // sudo + sudo

  // Remote access / shell escapes
  /^\s*(nc|ncat|netcat|telnet|rsh|rssh|ssh\s+-o.*ProxyCommand)/i,
  /^\s*curl\s+.*exec/i,
  /^\s*wget\s+.*exec/i,

  // Package manager risks
  /^\s*(sudo\s+)?(apt|yum|pacman|brew|npm|pip)\s+(remove|uninstall|purge|clean|autoremove)/i,
  /^\s*(sudo\s+)?npm\s+(uninstall|remove)\s+-g/i, // uninstall global packages

  // Processes
  /^\s*(sudo\s+)?killall\s+-9/i,
  /^\s*(sudo\s+)?pkill\s+-9/i,
]

/**
 * Validar se um comando é seguro para executar
 * Retorna { ok: true } se seguro, ou { ok: false, reason: "..." } se bloqueado
 */
export function validateCommand(command: string): {
  ok: boolean
  reason?: string
} {
  const trimmed = command.trim()

  if (!trimmed) {
    return { ok: false, reason: "Comando vazio" }
  }

  // Verificar contra lista de bloqueios
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        reason: `Comando bloqueado por política de segurança: "${command.slice(0, 50)}"`,
      }
    }
  }

  // Limite de comprimento (evitar DoS)
  if (command.length > 2000) {
    return {
      ok: false,
      reason: "Comando muito longo (máximo 2000 caracteres)",
    }
  }

  return { ok: true }
}

/**
 * Registrar execução de comando para auditoria
 */
export function logCommandExecution(
  command: string,
  status: "allowed" | "blocked",
  sessionId?: number,
): void {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    status,
    command: command.slice(0, 200), // truncar para segurança
    sessionId,
  }

  // Em produção, enviar para um serviço de logging
  if (process.env.NODE_ENV === "production") {
    console.warn("[AGENT SECURITY]", JSON.stringify(logEntry))
  } else {
    console.debug("[AGENT SECURITY]", logEntry)
  }
}

/**
 * Sanitizar caminho de arquivo (evitar traversal attacks)
 * Garante que o arquivo fica dentro de SAFE_BASE_DIR
 */
export function isSafePath(filePath: string): boolean {
  try {
    // Resolver caminho relativo
    const fullPath = resolvePath(SAFE_BASE_DIR, filePath)
    const basePath = resolvePath(SAFE_BASE_DIR)

    // Verificar se está dentro de SAFE_BASE_DIR
    return fullPath.startsWith(basePath)
  } catch {
    return false
  }
}

/** Caminho absoluto do diretório isolado onde o agente trabalha. */
export function getSafeBaseDir(): string {
  return SAFE_BASE_DIR
}

/**
 * Configurar variáveis de ambiente para isolamento
 */
export function getSafeEnv(): Record<string, string> {
  const env: Record<string, string> = {
    // Permitir apenas essencial
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: SAFE_BASE_DIR,
    USER: process.env.USER || "agent",
    LANG: process.env.LANG || "en_US.UTF-8",

    // Desabilitar histórico
    HISTFILE: "/dev/null",

    // Limitar recursos
    BASH_ENV: "/dev/null",
    ENV: "/dev/null",

    // Evita que apt-get/dpkg fiquem esperando confirmação interativa
    // (o agente às vezes precisa instalar ferramentas ausentes em runtime)
    DEBIAN_FRONTEND: "noninteractive",
  }

  // Token do GitHub: repassado apenas para o processo do comando (nunca para
  // o prompt da IA). O git é configurado para usá-lo automaticamente via
  // credential rewrite (ver configureGitAuth em exec.server.ts) e o `gh` CLI
  // lê GH_TOKEN/GITHUB_TOKEN nativamente do ambiente.
  if (process.env.GITHUB_TOKEN) {
    env.GITHUB_TOKEN = process.env.GITHUB_TOKEN
    env.GH_TOKEN = process.env.GITHUB_TOKEN
  }

  // Tokens de outras plataformas de deploy/integrações: repassados só se
  // existirem no ambiente do servidor (configurados pelo usuário no Railway).
  // Nunca aparecem no prompt da IA — ela só vê o resultado dos comandos.
  // Cada CLI lê sua variável nativamente em modo não-interativo (sem precisar
  // de "login" via navegador, que não funciona neste container headless).
  const PASSTHROUGH_TOKEN_VARS = [
    "NETLIFY_AUTH_TOKEN",
    "NETLIFY_SITE_ID",
    "VERCEL_TOKEN",
    "VERCEL_ORG_ID",
    "VERCEL_PROJECT_ID",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "HEROKU_API_KEY",
    "FLY_API_TOKEN",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION",
    "NPM_TOKEN",
    "DOCKER_USERNAME",
    "DOCKER_PASSWORD",
    "SUPABASE_ACCESS_TOKEN",
    "RAILWAY_TOKEN",
  ]
  for (const key of PASSTHROUGH_TOKEN_VARS) {
    const value = process.env[key]
    if (value) env[key] = value
  }

  return env
}
