import type { NotatEvidenceArtifact, NotatInput, NotatResearchPlan } from './types.ts'

export function buildResearchTools(maxWebSearches = 10) {
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
      max_uses: maxWebSearches,
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

export function buildResearchPlanSystemPrompt(
  manifest: string,
  formatGuide: string,
) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en senior analytiker («forsker») for tankesmien Individet.',
        'Oppgaven din er å utforske et tema grundig og lage en strukturert forskningsplan som under-agenter kan jobbe ut ifra.',
        '',
        '## Din tilnærming',
        '',
        'Du tenker rundt temaet i lys av Individets manifest og frihetsperspektivet.',
        'Du identifiserer de viktigste spørsmålene som må besvares for å skrive et solid Individet-notat om temaet.',
        'Du deler opp temaet i 5–8 konkrete forskningsområder, hvert med klare søkespørsmål.',
        'Du gjennomfører noen innledende web-søk for å kartlegge det faktiske landskapet.',
        '',
        '## Forskningsområder',
        '',
        'Hvert forskningsområde skal ha:',
        '- En kort tittel',
        '- En beskrivelse av hva som skal undersøkes',
        '- 3–5 konkrete søkespørsmål (norske og engelske)',
        '',
        'Vær spesifikk nok til at en Haiku-agent kan gjennomføre målrettede søk uten å måtte gjette seg frem.',
        '',
        '## Frihetsperspektivet',
        '',
        'Analyser temaet opp mot ISI-dimensjonene:',
        '- d1: Kroppslig autonomi og selvbestemmelse',
        '- d2: Ytringsfrihet og intellektuell autonomi',
        '- d3: Eiendomsrett og økonomisk frihet',
        '- d4: Rettsstat og likebehandling',
        '- d5: Forenings-, forsamlings- og religionsfrihet',
        '- d6: Digital autonomi og informasjonsfrihet',
        '',
        '## Prosjektmanifest',
        '',
        manifest,
        '',
        '## Notatformat og krav',
        '',
        formatGuide,
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildResearchPlanUserPrompt(input: NotatInput): string {
  return [
    `Tema: ${input.tema}`,
    '',
    `Beskrivelse: ${input.beskrivelse}`,
    input.year ? `År: ${input.year}` : null,
    input.number ? `Nummer: ${input.number}` : null,
    '',
    'Gjennomfør innledende søk for å kartlegge temaet. Lag deretter en strukturert forskningsplan.',
    '',
    'Svar med JSON på denne formen:',
    JSON.stringify(
      {
        topic: input.tema,
        mainQuestion:
          'Presist formulert hovedspørsmål notatet skal besvare.',
        context:
          'Norsk kontekst: hva er situasjonen i dag, hva er problemet, hvem berøres.',
        freedomPerspective:
          'Hvilke ISI-dimensjoner berøres og hvordan.',
        comparativeAngles: ['Land eller systemer som gir nyttig sammenligning'],
        researchAreas: [
          {
            id: 'area-01',
            title: 'Kort tittel på forskningsområdet',
            description:
              'Hva skal undersøkes og hvorfor det er viktig for notatet.',
            searchQueries: [
              'søk 1',
              'søk 2',
              'English search query',
            ],
          },
        ],
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildEvidenceHarvestSystemPrompt(manifest: string) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en research-agent for tankesmien Individet.',
        'Oppgaven din er å finne solid empirisk grunnlag for ett konkret forskningsområde i et policynotat.',
        '',
        '## Regler for søk',
        '',
        '- Gjennomfør 3–6 målrettede web-søk for det gitte området.',
        '- Prioriter primærkilder: lovtekster, stortingsdokumenter, offisiell statistikk, forskningsartikler.',
        '- Bruk folkelige søkeord slik folk faktisk omtaler temaene — unngå akademisk jargong i søkene.',
        '- Referer til konkrete faktaer og tall, ikke vage påstander.',
        '- Ikke fabrikér URL-er eller kilder du ikke har funnet gjennom søk.',
        '- Rappporter ærlig om evidensen er tynn — et ærlig hull er bedre enn spekulativ evidens.',
        '',
        '## Prosjektmanifest',
        '',
        manifest,
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildEvidenceHarvestUserPrompt(
  area: NotatResearchPlan['researchAreas'][number],
  researchContext: string,
): string {
  return [
    `Forskningsområde: ${area.title}`,
    `Beskrivelse: ${area.description}`,
    '',
    `Kontekst: ${researchContext}`,
    '',
    `Søkespørsmål å bruke: ${area.searchQueries.join(' | ')}`,
    '',
    'Gjennomfør søkene og rapporter de viktigste funnene.',
    '',
    'Svar med JSON:',
    JSON.stringify(
      {
        areaId: area.id,
        areaTitle: area.title,
        summary: 'Kort oppsummering av funnene for dette området.',
        findings: [
          {
            claim: 'Et konkret faktum eller funn.',
            relevance: 'Hvorfor dette er relevant for frihetsperspektivet.',
            confidence: 'high',
          },
        ],
        citations: [
          {
            url: 'https://...',
            title: 'Kildetittel',
            citedText: 'Relevant sitat fra kilden',
          },
        ],
      },
      null,
      2,
    ),
  ].join('\n')
}

export function buildWriterSystemPrompt(
  manifest: string,
  formatGuide: string,
) {
  return [
    {
      type: 'text' as const,
      text: [
        'Du er en erfaren analytiker og forfatter for tankesmien Individet.',
        'Oppgaven din er å skrive et ferdig Individet-notat basert på forskningsgrunnlaget du mottar.',
        '',
        '## Din oppgave',
        '',
        'Skriv et komplett notat med YAML frontmatter og brødtekst.',
        'Bruk all forskningen du mottar som grunnlag. Kombiner, analyser og argumenter.',
        'Notatet skal følge retningslinjene i forfatter-og-format.md.',
        '',
        '## Viktige krav',
        '',
        '- Returner KUN markdown med YAML frontmatter — ingen annen tekst rundt.',
        '- Alle faktuelt verifiserbare utsagn skal ha fotnotereferanse ([^N]).',
        '- Fotnotene samles på slutten av dokumentet.',
        '- `sources` i frontmatter er en komplett liste over alle kilder brukt i fotnotene.',
        '- Slug: små bokstaver, æ→ae/ø→oe/å→aa, mellomrom→bindestrek, maks 50 tegn.',
        '- Lengde: 2 000–6 000 ord.',
        '',
        '## Prosjektmanifest',
        '',
        manifest,
        '',
        '## Forfatter- og formatguide',
        '',
        formatGuide,
      ].join('\n'),
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

export function buildWriterUserPrompt(
  input: NotatInput,
  plan: NotatResearchPlan,
  evidenceArtifacts: NotatEvidenceArtifact[],
): string {
  const year = input.year ?? new Date().getFullYear()
  const number = input.number ?? 'XX'

  return [
    `Skriv et Individet-notat med følgende tittel:`,
    `Notat ${number} ${year}: ${input.tema}`,
    '',
    `Beskrivelse/oppdrag: ${input.beskrivelse}`,
    '',
    '## Forskningsplan',
    '',
    JSON.stringify(plan, null, 2),
    '',
    '## Innsamlet evidens',
    '',
    JSON.stringify(evidenceArtifacts, null, 2),
    '',
    'Skriv det ferdige notatet. Husk YAML frontmatter med title, subtitle, date, slug, type, description, tags, author og sources.',
    `Sett type: notat, year: ${year}, number: "${number}".`,
    'Author skal være modellnavnet du bruker (f.eks. "Claude Opus 4.6").',
  ].join('\n')
}

export function researchPlanMarkdown(plan: NotatResearchPlan): string {
  return [
    `# Forskningsplan: ${plan.topic}`,
    '',
    `**Generert:** ${plan.generatedAt}`,
    '',
    `## Hovedspørsmål`,
    '',
    plan.mainQuestion,
    '',
    `## Norsk kontekst`,
    '',
    plan.context,
    '',
    `## Frihetsperspektiv`,
    '',
    plan.freedomPerspective,
    '',
    `## Komparative vinkler`,
    '',
    ...plan.comparativeAngles.map((angle) => `- ${angle}`),
    '',
    `## Forskningsområder`,
    '',
    ...plan.researchAreas.flatMap((area) => [
      `### ${area.id}: ${area.title}`,
      '',
      area.description,
      '',
      '**Søkespørsmål:**',
      ...area.searchQueries.map((q) => `- ${q}`),
      '',
    ]),
  ].join('\n')
}

export function evidenceArtifactMarkdown(
  artifact: NotatEvidenceArtifact,
): string {
  return [
    `# Evidens: ${artifact.areaTitle}`,
    '',
    `**Hentet:** ${artifact.harvestedAt}`,
    '',
    `## Oppsummering`,
    '',
    artifact.summary,
    '',
    `## Funn`,
    '',
    ...artifact.findings.flatMap((finding) => [
      `- **${finding.claim}** *(${finding.confidence})*`,
      `  ${finding.relevance}`,
      '',
    ]),
    '',
    `## Kilder`,
    '',
    ...artifact.citations.map(
      (c) => `- [${c.title}](${c.url})${c.citedText ? `: «${c.citedText}»` : ''}`,
    ),
  ].join('\n')
}
