import { parseParadoxYml } from './parseParadoxYml'
import { createTranslationResultMap, rebuildParadoxYml } from './rebuildParadoxYml'
import type { TranslatedEntryResult } from './runTranslation'
import type { LocalizationEntry } from '../types/paradox'

function translated(entry: LocalizationEntry, outputLine: string): TranslatedEntryResult {
  return {
    entry,
    translatedValue: outputLine,
    outputLine,
    failed: false,
    errors: [],
  }
}

function failed(entry: LocalizationEntry): TranslatedEntryResult {
  return {
    entry,
    translatedValue: entry.value,
    outputLine: entry.rawLine,
    failed: true,
    errors: [],
  }
}

describe('rebuildParadoxYml', () => {
  it('rebuilds translated entries at their original lineIndex and preserves raw lines', () => {
    const parsed = parseParadoxYml(
      ['l_english:', '', ' # comment', ' title:0 "Title"', ' desc:0 "Desc"'].join('\n'),
      { fileName: 'test.yml' },
    )
    const entries = parsed.filter((line): line is LocalizationEntry => line.type === 'entry')

    const result = rebuildParadoxYml(
      parsed,
      createTranslationResultMap([
        translated(entries[0], ' title:0 "제목"'),
        translated(entries[1], ' desc:0 "설명"'),
      ]),
    )

    expect(result.text).toBe(
      ['l_english:', '', ' # comment', ' title:0 "제목"', ' desc:0 "설명"'].join('\n'),
    )
    expect(result.failedEntries).toEqual([])
  })

  it('keeps failed entries as original text and reports them', () => {
    const parsed = parseParadoxYml([' title:0 "Title"', ' desc:0 "Desc"'].join('\n'), {
      fileName: 'test.yml',
    })
    const entries = parsed.filter((line): line is LocalizationEntry => line.type === 'entry')
    const failedEntry = failed(entries[1])

    const result = rebuildParadoxYml(
      parsed,
      createTranslationResultMap([translated(entries[0], ' title:0 "제목"'), failedEntry]),
    )

    expect(result.text).toBe([' title:0 "제목"', ' desc:0 "Desc"'].join('\n'))
    expect(result.failedEntries).toEqual([failedEntry])
  })

  it('keeps original entries when no translation result exists', () => {
    const parsed = parseParadoxYml(' title:0 "Title"', { fileName: 'test.yml' })

    const result = rebuildParadoxYml(parsed, new Map())

    expect(result.text).toBe(' title:0 "Title"')
    expect(result.failedEntries).toEqual([])
  })

  it('replaces the first language header even after comments', () => {
    const parsed = parseParadoxYml(['# comment', '', 'l_english:', ' title:0 "Title"'].join('\n'), {
      fileName: 'test.yml',
    })

    const result = rebuildParadoxYml(parsed, new Map(), {
      targetLanguage: 'l_korean',
    })

    expect(result.text).toBe(['# comment', '', 'l_korean:', ' title:0 "Title"'].join('\n'))
  })

  it('uses lineIndex order when the parsed line array is not ordered', () => {
    const parsed = parseParadoxYml([' title:0 "Title"', ' desc:0 "Desc"'].join('\n'), {
      fileName: 'test.yml',
    })

    const result = rebuildParadoxYml([parsed[1], parsed[0]], new Map())

    expect(result.text).toBe([' title:0 "Title"', ' desc:0 "Desc"'].join('\n'))
  })
})
