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
      [' title:0 "위험한 제안"', ' desc:0 "<P0> 도착했다<P1><P2> 좋음 <P3>"'].join('\n'),
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

  it('reports duplicated protected placeholder tokens', () => {
    const batch = batchFrom(' desc:0 "[ROOT.GetCountry.GetName] arrived"')

    const result = validateTranslatedBatch(batch, ' desc:0 "<P0> 도착했다 <P0>"')

    expect(result.errors).toEqual([
      {
        code: 'placeholder_count_mismatch',
        batchIndex: 0,
        lineIndex: 0,
        globalIndex: 0,
        resultLineIndex: 0,
        message: 'Line 1 repeats placeholder <P0> 2 times.',
      },
    ])
  })

  it('reports placeholder tokens that were not in the source line', () => {
    const batch = batchFrom(' desc:0 "[ROOT.GetCountry.GetName] arrived"')

    const result = validateTranslatedBatch(batch, ' desc:0 "<P0> 도착했다 <P9>"')

    expect(result.errors).toEqual([
      {
        code: 'unknown_placeholder_token',
        batchIndex: 0,
        lineIndex: 0,
        globalIndex: 0,
        resultLineIndex: 0,
        message: 'Line 1 contains unknown placeholder token <P9>.',
      },
    ])
  })

  it('reports raw Paradox placeholder text leaked into protected output', () => {
    const batch = batchFrom(
      [
        ` concept_line:0 "[Concept('concept_country','$concept_countries$')] matters"`,
        ' variable_line:0 "$COUNTRY_NAME$ matters"',
        ' icon_line:0 "£gold£ matters"',
        ' style_line:0 "#P Good #! matters"',
        ' at_icon_line:0 "@money! matters"',
        ' lowercase_style_line:0 "#v Good #! matters"',
      ].join('\n'),
    )

    const result = validateTranslatedBatch(
      batch,
      [
        ` concept_line:0 "<P0>는 중요하며 [Concept('concept_country','$concept_countries를 잘못 번역함')]도 추가됨"`,
        ' variable_line:0 "<P0>는 중요하며 $COUNTRY_NAME$도 추가됨"',
        ' icon_line:0 "<P0>는 중요하며 £gold£도 추가됨"',
        ' style_line:0 "<P0>는 중요하며 #P Good #!도 추가됨"',
        ' at_icon_line:0 "<P0>는 중요하며 @money!도 추가됨"',
        ' lowercase_style_line:0 "<P0>는 중요하며 #v Good #!도 추가됨"',
      ].join('\n'),
    )

    expect(result.errors.map((error) => error.code)).toEqual([
      'raw_placeholder_leaked',
      'malformed_placeholder',
      'raw_placeholder_leaked',
      'raw_placeholder_leaked',
      'placeholder_missing',
      'raw_placeholder_leaked',
      'raw_placeholder_leaked',
      'raw_placeholder_leaked',
      'placeholder_missing',
      'raw_placeholder_leaked',
      'raw_placeholder_leaked',
    ])
  })

  it('rejects translated text inserted inside a raw Concept placeholder', () => {
    const batch = batchFrom(
      ` identity_desc:0 "This Identity values industrial and economic consolidation among its Bloc Members, treating sovereign [Concept('concept_country','$concept_countries$')] as corporate subsidiaries."`,
    )

    const result = validateTranslatedBatch(
      batch,
      ` identity_desc:0 "이 정체성은 블록 구성원 간의 산업 및 경제적 통합을 중시하며, 주권 [Concept('concept_country','$concept_countries을(를) 기업의 자회사처럼 취급합니다.)]을(를) 기업의 자회사처럼 취급합니다."`,
    )

    expect(result.ok).toBe(false)
    expect(result.errors.map((error) => error.code)).toContain('placeholder_missing')
    expect(result.errors.map((error) => error.code)).toContain('raw_placeholder_leaked')
  })

  it('rejects translated text inserted inside mixed raw placeholders', () => {
    const batch = batchFrom(
      ` member_action_desc:0 "The [concept_power_bloc_leader] can use a [concept_bloc_member_action] to overthrow a [Concept('concept_power_bloc_member','$concept_power_bloc_member$')]'s government in favor of a [GetLawType('law_directorate').GetName]"`,
    )

    const result = validateTranslatedBatch(
      batch,
      ` member_action_desc:0 "[concept_power_bloc_leader]은(는) [concept_bloc_member_action]을(를) 사용하여 [Concept('concept_power_bloc_member','$concept_power_bloc_member의 정부를 전복하고 [GetLawType('law_directorate').GetName]을(를) 세울 수 있습니다.)]의 정부를 전복하고 [GetLawType('law_directorate').GetName]을(를) 세울 수 있습니다."`,
    )

    expect(result.ok).toBe(false)
    expect(result.errors.map((error) => error.code)).toContain('placeholder_missing')
    expect(result.errors.map((error) => error.code)).toContain('raw_placeholder_leaked')
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

  it('reports unchanged lore text inside protected style markers', () => {
    const batch = batchFrom(
      ' ideology_monopolist_leader_desc:0 "#lore This leader views free-market competition as chaotic and wasteful.#!"',
    )

    const result = validateTranslatedBatch(
      batch,
      ' ideology_monopolist_leader_desc:0 "<P0> This leader views free-market competition as chaotic and wasteful.<P1>"',
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

  it('accepts unchanged values when the source contains only protected placeholders', () => {
    const batch = batchFrom(
      [
        ` armed_forces_clout: "[GetInterestGroupVariant('ig_armed_forces',GetPlayer).GetNameWithCountryVariant] [concept_clout]"`,
        ` officers_radicals: "[GetPopType('officers').GetName] [Concept('concept_radical','$radicals_fraction$')]"`,
        ` officers_loyalists: "[GetPopType('officers').GetName] [Concept('concept_loyalist','$loyalists_fraction$')]"`,
      ].join('\n'),
    )

    const result = validateTranslatedBatch(
      batch,
      [
        ` armed_forces_clout: "<P0> <P1>"`,
        ` officers_radicals: "<P0> <P1>"`,
        ` officers_loyalists: "<P0> <P1>"`,
      ].join('\n'),
    )

    expect(result).toEqual({
      ok: true,
      errors: [],
    })
  })

  it('accepts unchanged values when the source contains only escaped newline markers', () => {
    const batch = batchFrom(' spacer:0 "\\n"')

    const result = validateTranslatedBatch(batch, ' spacer:0 "<P0>"')

    expect(result).toEqual({
      ok: true,
      errors: [],
    })
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
