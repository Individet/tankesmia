import Anthropic from '@anthropic-ai/sdk'
import { Octokit } from '@octokit/rest'

export interface AuthVerificationResult {
  anthropic: { ok: true; models: number } | { ok: false; error: string }
  github: { ok: true; login: string; rateLimit: number } | { ok: false; error: string }
}

async function verifyAnthropic(apiKey: string): Promise<AuthVerificationResult['anthropic']> {
  try {
    const client = new Anthropic({ apiKey })
    const { data } = await client.models.list({ limit: 1 })
    return { ok: true, models: data.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

async function verifyGitHub(token: string): Promise<AuthVerificationResult['github']> {
  try {
    const octokit = new Octokit({ auth: token })
    const [userResponse, rateLimitResponse] = await Promise.all([
      octokit.rest.users.getAuthenticated(),
      octokit.rest.rateLimit.get(),
    ])
    return {
      ok: true,
      login: userResponse.data.login,
      rateLimit: rateLimitResponse.data.rate.remaining,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

export async function verifyAuth(): Promise<AuthVerificationResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const githubToken = process.env.GITHUB_TOKEN

  const [anthropic, github] = await Promise.all([
    anthropicKey
      ? verifyAnthropic(anthropicKey)
      : Promise.resolve({ ok: false as const, error: 'ANTHROPIC_API_KEY mangler' }),
    githubToken
      ? verifyGitHub(githubToken)
      : Promise.resolve({ ok: false as const, error: 'GITHUB_TOKEN mangler' }),
  ])

  return { anthropic, github }
}

export function assertAuth(result: AuthVerificationResult): void {
  const errors: string[] = []

  if (!result.anthropic.ok) {
    errors.push(`Anthropic: ${result.anthropic.error}`)
  } else {
    console.log(`[verify-auth] Anthropic OK (${result.anthropic.models} modeller tilgjengelig)`)
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
