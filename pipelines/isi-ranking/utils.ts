import { promises as fs } from 'fs'
import path from 'path'
import type {
  BatchSucceededResult,
  CitationRecord,
  PipelinePaths,
  PipelineBatchResult,
} from './types.ts'

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf8')
  return JSON.parse(content) as T
}

export async function writeJsonFile(
  filePath: string,
  payload: unknown,
): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export async function writeMarkdownFile(
  filePath: string,
  content: string,
): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content.trimEnd() + '\n', 'utf8')
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function makeCustomId(...parts: string[]): string {
  const joined = parts
    .join('-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

  return joined.length <= 64 ? joined : joined.slice(0, 64).replace(/-$/, '')
}

export function parseJsonFromText<T>(text: string): T {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    return JSON.parse(withoutFence) as T
  } catch {
    const firstBrace = withoutFence.indexOf('{')
    const lastBrace = withoutFence.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(
        withoutFence.slice(firstBrace, lastBrace + 1),
      ) as T
    }

    const firstBracket = withoutFence.indexOf('[')
    const lastBracket = withoutFence.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(
        withoutFence.slice(firstBracket, lastBracket + 1),
      ) as T
    }

    throw new Error('Klarte ikke aa parse JSON fra modellsvaret.')
  }
}

export function requireSucceededResult(
  result: PipelineBatchResult | undefined,
  customId: string,
): BatchSucceededResult {
  if (!result || result.type !== 'succeeded') {
    throw new Error(`Batch-resultat mangler eller feilet for ${customId}.`)
  }

  return result
}

export function extractText(result: BatchSucceededResult): string {
  return result.content
    .filter((block) => block.type === 'text')
    .map((block) => ('text' in block ? block.text : ''))
    .join('')
}

export function extractUniqueCitations(
  result: BatchSucceededResult,
): CitationRecord[] {
  const seen = new Set<string>()
  const citations: CitationRecord[] = []

  for (const block of result.content) {
    if (block.type !== 'text' || !('citations' in block) || !block.citations) {
      continue
    }

    for (const citation of block.citations) {
      const key = `${citation.url}::${citation.title}::${citation.citedText ?? ''}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      citations.push(citation)
    }
  }

  return citations
}

export function buildPipelinePaths(
  outputDir: string,
  actorSlug: string,
): PipelinePaths {
  const actorDir = path.join(outputDir, actorSlug)
  return {
    actorDir,
    dossierJson: path.join(actorDir, 'actor-dossier.json'),
    researchPlanJson: path.join(actorDir, 'research-plan.json'),
    sourcePriorityMarkdown: path.join(actorDir, 'source-priority.md'),
    evidenceDir: path.join(actorDir, 'evidence'),
    evidenceMatrixJson: path.join(actorDir, 'evidence-matrix.json'),
    evidenceMatrixMarkdown: path.join(actorDir, 'evidence-matrix.md'),
    scoreDraftJson: path.join(actorDir, 'score-draft.json'),
    scoreDraftMarkdown: path.join(actorDir, 'score-draft.md'),
    gapResolutionJson: path.join(actorDir, 'gap-resolution.json'),
    reportMarkdown: path.join(actorDir, 'rapport.md'),
  }
}

export function subdimensionFileStem(subdimensionId: string): string {
  return subdimensionId.replace(/[^a-z0-9_]+/gi, '-')
}
