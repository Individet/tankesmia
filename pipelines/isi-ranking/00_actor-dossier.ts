import { DIMENSIONS } from './constants.ts'
import type { ActorDossier, ActorInput } from './types.ts'
import { nowIso, slug } from './utils.ts'

function deriveLikelyChannels(actor: ActorInput): string[] {
  const channels = ['stortinget.no', 'partiprogram', 'intervjuer', 'debatter']

  if (actor.type.toLowerCase().includes('person')) {
    channels.push('kronikker', 'podkast', 'sosiale medier')
  }

  if (actor.parti || actor.tilhørighet) {
    channels.push('partiets nettsider')
  }

  return Array.from(new Set(channels))
}

function deriveLikelyDomains(actor: ActorInput): string[] {
  const domains = ['stortinget.no', 'regjeringen.no', 'nrk.no']

  if (actor.parti) {
    domains.push(`${slug(actor.parti)}.no`)
  }

  if (actor.beskrivelse?.toLowerCase().includes('gullstandard')) {
    domains.push('gullstandard.no')
  }

  return Array.from(new Set(domains))
}

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
    likelyPublishingChannels: deriveLikelyChannels(actor),
    likelyDomains: deriveLikelyDomains(actor),
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
    dossier.actor.tilhørighet ? `- Tilhorighet: ${dossier.actor.tilhørighet}` : null,
    dossier.actor.beskrivelse ? `- Beskrivelse: ${dossier.actor.beskrivelse}` : null,
    `- Search aliases: ${dossier.searchAliases.join(', ')}`,
    `- Likely domains: ${dossier.likelyDomains.join(', ')}`,
    `- Likely channels: ${dossier.likelyPublishingChannels.join(', ')}`,
    '',
    '## ISI dimensions',
    ...DIMENSIONS.map((dimension) => `- ${dimension.number}. ${dimension.name}`),
  ]
    .filter(Boolean)
    .join('\n')
}
