import { promises as fs } from 'fs'
import path from 'path'
import { RAW_DATA } from './constants.ts'
import {
  RAW_DATA_REPO,
  commitFiles,
  listRemoteDir,
  readRemoteFile,
} from './github.ts'
import type { PublishedFile, StoredWriter, WriterStore } from './types.ts'

const FILES = {
  state: 'state.json',
  profile: 'profile.json',
  body: 'profiltekst.md',
} as const

function serialize(stored: StoredWriter): Array<{ name: string; content: string | Buffer }> {
  const files: Array<{ name: string; content: string | Buffer }> = [
    { name: FILES.state, content: `${JSON.stringify(stored.state, null, 2)}\n` },
  ]
  if (stored.profile) {
    files.push({ name: FILES.profile, content: `${JSON.stringify(stored.profile, null, 2)}\n` })
  }
  if (stored.body) files.push({ name: FILES.body, content: `${stored.body.trimEnd()}\n` })
  if (stored.image) files.push({ name: stored.image.fileName, content: stored.image.data })
  return files
}

function deserialize(
  files: Map<string, Buffer>,
): StoredWriter | null {
  const state = files.get(FILES.state)
  if (!state) return null
  const parsedState: StoredWriter['state'] = JSON.parse(state.toString('utf8'))
  // Eldre tilstand uten imagePath: bruk den første bildefila vi finner.
  const imageName =
    parsedState.imagePath === undefined
      ? Array.from(files.keys()).find((name) => /\.(jpe?g|png|webp|gif)$/i.test(name))
      : parsedState.imagePath && files.has(parsedState.imagePath)
        ? parsedState.imagePath
        : undefined
  return {
    state: parsedState,
    profile: files.has(FILES.profile) ? JSON.parse(files.get(FILES.profile)!.toString('utf8')) : null,
    body: files.get(FILES.body)?.toString('utf8') ?? null,
    image: imageName ? { fileName: imageName, data: files.get(imageName)! } : null,
  }
}

/** Lagrer tilstand i `{dir}/{id}/`. Brukes lokalt og i tester. */
export class LocalWriterStore implements WriterStore {
  constructor(private readonly dir: string) {}

  async load(writerId: string): Promise<StoredWriter | null> {
    const writerDir = path.join(this.dir, writerId)
    let names: string[]
    try {
      names = await fs.readdir(writerDir)
    } catch {
      return null
    }
    const files = new Map<string, Buffer>()
    for (const name of names) {
      const full = path.join(writerDir, name)
      if ((await fs.stat(full)).isFile()) files.set(name, await fs.readFile(full))
    }
    return deserialize(files)
  }

  async save(writerId: string, stored: StoredWriter): Promise<void> {
    const writerDir = path.join(this.dir, writerId)
    await fs.mkdir(writerDir, { recursive: true })
    for (const file of serialize(stored)) {
      await fs.writeFile(path.join(writerDir, file.name), file.content)
    }
  }

  async flush(): Promise<void> {}
}

/**
 * Tilstanden lever i `Individet/r-data` under `skribenter/{id}/`, slik at den
 * overlever mellom CI-kjøringer. r-data er alltid fasiten: en gammel lokal
 * kopi skal aldri overskrive nyere tilstand fra CI. Lokal kopi skrives bare
 * for innsyn. Alle endringer committes samlet i `flush()`.
 */
export class GitHubWriterStore implements WriterStore {
  private readonly pending: PublishedFile[] = []
  private readonly local: LocalWriterStore

  constructor(localDir: string) {
    this.local = new LocalWriterStore(localDir)
  }

  async load(writerId: string): Promise<StoredWriter | null> {
    const dir = `${RAW_DATA.rootDir}/${writerId}`
    const paths = await listRemoteDir(RAW_DATA_REPO, RAW_DATA.branch, dir)
    if (paths.length === 0) return null
    const files = new Map<string, Buffer>()
    for (const remotePath of paths) {
      const content = await readRemoteFile(RAW_DATA_REPO, RAW_DATA.branch, remotePath)
      if (content) files.set(path.posix.basename(remotePath), content)
    }
    return deserialize(files)
  }

  async save(writerId: string, stored: StoredWriter): Promise<void> {
    await this.local.save(writerId, stored)
    for (const file of serialize(stored)) {
      this.pending.push({ path: `${RAW_DATA.rootDir}/${writerId}/${file.name}`, content: file.content })
    }
  }

  async flush(message: string): Promise<void> {
    if (this.pending.length === 0) return
    await commitFiles(RAW_DATA_REPO, RAW_DATA.branch, this.pending, message)
    console.log(`[store] Lagret ${this.pending.length} filer i ${RAW_DATA.owner}/${RAW_DATA.repo}.`)
    this.pending.length = 0
  }
}
