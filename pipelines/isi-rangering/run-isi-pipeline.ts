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

async function runFullPipeline() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const aktorFil = args.find((arg) => !arg.startsWith('-')) ?? STANDARD_AKTORFIL

  const outputDir = path.join('output', 'isi-rangering')

  console.log(
    '=============================================================================',
  )
  console.log(`🚀 Starter full ISI-pipeline for ${aktorFil}`)
  console.log(`📁 Output-mappe: ${outputDir}`)
  console.log(
    '=============================================================================\n',
  )

  try {
    console.log('>>> [STEG 1/4] Kjører profil-analyse (00_create_profile)...')
    await createProfilesPipeline(aktorFil, outputDir, dryRun)
    console.log('✓ Steg 1 fullført.\n')

    console.log('>>> [STEG 2/4] Kjører dimensjons-søk (01_search_pipeline)...')
    await outputSearchPipeline(
      aktorFil,
      STANDARD_MANIFESTFIL,
      outputDir,
      dryRun,
    )
    console.log('✓ Steg 2 fullført.\n')

    console.log('>>> [STEG 3/4] Kompilerer sluttrapporter (02_end_report)...')
    await endReportPipeline(
      aktorFil,
      STANDARD_TEMPLATE,
      STANDARD_MANIFESTFIL,
      STANDARD_ISI_RAMMVERK,
      outputDir,
      dryRun,
    )
    console.log('✓ Steg 3 fullført.\n')

    console.log(
      '>>> [STEG 4/4] Lagrer rapporter/rådata til GitHub (03_save_reports)...',
    )
    await saveReportsPipeline(aktorFil, outputDir, dryRun)
    console.log('✓ Steg 4 fullført.\n')

    console.log(outputDir)
  } catch (err) {
    console.error('! Pipeline feilet under kjøring:')
    console.error(err)
    process.exit(1)
  }
}

runFullPipeline()
