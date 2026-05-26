import { createBatches } from './createBatches'
import { parseParadoxYml } from './parseParadoxYml'
import { validateTranslatedBatch } from './validateTranslatedBatch'
import type { LocalizationEntry } from '../types/paradox'

function entriesFrom(text: string) {
  return parseParadoxYml(text, { fileName: 'source.yml' }).filter(
    (line): line is LocalizationEntry => line.type === 'entry',
  )
}

function batchFrom(text: string) {
  return createBatches(entriesFrom(text), { maxLines: 80, maxChars: 10000 })[0]
}

describe('validateTranslatedBatch', () => {
  it('accepts translated lines with the same keys, versions, order, and placeholders', () => {
    const batch = batchFrom(
      [
        ' title:0 "A Dangerous Proposal"',
        ' desc:0 "[ROOT.GetCountry.GetName] arrived\\n#P Good #!"',
      ].join('\n'),
    )

    const result = validateTranslatedBatch(
      batch,
      [' title:0 "위험한 제안"', ' desc:0 "<P0> 도착했다<P1><P2>"'].join('\n'),
    )

    expect(result).toEqual({
      ok: true,
      errors: [],
    })
  })

  it('reports line count mismatches and missing lines', () => {
    const batch = batchFrom([' first:0 "One"', ' second:0 "Two"'].join('\n'))

    const result = validateTranslatedBatch(batch, ' first:0 "하나"')

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      {
        code: 'line_count_mismatch',
        batchIndex: 0,
        message: 'Expected 2 translated lines but received 1.',
      },
      {
        code: 'missing_line',
        batchIndex: 0,
        lineIndex: 1,
        globalIndex: 1,
        resultLineIndex: 1,
        message: 'Line 2 is missing from the result.',
      },
    ])
  })

  it('reports unexpected extra lines', () => {
    const batch = batchFrom(' first:0 "One"')

    const result = validateTranslatedBatch(
      batch,
      [' first:0 "하나"', ' second:0 "둘"'].join('\n'),
    )

    expect(result.errors).toEqual([
      {
        code: 'line_count_mismatch',
        batchIndex: 0,
        message: 'Expected 1 translated lines but received 2.',
      },
      {
        code: 'unexpected_line',
        batchIndex: 0,
        resultLineIndex: 1,
        message: 'Line 2 is unexpected in the result.',
      },
    ])
  })

  it('reports unparseable translated lines', () => {
    const batch = batchFrom(' title:0 "Title"')

    const result = validateTranslatedBatch(batch, 'translated title only')

    expect(result.errors).toEqual([
      {
        code: 'unparseable_line',
        batchIndex: 0,
        lineIndex: 0,
        globalIndex: 0,
        resultLineIndex: 0,
        message: 'Line 1 is not a valid quoted localization entry.',
      },
    ])
  })

  it('reports key changes and order changes as key mismatches', () => {
    const batch = batchFrom([' first:0 "One"', ' second:0 "Two"'].join('\n'))

    const result = validateTranslatedBatch(
      batch,
      [' second:0 "둘"', ' first:0 "하나"'].join('\n'),
    )

    expect(result.errors).toEqual([
      {
        code: 'key_mismatch',
        batchIndex: 0,
        lineIndex: 0,
        globalIndex: 0,
        resultLineIndex: 0,
        message: 'Line 1 key changed from "first" to "second".',
      },
      {
        code: 'key_mismatch',
        batchIndex: 0,
        lineIndex: 1,
        globalIndex: 1,
        resultLineIndex: 1,
        message: 'Line 2 key changed from "second" to "first".',
      },
    ])
  })

  it('reports version changes', () => {
    const batch = batchFrom(' title:0 "Title"')

    const result = validateTranslatedBatch(batch, ' title:1 "제목"')

    expect(result.errors).toEqual([
      {
        code: 'version_mismatch',
        batchIndex: 0,
        lineIndex: 0,
        globalIndex: 0,
        resultLineIndex: 0,
        message: 'Line 1 version changed from ":0" to ":1".',
      },
    ])
  })

  it('reports missing placeholders', () => {
    const batch = batchFrom(' desc:0 "[ROOT.GetCountry.GetName] gains £gold£"')

    const result = validateTranslatedBatch(batch, ' desc:0 "<P0> 골드를 얻음"')

    expect(result.errors).toEqual([
      {
        code: 'placeholder_missing',
        batchIndex: 0,
        lineIndex: 0,
        globalIndex: 0,
        resultLineIndex: 0,
        message: 'Line 1 is missing placeholder <P1> (£gold£).',
      },
    ])
  })

  it('reports missing escaped newline placeholders separately', () => {
    const batch = batchFrom(' desc:0 "First line\\nSecond line"')

    const result = validateTranslatedBatch(batch, ' desc:0 "첫 줄 두 번째 줄"')

    expect(result.errors).toEqual([
      {
        code: 'escaped_newline_missing',
        batchIndex: 0,
        lineIndex: 0,
        globalIndex: 0,
        resultLineIndex: 0,
        message: 'Line 1 is missing placeholder <P0> (\\n).',
      },
    ])
  })

  it('reports values that are returned unchanged from the source', () => {
    const batch = batchFrom(' title:0 "A Dangerous Proposal"')

    const result = validateTranslatedBatch(batch, ' title:0 "A Dangerous Proposal"')

    expect(result.errors).toEqual([
      {
        code: 'untranslated_value',
        batchIndex: 0,
        lineIndex: 0,
        globalIndex: 0,
        resultLineIndex: 0,
        message: 'Line 1 still matches the original source text.',
      },
    ])
  })

  it('reports translated values that append the original source text', () => {
    const batch = batchFrom(
      ' stts_movement.19.f:0 "We must smother the internal and external enemies."',
    )

    const result = validateTranslatedBatch(
      batch,
      ' stts_movement.19.f:0 "Translated text. We must smother the internal and external enemies."',
    )

    expect(result.errors).toEqual([
      {
        code: 'source_value_repeated',
        batchIndex: 0,
        lineIndex: 0,
        globalIndex: 0,
        resultLineIndex: 0,
        message: 'Line 1 includes the original source text after the translation.',
      },
    ])
  })

  it('checks unchanged text inside unescaped inner quotes', () => {
    const batch = batchFrom(' boardroom_schism.5.f: ""For years, we claimed.""')

    const result = validateTranslatedBatch(
      batch,
      ' boardroom_schism.5.f: ""For years, we claimed.""',
    )

    expect(result.errors).toEqual([
      {
        code: 'untranslated_value',
        batchIndex: 0,
        lineIndex: 0,
        globalIndex: 0,
        resultLineIndex: 0,
        message: 'Line 1 still matches the original source text.',
      },
    ])
  })

  it('supports entries without numeric versions', () => {
    const batch = batchFrom(' je_arab_spring: "The Arab Spring"')

    const result = validateTranslatedBatch(batch, ' je_arab_spring: "아랍의 봄"')

    expect(result).toEqual({
      ok: true,
      errors: [],
    })
  })

  it('accepts :0 added by the model for entries that originally had no numeric version', () => {
    const batch = batchFrom(' je_arab_spring: "The Arab Spring"')

    const result = validateTranslatedBatch(batch, ' je_arab_spring:0 "아랍의 봄"')

    expect(result).toEqual({
      ok: true,
      errors: [],
    })
  })
})
