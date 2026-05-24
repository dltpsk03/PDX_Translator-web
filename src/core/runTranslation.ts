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
  translateBatch?: (batch: TranslationBatch) => Promise<string>
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

function createFailedResults(batch: TranslationBatch, errors: ValidationError[]): TranslatedEntryResult[] {
  return batch.entries.map((batchEntry) => ({
    entry: batchEntry.entry,
    translatedValue: batchEntry.entry.value,
    outputLine: batchEntry.entry.rawLine,
    failed: true,
    errors,
  }))
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
  translateBatch: (batch: TranslationBatch) => Promise<string>,
) {
  const translatedText = await translateBatch(batch)
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
  translateBatch: (batch: TranslationBatch) => Promise<string>,
  allowSplit: boolean,
  retryAttempts: number,
  onRetry?: (message: string) => void,
): Promise<TranslatedEntryResult[]> {
  let lastErrors: ValidationError[] = []

  for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
    try {
      const result = await translateAndValidate(batch, translateBatch)

      if (result.ok) {
        return result.results
      }

      lastErrors = result.errors
      if (attempt < retryAttempts) {
        onRetry?.(lastErrors[0]?.message ?? 'Validation failed; retrying batch.')
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
      if (attempt < retryAttempts) {
        onRetry?.(lastErrors[0]?.message ?? 'Translation request failed; retrying batch.')
      }
    }
  }

  if (allowSplit && batch.entries.length > 1) {
    const midpoint = Math.ceil(batch.entries.length / 2)
    const splitBatches = [
      createBatchFromEntries(batch.batchIndex, batch.entries.slice(0, midpoint)),
      createBatchFromEntries(batch.batchIndex, batch.entries.slice(midpoint)),
    ]
    const splitResults = await Promise.all(
      splitBatches.map((splitBatch) =>
        processBatch(splitBatch, translateBatch, false, retryAttempts, onRetry),
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
  translateBatch = defaultTranslateBatch,
  signal,
  onProgress,
}: RunTranslationOptions): Promise<RunTranslationResult> {
  assertPositiveInteger('batchSize', batchSize)
  assertPositiveInteger('concurrency', concurrency)
  assertPositiveInteger('maxChars', maxChars)
  assertNonNegativeInteger('retryAttempts', retryAttempts)

  const batches = createBatches(entries, {
    maxLines: batchSize,
    maxChars,
  })
  const results: TranslatedEntryResult[] = []
  const progress: TranslationProgress = {
    completedEntries: 0,
    totalEntries: entries.length,
    completedBatches: 0,
    totalBatches: batches.length,
    failedEntries: 0,
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
