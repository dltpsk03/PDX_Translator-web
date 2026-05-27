import {
  createBatches,
  type BatchEntry,
  type TranslationBatch,
} from './createBatches'
import { parseParadoxYml } from './parseParadoxYml'
import { restorePlaceholders } from './restorePlaceholders'
import {
  validateTranslatedBatch,
  type ValidationError,
} from './validateTranslatedBatch'
import { findMalformedParadoxPlaceholderText } from './paradoxPlaceholders'
import { translateBatch as defaultTranslateBatch } from '../ollama/translateBatch'
import type { LocalizationEntry } from '../types/paradox'

export type TranslationProgress = {
  completedEntries: number
  totalEntries: number
  completedBatches: number
  totalBatches: number
  failedEntries: number
  activeBatches: number
  retriedBatches: number
  recentError: string | null
}

export type TranslatedEntryResult = {
  entry: LocalizationEntry
  translatedValue: string
  outputLine: string
  failed: boolean
  errors: ValidationError[]
}

export type RunTranslationOptions = {
  entries: LocalizationEntry[]
  batchSize?: number
  concurrency?: number
  maxChars?: number
  retryAttempts?: number
  splitFailedBatches?: boolean
  failedBatchSplitSize?: number
  translateBatch?: (batch: TranslationBatch, retryInstructions?: string[]) => Promise<string>
  signal?: AbortSignal
  onProgress?: (progress: TranslationProgress) => void
}

export type RunTranslationResult = {
  results: TranslatedEntryResult[]
  failedEntries: TranslatedEntryResult[]
  progress: TranslationProgress
}

function assertPositiveInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`)
  }
}

function assertNonNegativeInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`)
  }
}

function createBatchFromEntries(batchIndex: number, entries: BatchEntry[]): TranslationBatch {
  const promptText = entries.map((entry) => entry.promptLine).join('\n')

  return {
    batchIndex,
    entries,
    promptText,
    charCount: promptText.length,
  }
}

function createFailureError(batch: TranslationBatch, message: string): ValidationError {
  return {
    code: 'unparseable_line',
    batchIndex: batch.batchIndex,
    message,
  }
}

function chunkEntries(entries: BatchEntry[], chunkSize: number) {
  const chunks: BatchEntry[][] = []

  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(entries.slice(index, index + chunkSize))
  }

  return chunks
}

function translateWithDefaultProvider(batch: TranslationBatch, retryInstructions?: string[]) {
  return defaultTranslateBatch(batch, { retryInstructions })
}

function createRetryInstructions(errors: ValidationError[]) {
  const instructions = new Set<string>()

  for (const error of errors) {
    if (error.code === 'untranslated_value') {
      instructions.add('Translate every quoted source value; do not return the original text unchanged.')
    } else if (error.code === 'source_value_repeated') {
      instructions.add('Do not append the original source text after the translated text.')
    } else if (error.code === 'unparseable_line') {
      instructions.add('Return only valid Paradox localization lines with quoted values.')
    } else if (error.code === 'line_count_mismatch' || error.code === 'missing_line') {
      instructions.add('Return exactly one output line for each input localization line.')
    } else if (error.code === 'unexpected_line') {
      instructions.add('Do not add extra lines, comments, explanations, or markdown.')
    } else if (error.code === 'key_mismatch') {
      instructions.add('Keep every localization key in the exact original order.')
    } else if (error.code === 'version_mismatch') {
      instructions.add('Keep version markers such as :0 unchanged.')
    } else if (
      error.code === 'placeholder_missing' ||
      error.code === 'placeholder_count_mismatch' ||
      error.code === 'unknown_placeholder_token' ||
      error.code === 'raw_placeholder_leaked' ||
      error.code === 'malformed_placeholder' ||
      error.code === 'escaped_newline_missing'
    ) {
      instructions.add(
        'Use only the original placeholder tokens such as <P0>; do not add, remove, duplicate, expand, or rewrite placeholder text.',
      )
    }
  }

  return [...instructions]
}

function formatRetryProgressMessage(batch: TranslationBatch, error: ValidationError | undefined) {
  if (!error) {
    return 'Validation failed; retrying batch.'
  }

  const batchEntry =
    typeof error.resultLineIndex === 'number' ? batch.entries[error.resultLineIndex] : undefined

  if (!batchEntry) {
    return error.message
  }

  const entry = batchEntry.entry
  const message = error.message.replace(/^Line \d+\s+/, '')

  return `${entry.fileName}:${entry.lineIndex + 1} ${entry.key}: ${message}`
}

function formatRequestRetryProgressMessage(batch: TranslationBatch, error: ValidationError | undefined) {
  if (!error) {
    return 'Translation request failed; retrying batch.'
  }

  const firstEntry = batch.entries[0]?.entry

  if (!firstEntry) {
    return error.message
  }

  return `${firstEntry.fileName}:${firstEntry.lineIndex + 1} ${firstEntry.key}: ${error.message}`
}

function createFailedResults(batch: TranslationBatch, errors: ValidationError[]): TranslatedEntryResult[] {
  return batch.entries.map((batchEntry) => ({
    entry: batchEntry.entry,
    translatedValue: batchEntry.entry.value,
    outputLine: batchEntry.entry.rawLine,
    failed: true,
    errors,
  }))
}

function createMalformedSourceResults(entries: LocalizationEntry[]): TranslatedEntryResult[] {
  return entries.flatMap((entry) => {
    const placeholders = findMalformedParadoxPlaceholderText(entry.value)

    if (placeholders.length === 0) {
      return []
    }

    return [
      {
      entry,
      translatedValue: entry.value,
      outputLine: entry.rawLine,
      failed: true,
      errors: placeholders.map((placeholder) => ({
          code: 'malformed_placeholder' as const,
          batchIndex: -1,
          lineIndex: entry.lineIndex,
          globalIndex: entry.globalIndex,
          resultLineIndex: 0,
          message: `Source contains malformed placeholder text: ${placeholder.text} (${placeholder.reason}).`,
        })),
      },
    ]
  })
}

function createSuccessResults(
  batch: TranslationBatch,
  translatedText: string,
): TranslatedEntryResult[] {
  const parsedLines = parseParadoxYml(translatedText, {
    fileName: `translated-batch-${batch.batchIndex}`,
  })

  return batch.entries.map((batchEntry, index) => {
    const parsedLine = parsedLines[index]
    const translatedValue =
      parsedLine?.type === 'entry'
        ? restorePlaceholders(parsedLine.value, batchEntry.placeholders)
        : batchEntry.entry.value

    return {
      entry: batchEntry.entry,
      translatedValue,
      outputLine: `${batchEntry.entry.prefix}${translatedValue}${batchEntry.entry.suffix}`,
      failed: false,
      errors: [],
    }
  })
}

async function translateAndValidate(
  batch: TranslationBatch,
  translateBatch: (batch: TranslationBatch, retryInstructions?: string[]) => Promise<string>,
  retryInstructions?: string[],
) {
  const translatedText = await translateBatch(batch, retryInstructions)
  const validation = validateTranslatedBatch(batch, translatedText)

  if (!validation.ok) {
    return {
      ok: false as const,
      errors: validation.errors,
    }
  }

  return {
    ok: true as const,
    results: createSuccessResults(batch, translatedText),
  }
}

async function processBatch(
  batch: TranslationBatch,
  translateBatch: (batch: TranslationBatch, retryInstructions?: string[]) => Promise<string>,
  allowSplit: boolean,
  retryAttempts: number,
  failedBatchSplitSize: number,
  onRetry?: (message: string) => void,
): Promise<TranslatedEntryResult[]> {
  let lastErrors: ValidationError[] = []
  let retryInstructions: string[] = []

  for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
    try {
      const result = await translateAndValidate(batch, translateBatch, retryInstructions)

      if (result.ok) {
        return result.results
      }

      lastErrors = result.errors
      retryInstructions = createRetryInstructions(lastErrors)
      if (attempt < retryAttempts) {
        onRetry?.(formatRetryProgressMessage(batch, lastErrors[0]))
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }

      lastErrors = [
        createFailureError(
          batch,
          error instanceof Error ? error.message : 'Translation request failed.',
        ),
      ]
      retryInstructions = createRetryInstructions(lastErrors)
      if (attempt < retryAttempts) {
        onRetry?.(formatRequestRetryProgressMessage(batch, lastErrors[0]))
      }
    }
  }

  if (allowSplit && batch.entries.length > failedBatchSplitSize) {
    const splitBatches = chunkEntries(batch.entries, failedBatchSplitSize).map((entries) =>
      createBatchFromEntries(batch.batchIndex, entries),
    )
    const splitResults = await Promise.all(
      splitBatches.map((splitBatch) =>
        processBatch(splitBatch, translateBatch, false, retryAttempts, failedBatchSplitSize, onRetry),
      ),
    )

    return splitResults.flat()
  }

  return createFailedResults(batch, lastErrors)
}

export async function runTranslation({
  entries,
  batchSize = 20,
  concurrency = 30,
  maxChars = 12000,
  retryAttempts = 1,
  splitFailedBatches = true,
  failedBatchSplitSize = 10,
  translateBatch = translateWithDefaultProvider,
  signal,
  onProgress,
}: RunTranslationOptions): Promise<RunTranslationResult> {
  assertPositiveInteger('batchSize', batchSize)
  assertPositiveInteger('concurrency', concurrency)
  assertPositiveInteger('maxChars', maxChars)
  assertPositiveInteger('failedBatchSplitSize', failedBatchSplitSize)
  assertNonNegativeInteger('retryAttempts', retryAttempts)

  const malformedSourceResults = createMalformedSourceResults(entries)
  const malformedSourceIndexes = new Set(
    malformedSourceResults.map((result) => result.entry.globalIndex),
  )
  const translatableEntries = entries.filter(
    (entry) => !malformedSourceIndexes.has(entry.globalIndex),
  )

  const batches = createBatches(translatableEntries, {
    maxLines: batchSize,
    maxChars,
  })
  const results: TranslatedEntryResult[] = [...malformedSourceResults]
  const progress: TranslationProgress = {
    completedEntries: malformedSourceResults.length,
    totalEntries: entries.length,
    completedBatches: 0,
    totalBatches: batches.length,
    failedEntries: malformedSourceResults.length,
    activeBatches: 0,
    retriedBatches: 0,
    recentError: null,
  }
  let nextBatchIndex = 0

  onProgress?.({ ...progress })

  async function worker() {
    while (nextBatchIndex < batches.length && !signal?.aborted) {
      const batch = batches[nextBatchIndex]
      nextBatchIndex += 1

      progress.activeBatches += 1
      onProgress?.({ ...progress })

      try {
        const batchResults = await processBatch(
          batch,
          translateBatch,
          splitFailedBatches,
          retryAttempts,
          failedBatchSplitSize,
          (message) => {
            progress.retriedBatches += 1
            progress.recentError = message
            onProgress?.({ ...progress })
          },
        )

        results.push(...batchResults)
        progress.completedEntries += batch.entries.length
        progress.completedBatches += 1
        progress.failedEntries += batchResults.filter((result) => result.failed).length
      } finally {
        progress.activeBatches -= 1
        onProgress?.({ ...progress })
      }
    }

    signal?.throwIfAborted()
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()),
  )

  const orderedResults = results.toSorted((a, b) => a.entry.globalIndex - b.entry.globalIndex)
  const failedEntries = orderedResults.filter((result) => result.failed)

  return {
    results: orderedResults,
    failedEntries,
    progress: {
      ...progress,
      failedEntries: failedEntries.length,
    },
  }
}
