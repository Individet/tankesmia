export const CONFIG = {
  models: {
    research: 'claude-sonnet-4-6',
    report: 'claude-opus-4-6',
  },
  github: {
    rawDataRepo: {
      owner: process.env.GITHUB_ORG ?? 'tenketanken',
      repo: 'isi-rådata',
    },
    websiteRepo: {
      owner: process.env.GITHUB_ORG ?? 'tenketanken',
      repo: 'individets-suverenitet',
    },
    baseBranch: 'main',
  },
  polling: {
    intervalMs: 60_000, // spør hvert minutt
  },
}
