import { promises as fs } from 'fs'
import path from 'path'

// ─── Types ──────────────────────────────────────────────────────────────────

export type StepName =
  | 'choose-topic'
  | 'research'
  | 'images'
  | 'write-article'
  | 'save-rawdata'
  | 'create-pr'

export const STEP_ORDER: StepName[] = [
  'choose-topic',
  'research',
  'images',
  'write-article',
  'save-rawdata',
  'create-pr',
]

export interface StepResult {
  completedAt: string
  durationMs: number
}

export interface PipelineState {
  runId: string
  startedAt: string
  completedSteps: Partial<Record<StepName, StepResult>>
  currentStep: StepName | null
  error: string | null
  slug: string | null
  date: string
}

// ─── Output directory ───────────────────────────────────────────────────────

const OUTPUT_BASE = path.join('output', 'auto-reportasje')

export function runDir(runId: string): string {
  return path.join(OUTPUT_BASE, runId)
}

export async function initRunDir(runId: string): Promise<string> {
  const dir = runDir(runId)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

// ─── State persistence ──────────────────────────────────────────────────────

function stateFile(runId: string): string {
  return path.join(runDir(runId), 'pipeline-state.json')
}

export function createInitialState(runId: string, date: string): PipelineState {
  return {
    runId,
    startedAt: new Date().toISOString(),
    completedSteps: {},
    currentStep: null,
    error: null,
    slug: null,
    date,
  }
}

export async function saveState(state: PipelineState): Promise<void> {
  const filePath = stateFile(state.runId)
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
}

export async function loadState(runId: string): Promise<PipelineState> {
  const filePath = stateFile(runId)
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw) as PipelineState
}

// ─── Artifact saving ────────────────────────────────────────────────────────

export async function saveArtifact(
  runId: string,
  filename: string,
  data: unknown,
): Promise<void> {
  const dir = runDir(runId)
  const filePath = path.join(dir, filename)
  const content =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  await fs.writeFile(filePath, content, 'utf8')
}

export async function loadArtifact<T>(
  runId: string,
  filename: string,
): Promise<T> {
  const dir = runDir(runId)
  const filePath = path.join(dir, filename)
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw) as T
}

export async function loadTextArtifact(
  runId: string,
  filename: string,
): Promise<string> {
  const dir = runDir(runId)
  const filePath = path.join(dir, filename)
  return fs.readFile(filePath, 'utf8')
}

// ─── Run-ID generation ──────────────────────────────────────────────────────

export function generateRunId(date: string): string {
  const time = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15)
  return `${date}_${time}`
}

// ─── Step completion helper ─────────────────────────────────────────────────

export function isStepCompleted(state: PipelineState, step: StepName): boolean {
  return step in state.completedSteps
}

export function nextIncompleteStep(state: PipelineState): StepName | null {
  for (const step of STEP_ORDER) {
    if (!isStepCompleted(state, step)) return step
  }
  return null
}
