export type LocalizationEntry = {
  type: 'entry'
  fileName: string
  lineIndex: number
  globalIndex: number
  rawLine: string
  indent: string
  key: string
  version: string
  value: string
  prefix: string
  suffix: string
}

export type RawLine = {
  type: 'raw'
  lineIndex: number
  rawLine: string
}

export type ParsedLine = LocalizationEntry | RawLine

export type ProtectedPlaceholder = {
  token: string
  value: string
}
