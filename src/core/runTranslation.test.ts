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

  it('restores Concept placeholders exactly after translating protected tokens', async () => {
    const entries = entriesFrom(
      ` identity_corporate_hegemony_desc: "This Identity values industrial and economic consolidation among its Bloc Members, treating sovereign [Concept('concept_country','$concept_countries$')] as corporate subsidiaries."`,
    )
    const translateBatch = vi.fn<
      (batch: TranslationBatch, retryInstructions?: string[]) => Promise<string>
    >(async () =>
      ` identity_corporate_hegemony_desc: "이 정체성은 블록 구성원들 사이의 산업적, 경제적 통합을 중시하며, 주권적인 <P0>을 기업 자회사로 취급합니다."`,
    )

    const result = await runTranslation({
      entries,
      translateBatch,
    })

    expect(translateBatch).toHaveBeenCalled()
    const firstBatch = translateBatch.mock.calls[0]?.[0]

    expect(firstBatch?.entries[0].placeholders).toEqual([
      { token: '<P0>', value: "[Concept('concept_country','$concept_countries$')]" },
    ])
    expect(result.failedEntries).toEqual([])
    expect(result.results[0].outputLine).toBe(
      ` identity_corporate_hegemony_desc: "이 정체성은 블록 구성원들 사이의 산업적, 경제적 통합을 중시하며, 주권적인 [Concept('concept_country','$concept_countries$')]을 기업 자회사로 취급합니다."`,
    )
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

  it('reports retry progress with source file line and key instead of batch line only', async () => {
    const entries = entriesFrom(['', ' title:0 "A Dangerous Proposal"'].join('\n'))
    const progress = vi.fn()
    const translateBatch = vi
      .fn<(batch: TranslationBatch, retryInstructions?: string[]) => Promise<string>>()
      .mockResolvedValueOnce(' title:0 "A Dangerous Proposal"')
      .mockResolvedValueOnce(' title:0 "Translated proposal"')

    await runTranslation({
      entries,
      translateBatch,
      onProgress: progress,
    })

    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        recentError: 'source.yml:2 title: still matches the original source text.',
      }),
    )
  })

  it('splits a failed batch into 10-entry retry chunks', async () => {
    const entries = entriesFrom(
      Array.from({ length: 24 }, (_, index) => ` key_${index}:0 "Value ${index}"`).join('\n'),
    )
    const translateBatch = vi.fn(async (batch: TranslationBatch) => {
      if (batch.entries.length > 10) {
        return 'invalid output'
      }

      return batch.promptText.replaceAll('Value', '번역')
    })

    const result = await runTranslation({
      entries,
      batchSize: 30,
      translateBatch,
    })

    expect(translateBatch).toHaveBeenCalledTimes(5)
    expect(translateBatch.mock.calls.map(([batch]) => batch.entries.length)).toEqual([
      24,
      24,
      10,
      10,
      4,
    ])
    expect(result.failedEntries).toEqual([])
    expect(result.results).toHaveLength(24)
    expect(result.results[0].outputLine).toBe(' key_0:0 "번역 0"')
    expect(result.results[23].outputLine).toBe(' key_23:0 "번역 23"')
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

  it('does not translate source entries with malformed Concept placeholders', async () => {
    const entries = entriesFrom(
      ` identity_corporate_hegemony_desc: "이 정체성은 블록 구성원들 사이의 산업적, 경제적 통합을 중시하며, 주권적인 [Concept('concept_country','$concept_countries을 기업 자회사로 취급합니다.)]을 기업 자회사로 취급합니다."`,
    )
    const translateBatch = vi.fn(async (batch: TranslationBatch) => batch.promptText)

    const result = await runTranslation({
      entries,
      translateBatch,
    })

    expect(translateBatch).not.toHaveBeenCalled()
    expect(result.failedEntries).toHaveLength(1)
    expect(result.results[0].outputLine).toBe(entries[0].rawLine)
    expect(result.results[0].errors.map((error) => error.code)).toEqual([
      'malformed_placeholder',
      'malformed_placeholder',
    ])
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
