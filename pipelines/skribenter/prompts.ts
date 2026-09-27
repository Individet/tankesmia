import { THRESHOLDS } from './constants.ts'
import type {
  StoredWriter,
  WriterProfile,
  WriterRegistryEntry,
  WrittenText,
} from './types.ts'

const OSLO = {
  type: 'approximate' as const,
  city: 'Oslo',
  region: 'Oslo',
  country: 'NO',
  timezone: 'Europe/Oslo',
}

/** Haiku 4.5 støtter bare den grunnleggende websøk-varianten. */
export function buildChangeCheckTools() {
  return [
    {
      type: 'web_search_20250305' as const,
      name: 'web_search' as const,
      max_uses: THRESHOLDS.changeCheckSearches,
      user_location: OSLO,
    },
  ]
}

/** Sonnet/Opus: websøk med dynamisk filtrering. */
export function buildResearchTools() {
  return [
    {
      type: 'web_search_20260209' as const,
      name: 'web_search' as const,
      max_uses: THRESHOLDS.researchSearches,
      user_location: OSLO,
    },
  ]
}

export function writerIdentity(entry: WriterRegistryEntry): string {
  return [
    `Navn: ${entry.name}`,
    `Kort beskrivelse: ${entry.description}`,
    entry.born ? `Født: ${entry.born}` : null,
    entry.died ? `Død: ${entry.died}` : null,
    entry.affiliations?.length ? `Tilknytning: ${entry.affiliations.join(', ')}` : null,
    entry.identification ? `Identifikasjon: ${entry.identification}` : null,
    entry.links?.length
      ? `Kjente lenker:\n${entry.links.map((l) => `- ${l.type}: ${l.url}`).join('\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function recentTexts(texts: WrittenText[], limit: number): string {
  const recent = [...texts]
    .filter((t) => t.date)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, limit)
  if (recent.length === 0) return '(ingen registrerte tekster)'
  return recent
    .map((t) => `- ${t.date} — ${t.title}${t.url ? ` (${t.url})` : ''}`)
    .join('\n')
}

// ---------------------------------------------------------------------------
// Steg 1: Endringssjekk (Haiku)
// ---------------------------------------------------------------------------

export function buildChangeCheckSystemPrompt() {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en research-assistent for tankesmien Individet.',
        'Du overvåker norske frihetsorienterte skribenter og svarer på ett spørsmål:',
        'Har noe NYTT skjedd med denne personen siden en gitt dato?',
        '',
        '## Hva som teller',
        '',
        '- Nye tekster personen selv har skrevet: artikler, kronikker, blogginnlegg, Substack-poster, bøker, rapporter, akademiske publikasjoner. Kun tekster publisert ETTER datoen.',
        '- Hendelser: ny bok, ny stilling eller rolle, ny plattform (f.eks. startet Substack), pris, stor offentlig debatt personen sto sentralt i, dødsfall.',
        '',
        '## Vesentlighet',
        '',
        '- `high`: endrer hvem personen er eller hvordan de bør presenteres (ny bok, ny rolle, ny plattform, stor debatt, dødsfall).',
        '- `low`: alt annet som er verdt å notere.',
        '',
        '## Regler',
        '',
        '- Gjør få, målrettede søk. Vær sparsom.',
        '- Ikke list tekster som allerede står i lista over kjente tekster.',
        '- Ikke fabrikér URL-er, titler eller datoer. Tom liste er et helt gyldig svar.',
        '- Pass på navnebrødre — bruk identifikasjonen for å være sikker på at det er riktig person.',
        '- Datoer som YYYY-MM-DD når kjent, ellers YYYY-MM eller YYYY.',
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildChangeCheckUserPrompt(
  entry: WriterRegistryEntry,
  stored: StoredWriter,
  feedTexts: WrittenText[],
): string {
  const since =
    stored.state.lastCheckedAt ?? stored.state.lastResearchedAt ?? 'ukjent'
  return [
    '## Person',
    '',
    writerIdentity(entry),
    '',
    `## Sist sjekket: ${since.slice(0, 10)}`,
    '',
    '## Kjente tekster (nyeste først)',
    '',
    recentTexts(stored.state.knownTexts, 25),
    '',
    feedTexts.length > 0
      ? `## Allerede funnet via RSS denne kjøringen (ikke list disse på nytt)\n\n${feedTexts.map((t) => `- ${t.date ?? ''} ${t.title}`).join('\n')}\n`
      : '',
    `Har noe nytt skjedd siden ${since.slice(0, 10)}? Svar med JSON: { "newTexts": [...], "events": [...], "notes": "kort begrunnelse" }.`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Steg 2: Research (Sonnet)
// ---------------------------------------------------------------------------

export function buildResearchSystemPrompt(manifestKort: string) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en grundig research-agent for tankesmien Individet.',
        'Du bygger et faktagrunnlag for en profilside om en norsk skribent som bidrar til å forsvare individets frihet og selvråderett.',
        '',
        '## Du skal finne',
        '',
        '1. **Identitet**: bekreft at du har riktig person (bruk identifikasjonen — pass på navnebrødre).',
        '2. **tagline**: én kort linje, f.eks. yrke og viktigste tilknytning («Filosof og professor ved UiS»).',
        '3. **image**: et portrettbilde av personen. Foretrekk Wikimedia Commons (oppgi lisens og fotograf), deretter offisielle profilbilder fra arbeidsgiver eller personens egne kanaler. `url` må være en direkte bildefil (jpg/png/webp). Oppgi siden bildet ble funnet på i `sourcePage` og kreditering i `credit`. Bruk null hvis du ikke finner et trygt bilde.',
        '4. **platforms**: personens EGNE kanaler — hjemmeside, Substack, blogg, podkast, YouTube, X, Facebook, Instagram, LinkedIn. `type` er en av: hjemmeside, substack, blogg, podcast, youtube, x, facebook, instagram, linkedin.',
        '5. **links**: andre relevante lenker — Wikipedia, Store norske leksikon, forfattersider hos publikasjoner, akademiske profiler, forlagssider. `type` er en av: wikipedia, snl, forfatterside, akademisk, forlag, intervju, annet.',
        '6. **keyFacts**: biografiske nøkkelfakta (utdanning, stillinger, bøker, verv) — én påstand per punkt.',
        '7. **freedomContributions**: konkret hvordan personen har bidratt til å forsvare individets frihet — standpunkter, argumenter, saker, bøker, debatter. Vær konkret og kildebasert.',
        '8. **themes**: 3–8 tema personen skriver om.',
        '9. **texts**: tekster personen har skrevet — bøker, artikler, kronikker, blogginnlegg, rapporter, akademiske arbeider. Prioriter tekster med tydelig frihetsrelevans og alle bøker. Oppgi dato og publikasjon så presist du kan.',
        '',
        '## Regler',
        '',
        '- Ikke fabrikér. Oppgi kun URL-er du faktisk har funnet i søk.',
        '- Tekster som allerede er kjent (gitt i oppdraget) skal IKKE gjentas — finn nye.',
        '- Maks 60 nye tekster per kjøring.',
        '- Skriv alt på norsk bokmål.',
        '',
        '## Individets grunnsyn (kort)',
        '',
        manifestKort,
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildResearchUserPrompt(
  entry: WriterRegistryEntry,
  stored: StoredWriter | null,
  pendingTexts: WrittenText[],
  pendingEvents: Array<{ description: string; date?: string }>,
): string {
  const known = stored?.state.knownTexts ?? []
  return [
    '## Person',
    '',
    writerIdentity(entry),
    '',
    stored?.profile
      ? [
          '## Forrige profil (oppdater og korriger — ikke kopier blindt)',
          '',
          JSON.stringify(
            {
              tagline: stored.profile.tagline,
              image: stored.profile.image,
              platforms: stored.profile.platforms,
              links: stored.profile.links,
              keyFacts: stored.profile.keyFacts,
              freedomContributions: stored.profile.freedomContributions,
              themes: stored.profile.themes,
              researchedAt: stored.profile.researchedAt,
            },
            null,
            2,
          ),
          '',
        ].join('\n')
      : '',
    `## Kjente tekster (${known.length} totalt — de 40 nyeste vises, ikke gjenta noen av dem)`,
    '',
    recentTexts(known, 40),
    '',
    pendingEvents.length > 0
      ? `## Nye hendelser oppdaget siden sist — undersøk disse spesielt\n\n${pendingEvents.map((e) => `- ${e.date ?? ''} ${e.description}`).join('\n')}\n`
      : '',
    pendingTexts.length > 0
      ? `## Nye tekster allerede funnet (ikke gjenta)\n\n${pendingTexts.map((t) => `- ${t.date ?? ''} ${t.title}`).join('\n')}\n`
      : '',
    'Gjennomfør research og svar med JSON etter skjemaet.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Steg 3: Profiltekst (Opus)
// ---------------------------------------------------------------------------

export function buildWriterSystemPrompt(manifest: string, styleGuide: string) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du skriver profiltekster om norske frihetsorienterte skribenter for tankesmien Individet (individet.no).',
        '',
        '## Oppgaven',
        '',
        'Skriv brødteksten i en profilside: hvem personen er, og hvordan de bidrar til å forsvare individets frihet og selvråderett.',
        '',
        'Formen er fri. Tilpass teksten til personen: en filosof kan presenteres gjennom argumentene sine, en journalist gjennom sakene, en aktivist gjennom kampene, en historisk skikkelse som et ettermæle. Bruk de mellomtitlene (`##`) som passer denne personen — ikke en fast mal.',
        '',
        '## Rammer',
        '',
        '- Returner KUN markdown-brødtekst. Ingen frontmatter, ingen H1 (`#`), ingen bilde.',
        '- IKKE lag lister over personens kanaler, lenker eller tekster — de legges på siden automatisk. Du kan gjerne nevne og lenke til enkeltverk i løpende tekst.',
        '- 500–1200 ord.',
        '- Bygg på faktagrunnlaget. Ikke finn på noe. Er grunnlaget tynt, skriv kortere.',
        '- Vær rettferdig: beskriv personens standpunkter presist, også der de avviker fra Individets. Ikke gjør personen mer libertariansk enn de er.',
        '- Fotnoter er ikke nødvendig, men lenk til kilder i teksten der det styrker troverdigheten.',
        '',
        '## Stilkort',
        '',
        styleGuide,
        '',
        '## Individets manifest',
        '',
        manifest,
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildWriterUserPrompt(
  entry: WriterRegistryEntry,
  profile: WriterProfile,
  previousBody: string | null,
): string {
  const { texts, ...facts } = profile
  return [
    '## Person',
    '',
    writerIdentity(entry),
    '',
    '## Faktagrunnlag',
    '',
    JSON.stringify(facts, null, 2),
    '',
    `## Et utvalg av personens tekster (${texts.length} totalt)`,
    '',
    texts
      .slice(-40)
      .map((t) => `- ${t.date ?? 'udatert'} — ${t.title}${t.publication ? ` (${t.publication})` : ''}`)
      .join('\n'),
    '',
    previousBody
      ? `## Forrige versjon av profilteksten\n\nOppdater den i lys av nytt faktagrunnlag. Behold det som fortsatt stemmer og fungerer; skriv om det som er utdatert.\n\n${previousBody}\n`
      : '',
    'Skriv profilteksten nå.',
  ].join('\n')
}
