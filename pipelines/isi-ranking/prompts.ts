import { DIMENSIONS, SUBDIMENSIONS } from './constants.ts'
import type {
  ActorDossier,
  EvidenceArtifact,
  EvidenceMatrix,
  ResearchPlan,
  ScoreDraft,
  SubdimensionDefinition,
} from './types.ts'

function dimensionSummaryText(): string {
  return DIMENSIONS.map(
    (dimension) =>
      `- ${dimension.number}. ${dimension.name}: ${dimension.description} (${dimension.philosophicalBasis})`,
  ).join('\n')
}

function scoringRulesText(): string {
  return [
    'Scoreregler som aldri kan brytes:',
    '- Det finnes 24 underdimensjoner.',
    '- Hver underdimensjon skal ha score -2, -1, 0, 1, 2 eller null.',
    '- null betyr utilstrekkelig datagrunnlag.',
    '- 0 betyr dokumentert blandet eller balansert profil, ikke manglende data.',
    '- Vurder eksplisitte posisjoner høyere enn implisitte.',
    '- Gode intensjoner endrer ikke vurderingen av tvang.',
    '- Ikke spekuler. Marker hull eksplisitt.',
  ].join('\n')
}

export function buildResearchTools() {
  return [
    {
      type: 'code_execution_20260120' as const,
      name: 'code_execution' as const,
      cache_control: { type: 'ephemeral' as const },
    },
    {
      type: 'web_search_20260209' as const,
      name: 'web_search' as const,
      allowed_callers: ['direct', 'code_execution_20260120'] as const,
      max_uses: 10,
      user_location: {
        type: 'approximate' as const,
        city: 'Oslo',
        region: 'Oslo',
        country: 'NO',
        timezone: 'Europe/Oslo',
      },
    },
  ]
}

export function buildResearchPlanSystemPrompt(framework: string) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en research-planlegger for Individets Suverenitetsindeks.',
        'Lag en kostnadseffektiv researchplan som maksimerer primærkilder og kutter svake søk.',
        scoringRulesText(),
        'Bruk web search aktivt og filtrer bort irrelevante treff.',
        'Returner kun JSON.',
        'ISI-rammeverk:',
        framework,
        'Dimensjoner:',
        dimensionSummaryText(),
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildResearchPlanUserPrompt(dossier: ActorDossier): string {
  return [
    `Aktor: ${dossier.actor.name}`,
    `Type: ${dossier.actor.type}`,
    `Jurisdiksjon: ${dossier.jurisdiction}`,
    `Periode: ${dossier.period}`,
    dossier.actor.parti ? `Parti: ${dossier.actor.parti}` : null,
    dossier.actor.tilhørighet ? `Tilhørighet: ${dossier.actor.tilhørighet}` : null,
    dossier.actor.beskrivelse ? `Beskrivelse: ${dossier.actor.beskrivelse}` : null,
    `Aliaser: ${dossier.searchAliases.join(', ')}`,
    `Mulige publiseringskanaler: ${dossier.likelyPublishingChannels.join(', ')}`,
    `Kjente domener: ${dossier.likelyDomains.join(', ')}`,
    '',
    'Svar med JSON på denne formen:',
    JSON.stringify(
      {
        actorSlug: dossier.actorSlug,
        actorName: dossier.actor.name,
        profileSummary: '',
        primarySourcePriorities: [''],
        secondarySourcePriorities: [''],
        sourcePriorityNotes: [''],
        subdimensions: SUBDIMENSIONS.map((item) => ({
          subdimensionId: item.id,
          priority: 'high',
          rationale: '',
          searchQueries: [''],
          negativeQueries: [''],
          preferredDomains: [''],
          stopConditions: [''],
        })),
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildEvidenceHarvestSystemPrompt(framework: string) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en målrettet research-agent for ISI.',
        'Oppgaven er å finne få, sterke evidenspunkter for en enkelt underdimensjon.',
        scoringRulesText(),
        'Ikke bruk plass på å gjenta URL-er i fritekst hvis de allerede finnes i sitatmetadata.',
        'Returner kun JSON.',
        framework,
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildEvidenceHarvestUserPrompt(
  dossier: ActorDossier,
  plan: ResearchPlan,
  subdimension: SubdimensionDefinition,
): string {
  const planEntry = plan.subdimensions.find((item) => item.subdimensionId === subdimension.id)

  return [
    `Aktor: ${dossier.actor.name}`,
    `Underdimensjon: ${subdimension.number} ${subdimension.name}`,
    `Beskrivelse: ${subdimension.description}`,
    `Prioritet: ${planEntry?.priority ?? 'medium'}`,
    `Planlagte søk: ${(planEntry?.searchQueries ?? []).join(' | ')}`,
    `Negative søk: ${(planEntry?.negativeQueries ?? []).join(' | ')}`,
    `Foretrukne domener: ${(planEntry?.preferredDomains ?? []).join(' | ')}`,
    `Søkehints: ${subdimension.searchHints.join(' | ')}`,
    '',
    'Returner JSON på denne formen:',
    JSON.stringify(
      {
        actorSlug: dossier.actorSlug,
        actorName: dossier.actor.name,
        subdimensionId: subdimension.id,
        subdimensionName: subdimension.name,
        summary: '',
        stance: 'positive',
        positionType: 'explicit',
        confidence: 'high',
        dataGap: false,
        unresolvedQuestions: [''],
        findings: [
          {
            claim: '',
            stance: 'positive',
            evidenceType: 'primary',
            positionType: 'explicit',
            confidence: 'high',
            timePattern: '',
            inconsistency: '',
            note: '',
          },
        ],
      },
      null,
      2,
    ),
  ].join('\n')
}

export function buildEvidenceReviewSystemPrompt() {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en evidensredaktør for ISI.',
        'Dedupliser, ranger og komprimer eksisterende research uten aa miste sporbarhet.',
        scoringRulesText(),
        'Returner kun JSON.',
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildEvidenceReviewUserPrompt(
  actorName: string,
  evidenceArtifacts: EvidenceArtifact[],
): string {
  return [
    `Lag evidence matrix for ${actorName}.`,
    'Kildematerialet er en liste med underdimensjonsartefakter:',
    JSON.stringify(evidenceArtifacts, null, 2),
    '',
    'Returner JSON med overallNarrative, crossDimensionNotes og en post per underdimensjon.',
  ].join('\n')
}

export function buildScoringSystemPrompt() {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en ISI-scorer.',
        'Tildel observed underdimensjonsscorer. Ikke regn ut totalscore; det gjøres i kode etterpå.',
        scoringRulesText(),
        'Hvis observed score er null, kan du i tillegg foreslaa en svak imputationCandidate basert paa partitilhørighet, organisasjonstilhørighet, samme dimensjon eller samlet profil.',
        'Bruk aldri sterkere imputering enn -1, 0 eller 1.',
        'Sett imputationBasis til party-alignment, organization-alignment, dimension-profile, overall-profile eller none.',
        'Observed score skal forbli null selv om du foreslaar imputering.',
        'Returner kun JSON.',
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildScoringUserPrompt(
  dossier: ActorDossier,
  matrix: EvidenceMatrix,
): string {
  return [
    `Scor aktoren ${matrix.actorName} ut fra denne evidence matrix-en.`,
    'Ta hensyn til actor dossier for mulig partilinje eller organisasjonstilhørighet ved imputering av null-verdier.',
    JSON.stringify(dossier, null, 2),
    JSON.stringify(matrix, null, 2),
    '',
    'Returner JSON med subdimensions, keyStrengths, keyRisks og crossDimensionNotes.',
    'Hver subdimension kan inneholde: score, rationale, confidence, conflictingEvidence, imputationCandidate, imputationBasis, imputationRationale.',
  ].join('\n')
}

export function buildGapResearchSystemPrompt(framework: string) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en gap research-agent for ISI.',
        'Dette er en oppfølgingsrunde som kun skal lukke konkrete kunnskapshull.',
        scoringRulesText(),
        'Returner kun JSON med samme skjema som evidence harvest.',
        framework,
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildGapResearchUserPrompt(
  dossier: ActorDossier,
  subdimension: SubdimensionDefinition,
  reasonLines: string[],
): string {
  return [
    `Aktor: ${dossier.actor.name}`,
    `Underdimensjon: ${subdimension.number} ${subdimension.name}`,
    `Beskrivelse: ${subdimension.description}`,
    'Kjør kun oppfølgingsresearch på disse hullene:',
    ...reasonLines.map((line) => `- ${line}`),
    '',
    'Svar med samme JSON-format som evidence harvest.',
  ].join('\n')
}

export function buildFinalReportSystemPrompt(
  framework: string,
) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en analytisk agent for tankesmien Individet.',
        'Skriv den endelige rapporten utelukkende fra det kuraterte grunnlaget du faar.',
        scoringRulesText(),
        'ObservedScore og EstimatedScore er allerede regnet ut av pipelinen. Ikke regn dem ut på nytt.',
        'ObservedScore er den direkte observerte scoren. EstimatedScore inkluderer transparent imputering for null-verdier.',
        'Du vil faa en mal som allerede er preutfylt programmatisk med YAML frontmatter, scorer, datagap og kilder.',
        'Behold de preutfylte YAML-verdiene og kildelistene med mindre det er en åpenbar intern selvmotsigelse i inputen.',
        'Skriv resten av rapporten ved aa fylle ut malen slavisk, og returner kun markdown med YAML frontmatter.',
        'ISI-rammeverk:',
        framework,
      ].join('\n\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildFinalReportUserPrompt(
  dossier: ActorDossier,
  matrix: EvidenceMatrix,
  scoreDraft: ScoreDraft,
  prefilledTemplate: string,
): string {
  return [
    `Skriv ferdig ISI-rapport for ${dossier.actor.name}.`,
    'Bruk observedScore, estimatedScore, kildelister og alle underdimensjonsscorer nøyaktig slik de er oppgitt her.',
    'Her er den preutfylte malen du skal ferdigstille:',
    prefilledTemplate,
    '',
    'Her er det strukturerte grunnlaget:',
    JSON.stringify(
      {
        dossier,
        matrix,
        scoreDraft,
      },
      null,
      2,
    ),
  ].join('\n')
}
