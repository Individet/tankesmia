import path from 'path'
import { createProfilesPipeline } from './00_create_profile'
import { outputSearchPipeline } from './01_search_pipeline'
import { endReportPipeline } from './02_end_report'
import { saveReportsPipeline } from './03_save_reports'

const STANDARD_AKTORFIL = path.join('pipelines', 'isi-rangering', 'actors.json')
const STANDARD_MANIFESTFIL = path.join('manifest-kondensert.md')
const STANDARD_TEMPLATE = path.join(
  'skills',
  'isi-scoring',
  'references',
  'template.md',
)
const STANDARD_ISI_RAMMVERK = path.join(
  'skills',
  'isi-scoring',
  'references',
  'ISI.md',
)

type Step = '00' | '01' | '02' | '03'

function hentArgs(): { step: Step; aktorFil: string; dryRun: boolean } {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const stepArg = args.find((arg) => !arg.startsWith('-'))
  if (!stepArg || !erGyldigSteg(stepArg)) {
    skrivBruk()
    process.exit(1)
  }

  const rest = args.filter((arg) => !arg.startsWith('-') && arg !== stepArg)
  const aktorFil = rest[0] ?? STANDARD_AKTORFIL

  return {
    step: stepArg,
    aktorFil,
    dryRun,
  }
}

function erGyldigSteg(verdi: string): verdi is Step {
  return verdi === '00' || verdi === '01' || verdi === '02' || verdi === '03'
}

function skrivBruk(): void {
  console.log(
    'Bruk: tsx pipelines/isi-rangering/run-isi-step.ts <00|01|02|03> [aktor-fil] [--dry-run]',
  )
  console.log(
    'Eksempel: tsx pipelines/isi-rangering/run-isi-step.ts 01 --dry-run',
  )
}

async function runSingleStep(): Promise<void> {
  const { step, aktorFil, dryRun } = hentArgs()
  const outputDir = path.join('output', 'isi-rangering')

  console.log(
    '=============================================================================',
  )
  console.log(`Starter ISI-pipeline steg ${step} for ${aktorFil}`)
  console.log(`Output-mappe: ${outputDir}`)
  console.log(`Dry-run: ${dryRun ? 'ja' : 'nei'}`)
  console.log(
    '=============================================================================\n',
  )

  try {
    if (step === '00') {
      console.log('>>> [STEG 00] Kjører profil-analyse (00_create_profile)...')
      await createProfilesPipeline(aktorFil, outputDir, dryRun)
      console.log('✓ Steg 00 fullfort.')
      return
    }

    if (step === '01') {
      console.log('>>> [STEG 01] Kjører dimensjons-sok (01_search_pipeline)...')
      await outputSearchPipeline(
        aktorFil,
        STANDARD_MANIFESTFIL,
        outputDir,
        dryRun,
      )
      console.log('✓ Steg 01 fullfort.')
      return
    }

    if (step === '02') {
      console.log('>>> [STEG 02] Kompilerer sluttrapporter (02_end_report)...')
      await endReportPipeline(
        aktorFil,
        STANDARD_TEMPLATE,
        STANDARD_MANIFESTFIL,
        STANDARD_ISI_RAMMVERK,
        outputDir,
        dryRun,
      )
      console.log('✓ Steg 02 fullfort.')
      return
    }

    console.log(
      '>>> [STEG 03] Lagrer rapporter/radata til GitHub (03_save_reports)...',
    )
    await saveReportsPipeline(aktorFil, outputDir, dryRun)
    console.log('✓ Steg 03 fullfort.')
  } catch (err) {
    console.error(`Steg ${step} feilet under kjoring:`)
    console.error(err)
    process.exit(1)
  }
}

runSingleStep()
