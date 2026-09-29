import type { BatchUsage } from '../notat/types.ts'

export type {
  BatchTransport,
  BatchUsage,
  PipelineBatchRequest,
  PipelineBatchResult,
} from '../notat/types.ts'

export interface LinkRef {
  /** hjemmeside | substack | blogg | x | facebook | instagram | linkedin | youtube | podcast | wikipedia | forfatterside | akademisk | annet */
  type: string
  url: string
  label?: string
}

/** Én oppføring i data/skribenter.json. */
export interface WriterRegistryEntry {
  id: string
  name: string
  description: string
  born?: number | null
  died?: number | null
  affiliations?: string[]
  identification?: string
  links?: LinkRef[]
  /** RSS/Atom-feeder som sjekkes deterministisk (uten LLM) hver kjøring. */
  feeds?: string[]
  suggested?: boolean
  enabled?: boolean
}

export interface WriterRegistry {
  writers: WriterRegistryEntry[]
}

export type TextKind =
  | 'bok'
  | 'artikkel'
  | 'kronikk'
  | 'bloggpost'
  | 'rapport'
  | 'akademisk'
  | 'podkast'
  | 'annet'

export interface WrittenText {
  title: string
  url?: string
  /** YYYY, YYYY-MM eller YYYY-MM-DD */
  date?: string
  publication?: string
  kind?: TextKind
  /** Hvor pipelinen fant teksten første gang. */
  foundBy?: 'feed' | 'change-check' | 'research'
  firstSeenAt?: string
}

export interface NewsEvent {
  description: string
  date?: string
  url?: string
  significance: 'high' | 'low'
}

export interface ChangeCheckResult {
  writerId: string
  checkedAt: string
  newTexts: WrittenText[]
  events: NewsEvent[]
  notes: string
}

export interface WriterImage {
  url: string
  sourcePage?: string
  credit?: string
  license?: string
}

/** Resultatet av research-steget — faktagrunnlaget for profilsiden. */
export interface WriterProfile {
  name: string
  tagline: string
  born?: number | null
  died?: number | null
  image: WriterImage | null
  platforms: LinkRef[]
  links: LinkRef[]
  keyFacts: string[]
  freedomContributions: string[]
  themes: string[]
  texts: WrittenText[]
  sources: Array<{ url: string; title: string }>
  researchedAt: string
}

export type WriterAction = 'skip' | 'update-list' | 'full'

export interface WriterDecision {
  writerId: string
  action: WriterAction
  reasons: string[]
}

/** Persistert tilstand per skribent — grunnlaget for inkrementelle kjøringer. */
export interface WriterState {
  writerId: string
  registryHash: string
  templateVersion: number
  lastCheckedAt?: string
  lastResearchedAt?: string
  lastWrittenAt?: string
  /** Samlet, deduplisert bibliografi (vokser over tid). */
  knownTexts: WrittenText[]
  /** Hendelser som allerede er tatt hensyn til i gjeldende profiltekst. */
  knownEvents: NewsEvent[]
  /**
   * Filnavnet til det nedlastede bildet i tilstandsmappa, eller null når det
   * ikke finnes noe (da hotlinkes `profile.image.url`, om den finnes).
   * Avgjør hvilken bildefil som hører til når det ligger flere i mappa.
   */
  imagePath?: string | null
  lastDecision?: WriterDecision
  /**
   * Satt når en full oppdatering var bestemt, men research eller skriving
   * feilet. Neste kjøring gjør da full oppdatering uansett, med de samme
   * hendelsene, i stedet for å glemme dem.
   */
  pendingFull?: PendingFull
}

export interface PendingFull {
  reasons: string[]
  events: NewsEvent[]
  failedAttempts: number
  lastError: string
}

export type ProblemSeverity = 'error' | 'warning'

/** Noe som gikk galt i kjøringen. Samles opp og vises i rapporten og i CI. */
export interface RunProblem {
  severity: ProblemSeverity
  writerId?: string
  step: 'feed' | 'change-check' | 'research' | 'write' | 'image' | 'publish' | 'state'
  message: string
}

export interface StoredWriter {
  state: WriterState
  profile: WriterProfile | null
  /** Fritt formulert markdown-brødtekst skrevet av LLM. */
  body: string | null
  /** Binærdata for profilbildet, hvis lastet ned. */
  image?: { fileName: string; data: Buffer } | null
}

export interface WriterStore {
  load(writerId: string): Promise<StoredWriter | null>
  save(writerId: string, stored: StoredWriter): Promise<void>
  flush(message: string): Promise<void>
}

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}>

export interface PublishedFile {
  path: string
  content: string | Buffer
}

export interface Publisher {
  publish(
    files: PublishedFile[],
    summary: string,
    problems?: string,
  ): Promise<{ prUrl?: string }>
}

export interface RunSkribenterOptions {
  registryFile: string
  outputDir: string
  manifestFile: string
  manifestKortFile: string
  styleFile: string
  dryRun?: boolean
  /** Tving full profilering av alle (true) eller av bestemte id-er. */
  force?: boolean | string[]
  /** Kjør bare for disse id-ene. */
  only?: string[]
  /** Hopp over RSS-sjekk (f.eks. i tester uten nett). */
  skipFeeds?: boolean
  now?: Date
  transport?: import('../notat/types.ts').BatchTransport
  store?: WriterStore
  publisher?: Publisher | null
  fetchFn?: FetchLike
}

export interface RunSkribenterSummary {
  decisions: WriterDecision[]
  usage: BatchUsage
  changedFiles: string[]
  prUrl?: string
  problems: RunProblem[]
}
