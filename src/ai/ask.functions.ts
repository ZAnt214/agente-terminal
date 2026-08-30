import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { askAIWithFallback, type AIAnswer } from "#/ai/providers.server.ts"

/** Prompt enviado pelo frontend para a fila de IA. */
export const askAI = createServerFn({ method: "POST" })
  .validator(z.object({ prompt: z.string().min(1) }))
  .handler(async ({ data }): Promise<AIAnswer> => {
    return askAIWithFallback([{ role: "user", content: data.prompt }], 0)
  })
