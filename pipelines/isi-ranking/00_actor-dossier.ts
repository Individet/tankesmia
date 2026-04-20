import { DIMENSIONS } from './constants.ts'
import type { ActorDossier, ActorInput } from './types.ts'
import { nowIso, slug } from './utils.ts'

function deriveAliases(actor: ActorInput): string[] {
  const aliases = [actor.name]
  const parts = actor.name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    aliases.push(parts.at(-1)!)
  }

  if (actor.parti) {
    aliases.push(`${actor.name} ${actor.parti}`)
  }

  return Array.from(new Set(aliases))
}

export function createActorDossier(actor: ActorInput): ActorDossier {
  return {
    actorSlug: slug(actor.name),
    actor,
    searchAliases: deriveAliases(actor),
    period: actor.periode ?? 'Siste 3-5 år',
    jurisdiction: actor.jurisdiksjon ?? 'Norge',
    generatedAt: nowIso(),
  }
}

export function dossierMarkdown(dossier: ActorDossier): string {
  return [
    `# Actor dossier: ${dossier.actor.name}`,
    '',
    `- Slug: ${dossier.actorSlug}`,
    `- Type: ${dossier.actor.type}`,
    `- Jurisdiction: ${dossier.jurisdiction}`,
    `- Period: ${dossier.period}`,
    dossier.actor.parti ? `- Parti: ${dossier.actor.parti}` : null,
    dossier.actor.tilhørighet ? `- Tilhørighet: ${dossier.actor.tilhørighet}` : null,
    dossier.actor.beskrivelse ? `- Beskrivelse: ${dossier.actor.beskrivelse}` : null,
    `- Search aliases: ${dossier.searchAliases.join(', ')}`,
    '',
    '## ISI dimensions',
    ...DIMENSIONS.map((dimension) => `- ${dimension.number}. ${dimension.name}`),
  ]
    .filter(Boolean)
    .join('\n')
}
