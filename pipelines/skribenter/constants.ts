export const DEFAULT_REGISTRY_FILE = 'data/skribenter.json'
export const DEFAULT_OUTPUT_DIR = 'output/skribenter'
export const DEFAULT_MANIFEST_FILE = 'manifest-kondensert.md'
export const DEFAULT_MANIFEST_KORT_FILE = 'manifest-kort.md'
export const DEFAULT_STYLE_FILE = 'docs/stilkort.md'

export const MODELS = {
  changeCheck: 'claude-haiku-4-5',
  research: 'claude-sonnet-5',
  writeProfile: 'claude-opus-5',
} as const

/**
 * Sonnet 5 og Opus 5 tenker adaptivt som standard, og tenkingen teller mot
 * max_tokens. I Message Batches er det ingen HTTP-timeout, så vi gir god
 * margin: et avkuttet svar (`max_tokens`) er ubrukelig og koster en hel
 * research-runde.
 */
export const MAX_TOKENS = {
  changeCheck: 8000,
  research: 48000,
  writeProfile: 32000,
} as const

/**
 * Øk denne når prompt, sidemal eller profilskjema endres på en måte som
 * gjør at alle eksisterende profiler bør skrives på nytt.
 */
export const PROFILE_TEMPLATE_VERSION = 1

export const THRESHOLDS = {
  /** En profil eldre enn dette får full ny research uansett. */
  maxProfileAgeDays: 180,
  /** For avdøde skribenter: sjeldnere fornyelse, og ingen endringssjekk. */
  maxProfileAgeDaysDeceased: 730,
  /** Hopp over LLM-endringssjekk hvis forrige sjekk er nyere enn dette. */
  minCheckIntervalDays: 5,
  /** Så mange nye tekster (uten andre hendelser) utløser full omskriving. */
  rewriteOnNewTexts: 5,
  /**
   * Funn fra endringssjekken datert mer enn så mange dager før forrige sjekk
   * regnes som gamle og ignoreres (se `dropStaleFindings`).
   */
  staleFindingSlackDays: 30,
  /** Maks antall websøk per steg. */
  changeCheckSearches: 4,
  researchSearches: 15,
  /** Tidsavbrudd for RSS/Atom-henting. */
  feedTimeoutMs: 15_000,
} as const

export const WEBSITE = {
  owner: 'Individet',
  repo: 'individet.github.io',
  baseBranch: 'main',
  contentDir: 'content/skribenter',
  imageDir: 'static/img/skribenter',
  imageUrlPrefix: '/img/skribenter',
  pageUrlPrefix: '/skribenter',
} as const

export const RAW_DATA = {
  owner: 'Individet',
  repo: 'r-data',
  branch: 'main',
  rootDir: 'skribenter',
} as const
