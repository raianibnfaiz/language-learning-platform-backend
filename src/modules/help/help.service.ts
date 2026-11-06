import { env } from '../../config/env.js'
import { AppError } from '../../core/errors.js'

/**
 * (phase 2) Server-side "Pip". For now Pip stays on the clients (offline, instant) and personalises
 * its answers with GET /me/summary. When HELP_BOT_MODE=intents this will port helpBot.ts intents
 * (same scoring); HELP_BOT_MODE=llm adds an LLM fallback.
 */
export interface HelpBot {
  ask(
    question: string,
    context: {
      due: number
      heard: number
      xp: number
      level: number
      streak: number
      recentLanguage: string | null
    },
  ): Promise<{ intent: string; answer: string }>
}

export function getHelpBot(): HelpBot {
  throw new AppError(
    'NOT_ENABLED',
    env.HELP_BOT_MODE === 'off'
      ? 'The server-side help bot is not enabled'
      : `HELP_BOT_MODE=${env.HELP_BOT_MODE} is not implemented yet`,
  )
}
