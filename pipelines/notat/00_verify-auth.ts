import Anthropic from '@anthropic-ai/sdk'
import { verifyGitHub } from '../utils/octokit.ts'

export interface AuthVerificationResult {
  anthropic: { ok: true; models: number } | { ok: false; error: string }
  github: { ok: true; login: string; rateLimit: number } | { ok: false; error: string }
}

async function verifyAnthropic(
  apiKey: string,
): Promise<AuthVerificationResult['anthropic']> {
  try {
    const client = new Anthropic({ apiKey })
    const { data } = await client.models.list({ limit: 1 })
    return { ok: true, models: data.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

export async function verifyAuth(): Promise<AuthVerificationResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const hasGitHubCreds = !!(process.env.GITHUB_APP_ID || process.env.GITHUB_TOKEN)

  const [anthropic, github] = await Promise.all([
    anthropicKey
      ? verifyAnthropic(anthropicKey)
      : Promise.resolve({ ok: false as const, error: 'ANTHROPIC_API_KEY mangler' }),
    hasGitHubCreds
      ? verifyGitHub()
      : Promise.resolve({ ok: false as const, error: 'GITHUB_TOKEN eller GITHUB_APP_* mangler' }),
  ])

  return { anthropic, github }
}

export function assertAuth(result: AuthVerificationResult): void {
  const errors: string[] = []

  if (!result.anthropic.ok) {
    errors.push(`Anthropic: ${result.anthropic.error}`)
  } else {
    console.log(
      `[verify-auth] Anthropic OK (${result.anthropic.models} modeller tilgjengelig)`,
    )
  }

  if (!result.github.ok) {
    errors.push(`GitHub: ${result.github.error}`)
  } else {
    console.log(
      `[verify-auth] GitHub OK (innlogget som @${result.github.login}, ${result.github.rateLimit} API-kall gjenstår)`,
    )
  }

  if (errors.length > 0) {
    throw new Error(
      `Autentisering feilet — pipeline avbrutt:\n${errors.map((e) => `  • ${e}`).join('\n')}`,
    )
  }
}
