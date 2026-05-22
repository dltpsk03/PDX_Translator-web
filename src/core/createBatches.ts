import { protectPlaceholders } from './protectPlaceholders'
import type { LocalizationEntry, ProtectedPlaceholder } from '../types/paradox'

export type BatchEntry = {
  entry: LocalizationEntry
  globalIndex: number
  lineIndex: number
  protectedValue: string
  placeholders: ProtectedPlaceholder[]
  promptLine: string
}

export type TranslationBatch = {
  batchIndex: number
  entries: BatchEntry[]
  promptText: string
  charCount: number
}

export type CreateBatchesOptions = {
  maxLines: number
  maxChars: number
}

function assertPositiveInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`)
  }
}

function createPromptLine(entry: LocalizationEntry, protectedValue: string) {
  return `${entry.prefix}${protectedValue}${entry.suffix}`
}

function getBatchCharCount(entries: BatchEntry[]) {
  return entries.reduce((sum, entry, index) => sum + entry.promptLine.length + (index > 0 ? 1 : 0), 0)
}

function createBatch(batchIndex: number, entries: BatchEntry[]): TranslationBatch {
  return {
    batchIndex,
    entries,
    promptText: entries.map((entry) => entry.promptLine).join('\n'),
    charCount: getBatchCharCount(entries),
  }
}

export function createBatches(
  entries: LocalizationEntry[],
  { maxLines, maxChars }: CreateBatchesOptions,
): TranslationBatch[] {
  assertPositiveInteger('maxLines', maxLines)
  assertPositiveInteger('maxChars', maxChars)

  const batches: TranslationBatch[] = []
  let currentEntries: BatchEntry[] = []

  for (const entry of entries) {
    const protectedText = protectPlaceholders(entry.value)
    const batchEntry: BatchEntry = {
      entry,
      globalIndex: entry.globalIndex,
      lineIndex: entry.lineIndex,
      protectedValue: protectedText.text,
      placeholders: protectedText.placeholders,
      promptLine: createPromptLine(entry, protectedText.text),
    }
    const currentCharCount = getBatchCharCount(currentEntries)
    const nextCharCount =
      currentCharCount + batchEntry.promptLine.length + (currentEntries.length > 0 ? 1 : 0)
    const shouldStartNewBatch =
      currentEntries.length > 0 &&
      (currentEntries.length >= maxLines || nextCharCount > maxChars)

    if (shouldStartNewBatch) {
      batches.push(createBatch(batches.length, currentEntries))
      currentEntries = []
    }

    currentEntries.push(batchEntry)
  }

  if (currentEntries.length > 0) {
    batches.push(createBatch(batches.length, currentEntries))
  }

  return batches
}
