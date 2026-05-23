import type { TranslatedEntryResult } from './runTranslation'
import {
  isLanguageHeader,
  replaceLanguageHeader,
  type ParadoxLanguageCode,
} from './paradoxLanguages'
import type { ParsedLine } from '../types/paradox'

export type RebuildParadoxYmlResult = {
  text: string
  failedEntries: TranslatedEntryResult[]
}

export type RebuildParadoxYmlOptions = {
  targetLanguage?: ParadoxLanguageCode
}

export function createTranslationResultMap(results: TranslatedEntryResult[]) {
  return new Map(results.map((result) => [result.entry.globalIndex, result]))
}

export function rebuildParadoxYml(
  parsedLines: ParsedLine[],
  translatedResultMap: Map<number, TranslatedEntryResult>,
  { targetLanguage }: RebuildParadoxYmlOptions = {},
): RebuildParadoxYmlResult {
  const failedEntries: TranslatedEntryResult[] = []
  let replacedLanguageHeader = false
  const rebuiltLines = parsedLines
    .toSorted((a, b) => a.lineIndex - b.lineIndex)
    .map((line) => {
      if (line.type === 'raw') {
        if (targetLanguage && !replacedLanguageHeader && isLanguageHeader(line.rawLine)) {
          replacedLanguageHeader = true

          return replaceLanguageHeader(line.rawLine, targetLanguage)
        }

        return line.rawLine
      }

      const translatedResult = translatedResultMap.get(line.globalIndex)

      if (!translatedResult) {
        return line.rawLine
      }

      if (translatedResult.failed) {
        failedEntries.push(translatedResult)

        return line.rawLine
      }

      return translatedResult.outputLine
    })

  return {
    text: rebuiltLines.join('\n'),
    failedEntries,
  }
}
