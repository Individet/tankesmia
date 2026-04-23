import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'

export function createOctokit(): Octokit {
  if (process.env.GITHUB_APP_ID) {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(process.env.GITHUB_APP_ID),
        privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
        installationId: Number(process.env.GITHUB_APP_INSTALLATION_ID),
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
