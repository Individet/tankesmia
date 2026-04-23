import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'

export type GitHubVerificationResult =
  | { ok: true; login: string; rateLimit: number }
  | { ok: false; error: string }

export function createOctokit(): Octokit {
  if (process.env.GITHUB_APP_ID) {
    const appId = Number(process.env.GITHUB_APP_ID)
    const installationId = Number(process.env.GITHUB_APP_INSTALLATION_ID)
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY

    if (!privateKey) {
      throw new Error('GITHUB_APP_PRIVATE_KEY mangler. Sett variabelen når GITHUB_APP_ID er satt.')
    }
    if (!process.env.GITHUB_APP_INSTALLATION_ID || Number.isNaN(installationId)) {
      throw new Error(
        'GITHUB_APP_INSTALLATION_ID mangler eller er ugyldig. Sett variabelen når GITHUB_APP_ID er satt.',
      )
    }

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
        installationId,
      },
    })
  }

  if (process.env.GITHUB_TOKEN) {
    return new Octokit({ auth: process.env.GITHUB_TOKEN })
  }

  throw new Error(
    'Ingen GitHub-autentisering funnet. Sett GITHUB_TOKEN lokalt, eller GITHUB_APP_* i CI.',
  )
}

export async function verifyGitHub(): Promise<GitHubVerificationResult> {
  try {
    const octokit = createOctokit()
    const rateLimitResponse = await octokit.rest.rateLimit.get()

    let login: string
    if (process.env.GITHUB_APP_ID) {
      login = `app:${process.env.GITHUB_APP_ID}`
    } else {
      const userResponse = await octokit.rest.users.getAuthenticated()
      login = userResponse.data.login
    }

    return {
      ok: true,
      login,
      rateLimit: rateLimitResponse.data.rate.remaining,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

export async function assertGitHubAuth(): Promise<void> {
  const hasGitHubCreds = !!(process.env.GITHUB_APP_ID || process.env.GITHUB_TOKEN)
  if (!hasGitHubCreds) {
    throw new Error(
      'Autentisering feilet — pipeline avbrutt:\n  • GitHub: GITHUB_TOKEN eller GITHUB_APP_* mangler',
    )
  }

  const result = await verifyGitHub()
  if (!result.ok) {
    throw new Error(`Autentisering feilet — pipeline avbrutt:\n  • GitHub: ${result.error}`)
  }

  console.log(
    `[verify-auth] GitHub OK (innlogget som @${result.login}, ${result.rateLimit} API-kall gjenstår)`,
  )
}
