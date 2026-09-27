import { PROFILE_TEMPLATE_VERSION, THRESHOLDS } from './constants.ts'
import { daysBetween, registryHash } from './texts.ts'
import type {
  ChangeCheckResult,
  StoredWriter,
  WriterDecision,
  WriterRegistryEntry,
  WrittenText,
} from './types.ts'

export type Triage =
  | { kind: 'decided'; decision: WriterDecision }
  | { kind: 'needs-check'; reasons: string[] }

/**
 * Steg 1a — gratis, deterministisk triage. Avgjør alt som kan avgjøres uten
 * å spørre en modell:
 *
 * - `full` når det ikke finnes noen profil, registeret er endret, sidemalen
 *   er oppgradert, profilen er for gammel, eller kjøringen er tvunget.
 * - `skip` når en endringssjekk ble gjort nylig og feedene ikke viser noe nytt,
 *   eller når skribenten er død (ingen endringssjekk nødvendig).
 * - ellers `needs-check`: spør Haiku om noe nytt har skjedd.
 */
export function triageWriter(
  entry: WriterRegistryEntry,
  stored: StoredWriter | null,
  newFeedTexts: WrittenText[],
  now: Date,
  force: boolean,
): Triage {
  const full = (reasons: string[]): Triage => ({
    kind: 'decided',
    decision: { writerId: entry.id, action: 'full', reasons },
  })

  if (force) return full(['tvunget kjøring (--force)'])
  if (!stored?.profile || !stored.body) return full(['ingen eksisterende profil'])

  const { state } = stored
  if (state.registryHash !== registryHash(entry)) {
    return full(['registeroppføringen er endret'])
  }
  if (state.templateVersion !== PROFILE_TEMPLATE_VERSION) {
    return full([
      `sidemalen er oppgradert (v${state.templateVersion} → v${PROFILE_TEMPLATE_VERSION})`,
    ])
  }

  const deceased = entry.died != null
  const maxAge = deceased
    ? THRESHOLDS.maxProfileAgeDaysDeceased
    : THRESHOLDS.maxProfileAgeDays
  const age = daysBetween(state.lastResearchedAt, now)
  if (age > maxAge) {
    return full([`profilen er ${Math.floor(age)} dager gammel (grense ${maxAge})`])
  }

  if (deceased) {
    return newFeedTexts.length > 0
      ? { kind: 'decided', decision: { writerId: entry.id, action: 'update-list', reasons: [`${newFeedTexts.length} nye tekster i feed`] } }
      : { kind: 'decided', decision: { writerId: entry.id, action: 'skip', reasons: ['avdød — ingen endringssjekk'] } }
  }

  const sinceCheck = daysBetween(state.lastCheckedAt, now)
  if (sinceCheck < THRESHOLDS.minCheckIntervalDays) {
    if (newFeedTexts.length === 0) {
      return {
        kind: 'decided',
        decision: {
          writerId: entry.id,
          action: 'skip',
          reasons: [`sjekket for ${sinceCheck.toFixed(1)} dager siden, ingenting nytt i feed`],
        },
      }
    }
    return {
      kind: 'decided',
      decision: resolveDecision(entry.id, newFeedTexts, [], [
        `sjekket nylig — bruker kun feed`,
      ]),
    }
  }

  const reasons = [`${Math.floor(sinceCheck)} dager siden forrige sjekk`]
  if (newFeedTexts.length > 0) reasons.push(`${newFeedTexts.length} nye tekster i feed`)
  return { kind: 'needs-check', reasons }
}

/**
 * Steg 1c — avgjørelse etter feed + endringssjekk:
 * - vesentlige hendelser, eller mange nye tekster → `full`
 * - bare noen få nye tekster → `update-list` (oppdater tekstlista, behold profilteksten)
 * - ingenting → `skip`
 */
export function resolveDecision(
  writerId: string,
  newTexts: WrittenText[],
  newEvents: ChangeCheckResult['events'],
  baseReasons: string[] = [],
): WriterDecision {
  const significant = newEvents.filter((e) => e.significance === 'high')
  if (significant.length > 0) {
    return {
      writerId,
      action: 'full',
      reasons: [
        ...baseReasons,
        ...significant.map((e) => `vesentlig hendelse: ${e.description}`),
      ],
    }
  }
  if (newTexts.length >= THRESHOLDS.rewriteOnNewTexts) {
    return {
      writerId,
      action: 'full',
      reasons: [...baseReasons, `${newTexts.length} nye tekster (grense ${THRESHOLDS.rewriteOnNewTexts})`],
    }
  }
  if (newTexts.length > 0) {
    return {
      writerId,
      action: 'update-list',
      reasons: [...baseReasons, `${newTexts.length} nye tekster — oppdaterer tekstlista uten ny profiltekst`],
    }
  }
  return {
    writerId,
    action: 'skip',
    reasons: [...baseReasons, 'ingenting nytt siden forrige kjøring'],
  }
}

/** Filtrer bort hendelser vi allerede har tatt hensyn til. */
export function unseenEvents(
  events: ChangeCheckResult['events'],
  known: ChangeCheckResult['events'],
): ChangeCheckResult['events'] {
  const knownKeys = new Set(known.map(eventKey))
  return events.filter((e) => !knownKeys.has(eventKey(e)))
}

function eventKey(event: { description: string; url?: string }): string {
  return event.url ?? event.description.toLowerCase().replace(/\s+/g, ' ').trim()
}
