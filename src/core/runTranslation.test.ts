import type { TranslationBatch } from './createBatches'
import { parseParadoxYml } from './parseParadoxYml'
import { runTranslation } from './runTranslation'
import type { LocalizationEntry } from '../types/paradox'

function entriesFrom(text: string) {
  return parseParadoxYml(text, { fileName: 'source.yml' }).filter(
    (line): line is LocalizationEntry => line.type === 'entry',
  )
}

describe('runTranslation', () => {
  it('translates all batches and restores placeholders in output lines', async () => {
    const entries = entriesFrom(' title:0 "[ROOT.GetCountry.GetName] arrived\\nNow"')

    const result = await runTranslation({
      entries,
      translateBatch: async () => ' title:0 "<P0> 도착했다<P1>지금"',
    })

    expect(result.failedEntries).toEqual([])
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({
      translatedValue: '[ROOT.GetCountry.GetName] 도착했다\\n지금',
      outputLine: ' title:0 "[ROOT.GetCountry.GetName] 도착했다\\n지금"',
      failed: false,
    })
  })

  it('limits concurrent Ollama requests with a promise pool', async () => {
    const entries = entriesFrom(
      Array.from({ length: 6 }, (_, index) => ` key_${index}:0 "Value ${index}"`).join('\n'),
    )
    let activeRequests = 0
    let maxActiveRequests = 0

    await runTranslation({
      entries,
      batchSize: 1,
      concurrency: 2,
      translateBatch: async (batch) => {
        activeRequests += 1
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
        await new Promise((resolve) => setTimeout(resolve, 5))
        activeRequests -= 1

        return batch.promptText.replaceAll('Value', 'Translated')
      },
    })

    expect(maxActiveRequests).toBe(2)
  })

  it('retries the same batch once after a failed request', async () => {
    const entries = entriesFrom(' title:0 "Title"')
    const translateBatch = vi
      .fn<(batch: TranslationBatch, retryInstructions?: string[]) => Promise<string>>()
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce(' title:0 "제목"')

    const result = await runTranslation({
      entries,
      translateBatch,
    })

    expect(translateBatch).toHaveBeenCalledTimes(2)
    expect(result.failedEntries).toEqual([])
    expect(result.results[0].outputLine).toBe(' title:0 "제목"')
  })

  it('passes validation failure instructions into the retry prompt', async () => {
    const entries = entriesFrom(' title:0 "A Dangerous Proposal"')
    const translateBatch = vi
      .fn<(batch: TranslationBatch, retryInstructions?: string[]) => Promise<string>>()
      .mockResolvedValueOnce(' title:0 "A Dangerous Proposal"')
      .mockResolvedValueOnce(' title:0 "Translated proposal"')

    const result = await runTranslation({
      entries,
      translateBatch,
    })

    expect(translateBatch).toHaveBeenNthCalledWith(1, expect.anything(), [])
    expect(translateBatch).toHaveBeenNthCalledWith(2, expect.anything(), [
      'Translate every quoted source value; do not return the original text unchanged.',
    ])
    expect(result.failedEntries).toEqual([])
    expect(result.results[0].outputLine).toBe(' title:0 "Translated proposal"')
  })

  it('splits a failed batch in half and retries split batches', async () => {
    const entries = entriesFrom(
      [' first:0 "One"', ' second:0 "Two"', ' third:0 "Three"', ' fourth:0 "Four"'].join('\n'),
    )
    const translateBatch = vi.fn(async (batch: TranslationBatch) => {
      if (batch.entries.length === 4) {
        return 'invalid output'
      }

      return batch.promptText.replaceAll('One', '하나').replaceAll('Two', '둘').replaceAll('Three', '셋').replaceAll('Four', '넷')
    })

    const result = await runTranslation({
      entries,
      batchSize: 4,
      translateBatch,
    })

    expect(translateBatch).toHaveBeenCalledTimes(4)
    expect(result.failedEntries).toEqual([])
    expect(result.results.map((entry) => entry.outputLine)).toEqual([
      ' first:0 "하나"',
      ' second:0 "둘"',
      ' third:0 "셋"',
      ' fourth:0 "넷"',
    ])
  })

  it('marks entries failed and preserves original lines after retry and split failures', async () => {
    const entries = entriesFrom([' first:0 "One"', ' second:0 "Two"'].join('\n'))

    const result = await runTranslation({
      entries,
      batchSize: 2,
      translateBatch: async () => 'not localization',
    })

    expect(result.failedEntries).toHaveLength(2)
    expect(result.results.map((entry) => entry.outputLine)).toEqual([
      ' first:0 "One"',
      ' second:0 "Two"',
    ])
    expect(result.results.every((entry) => entry.failed)).toBe(true)
  })

  it('reports progress as top-level batches complete', async () => {
    const entries = entriesFrom([' first:0 "One"', ' second:0 "Two"'].join('\n'))
    const progress = vi.fn()

    await runTranslation({
      entries,
      batchSize: 1,
      concurrency: 1,
      translateBatch: async (batch) =>
        batch.promptText.replaceAll('One', 'Translated one').replaceAll('Two', 'Translated two'),
      onProgress: progress,
    })

    expect(progress).toHaveBeenCalledWith({
      completedEntries: 0,
      totalEntries: 2,
      completedBatches: 0,
      totalBatches: 2,
      failedEntries: 0,
      activeBatches: 0,
      retriedBatches: 0,
      recentError: null,
    })
    expect(progress).toHaveBeenLastCalledWith({
      completedEntries: 2,
      totalEntries: 2,
      completedBatches: 2,
      totalBatches: 2,
      failedEntries: 0,
      activeBatches: 0,
      retriedBatches: 0,
      recentError: null,
    })
  })
})
