import type { LocalizationEntry, ParsedLine, RawLine } from '../types/paradox'

const localizationLinePattern = /^(\s*)([^\s:#][^:\s]*):(\d*)(\s*)"((?:\\.|[^\\])*)"(.*)$/

export type ParseParadoxYmlOptions = {
  fileName: string
  globalIndexStart?: number
}

function normalizeLineEndings(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function parseLocalizationLine(
  rawLine: string,
  lineIndex: number,
  fileName: string,
  globalIndex: number,
): LocalizationEntry | RawLine {
  const match = rawLine.match(localizationLinePattern)

  if (!match) {
    return {
      type: 'raw',
      lineIndex,
      rawLine,
    }
  }

  const [, indent, key, versionDigits, separator, value, trailingText] = match
  const version = versionDigits ? `:${versionDigits}` : ''

  return {
    type: 'entry',
    fileName,
    lineIndex,
    globalIndex,
    rawLine,
    indent,
    key,
    version,
    value,
    prefix: `${indent}${key}:${versionDigits}${separator}"`,
    suffix: `"${trailingText}`,
  }
}

export function parseParadoxYml(
  text: string,
  { fileName, globalIndexStart = 0 }: ParseParadoxYmlOptions,
): ParsedLine[] {
  let nextGlobalIndex = globalIndexStart

  return normalizeLineEndings(text).split('\n').map((rawLine, lineIndex) => {
    const parsedLine = parseLocalizationLine(rawLine, lineIndex, fileName, nextGlobalIndex)

    if (parsedLine.type === 'entry') {
      nextGlobalIndex += 1
    }

    return parsedLine
  })
}
