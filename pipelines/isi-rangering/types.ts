import type { BatchTokenForbruk } from './anthropic-live'

export interface Aktor {
  name: string
  type: string
  tilhørighet?: string
  jurisdiksjon?: string
  periode?: string
}

export interface DimensjonsFunn {
  dimensjon: string
  dimensjonNavn: string
  funn: string // råtekst fra agenten, inkl. kilder
}

export interface AktorRådata {
  aktor: Aktor
  timestamp: string
  dimensjoner: DimensjonsFunn[]
  anthropicTokenForbruk: {
    dimensjoner: BatchTokenForbruk
    rapporter: BatchTokenForbruk
  }
}
