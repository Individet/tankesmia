import { main } from './isi-rangering'

const AKTORFIL_ARG = process.argv.slice(2).find((arg) => !arg.startsWith('-'))

main(AKTORFIL_ARG ?? 'actors.json').catch((err) => {
  console.error(err)
  process.exit(1)
})
