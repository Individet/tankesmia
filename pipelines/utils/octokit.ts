import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'

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
