import type { TranslationBatch } from './createBatches'
import {
  findMalformedParadoxPlaceholderText,
  findParadoxPlaceholderText,
} from './paradoxPlaceholders'
import { parseParadoxYml } from './parseParadoxYml'

export type ValidationErrorCode =
  | 'line_count_mismatch'
  | 'missing_line'
  | 'unexpected_line'
  | 'unparseable_line'
  | 'key_mismatch'
  | 'version_mismatch'
  | 'placeholder_missing'
  | 'placeholder_count_mismatch'
  | 'unknown_placeholder_token'
  | 'raw_placeholder_leaked'
  | 'malformed_placeholder'
  | 'escaped_newline_missing'
  | 'untranslated_value'
  | 'source_value_repeated'

export type ValidationError = {
  code: ValidationErrorCode
  batchIndex: number
  lineIndex?: number
  globalIndex?: number
  resultLineIndex?: number
  message: string
}

export type ValidateTranslatedBatchResult = {
  ok: boolean
  errors: ValidationError[]
}

function createEntryError(
  batch: TranslationBatch,
  entryIndex: number,
  code: ValidationErrorCode,
  message: string,
): ValidationError {
  const batchEntry = batch.entries[entryIndex]

  return {
    code,
    batchIndex: batch.batchIndex,
    lineIndex: batchEntry?.lineIndex,
    globalIndex: batchEntry?.globalIndex,
    resultLineIndex: entryIndex,
    message,
  }
}

function normalizeComparableValue(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function removeProtectedPlaceholderTokens(value: string) {
  return value.replace(/<P\d+>/g, '')
}

function countTokenOccurrences(value: string, token: string) {
  return value.split(token).length - 1
}

function findUnknownPlaceholderTokens(value: string, knownTokens: Set<string>) {
  return [...value.matchAll(/<P\d+>/g)]
    .map((match) => match[0])
    .filter((token, index, tokens) => !knownTokens.has(token) && tokens.indexOf(token) === index)
}

function findRawPlaceholderLeaks(value: string) {
  return findParadoxPlaceholderText(value)
}

function isMeaningfulSourceValue(value: string) {
  const normalized = normalizeComparableValue(removeProtectedPlaceholderTokens(value))

  return normalized.length >= 4 && /[\p{L}\p{N}]/u.test(normalized)
}

export function validateTranslatedBatch(
  batch: TranslationBatch,
  translatedText: string,
): ValidateTranslatedBatchResult {
  const errors: ValidationError[] = []
  const parsedLines = parseParadoxYml(translatedText, {
    fileName: `translated-batch-${batch.batchIndex}`,
  })

  if (parsedLines.length !== batch.entries.length) {
    errors.push({
      code: 'line_count_mismatch',
      batchIndex: batch.batchIndex,
      message: `Expected ${batch.entries.length} translated lines but received ${parsedLines.length}.`,
    })
  }

  const comparableLineCount = Math.min(parsedLines.length, batch.entries.length)

  for (let index = 0; index < comparableLineCount; index += 1) {
    const originalEntry = batch.entries[index].entry
    const translatedLine = parsedLines[index]

    if (translatedLine.type !== 'entry') {
      errors.push(
        createEntryError(
          batch,
          index,
          'unparseable_line',
          `Line ${index + 1} is not a valid quoted localization entry.`,
        ),
      )
      continue
    }

    if (translatedLine.key !== originalEntry.key) {
      errors.push(
        createEntryError(
          batch,
          index,
          'key_mismatch',
          `Line ${index + 1} key changed from "${originalEntry.key}" to "${translatedLine.key}".`,
        ),
      )
    }

    const versionMatches =
      translatedLine.version === originalEntry.version ||
      (originalEntry.version === '' && translatedLine.version === ':0')

    if (!versionMatches) {
      errors.push(
        createEntryError(
          batch,
          index,
          'version_mismatch',
          `Line ${index + 1} version changed from "${originalEntry.version}" to "${translatedLine.version}".`,
        ),
      )
    }

    const placeholders = batch.entries[index].placeholders
    const knownPlaceholderTokens = new Set(placeholders.map((placeholder) => placeholder.token))

    for (const placeholder of placeholders) {
      const tokenCount = countTokenOccurrences(translatedLine.value, placeholder.token)

      if (tokenCount === 0) {
        const code =
          placeholder.value === '\\n' ? 'escaped_newline_missing' : 'placeholder_missing'

        errors.push(
          createEntryError(
            batch,
            index,
            code,
            `Line ${index + 1} is missing placeholder ${placeholder.token} (${placeholder.value}).`,
          ),
        )
      } else if (tokenCount > 1) {
        errors.push(
          createEntryError(
            batch,
            index,
            'placeholder_count_mismatch',
            `Line ${index + 1} repeats placeholder ${placeholder.token} ${tokenCount} times.`,
          ),
        )
      }
    }

    for (const token of findUnknownPlaceholderTokens(translatedLine.value, knownPlaceholderTokens)) {
      errors.push(
        createEntryError(
          batch,
          index,
          'unknown_placeholder_token',
          `Line ${index + 1} contains unknown placeholder token ${token}.`,
        ),
      )
    }

    for (const placeholder of findRawPlaceholderLeaks(translatedLine.value)) {
      errors.push(
        createEntryError(
          batch,
          index,
          'raw_placeholder_leaked',
          `Line ${index + 1} contains raw placeholder text instead of protected tokens: ${placeholder}.`,
        ),
      )
    }

    for (const placeholder of findMalformedParadoxPlaceholderText(translatedLine.value)) {
      errors.push(
        createEntryError(
          batch,
          index,
          'malformed_placeholder',
          `Line ${index + 1} contains malformed placeholder text: ${placeholder.text} (${placeholder.reason}).`,
        ),
      )
    }

    const originalValue = normalizeComparableValue(batch.entries[index].protectedValue)
    const translatedValue = normalizeComparableValue(translatedLine.value)

    if (isMeaningfulSourceValue(originalValue)) {
      if (translatedValue === originalValue) {
        errors.push(
          createEntryError(
            batch,
            index,
            'untranslated_value',
            `Line ${index + 1} still matches the original source text.`,
          ),
        )
      } else if (translatedValue.length > originalValue.length && translatedValue.includes(originalValue)) {
        errors.push(
          createEntryError(
            batch,
            index,
            'source_value_repeated',
            `Line ${index + 1} includes the original source text after the translation.`,
          ),
        )
      }
    }
  }

  for (let index = comparableLineCount; index < batch.entries.length; index += 1) {
    errors.push(
      createEntryError(batch, index, 'missing_line', `Line ${index + 1} is missing from the result.`),
    )
  }

  for (let index = comparableLineCount; index < parsedLines.length; index += 1) {
    errors.push({
      code: 'unexpected_line',
      batchIndex: batch.batchIndex,
      resultLineIndex: index,
      message: `Line ${index + 1} is unexpected in the result.`,
    })
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}
