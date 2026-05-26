import { createBatches } from './createBatches'
import type { LocalizationEntry } from '../types/paradox'

function entry(overrides: Partial<LocalizationEntry>): LocalizationEntry {
  const key = overrides.key ?? `key_${overrides.globalIndex ?? 0}`
  const version = overrides.version ?? ':0'
  const value = overrides.value ?? 'Value'
  const indent = overrides.indent ?? ' '

  return {
    type: 'entry',
    fileName: 'test.yml',
    lineIndex: overrides.lineIndex ?? 0,
    globalIndex: overrides.globalIndex ?? 0,
    rawLine: overrides.rawLine ?? `${indent}${key}${version} "${value}"`,
    indent,
    key,
    version,
    value,
    prefix: overrides.prefix ?? `${indent}${key}${version} "`,
    suffix: overrides.suffix ?? '"',
  }
}

describe('createBatches', () => {
  it('splits entries by maxLines', () => {
    const entries = Array.from({ length: 5 }, (_, index) =>
      entry({ key: `key_${index}`, globalIndex: index, lineIndex: index }),
    )

    const batches = createBatches(entries, { maxLines: 2, maxChars: 1000 })

    expect(batches).toHaveLength(3)
    expect(batches.map((batch) => batch.entries.length)).toEqual([2, 2, 1])
    expect(batches.map((batch) => batch.batchIndex)).toEqual([0, 1, 2])
  })

  it('splits entries by maxChars while preserving whole entries', () => {
    const entries = [
      entry({ key: 'first', value: '12345', globalIndex: 0, lineIndex: 3 }),
      entry({ key: 'second', value: '12345', globalIndex: 1, lineIndex: 4 }),
      entry({ key: 'third', value: '12345', globalIndex: 2, lineIndex: 5 }),
    ]

    const batches = createBatches(entries, { maxLines: 100, maxChars: 25 })

    expect(batches).toHaveLength(3)
    expect(batches[0].promptText).toBe(' first:0 "12345"')
    expect(batches[1].promptText).toBe(' second:0 "12345"')
    expect(batches[2].promptText).toBe(' third:0 "12345"')
  })

  it('keeps globalIndex and lineIndex on each batch entry', () => {
    const batches = createBatches(
      [entry({ key: 'event_title', globalIndex: 42, lineIndex: 9, value: 'Title' })],
      { maxLines: 80, maxChars: 1000 },
    )

    expect(batches[0].entries[0]).toMatchObject({
      globalIndex: 42,
      lineIndex: 9,
      entry: {
        globalIndex: 42,
        lineIndex: 9,
      },
    })
  })

  it('sends localization lines instead of isolated values', () => {
    const batches = createBatches(
      [
        entry({
          key: 'my_event.1.t',
          version: ':0',
          value: 'A Dangerous Proposal',
          globalIndex: 0,
          lineIndex: 1,
        }),
      ],
      { maxLines: 80, maxChars: 1000 },
    )

    expect(batches[0].promptText).toBe(' my_event.1.t:0 "A Dangerous Proposal"')
  })

  it('protects placeholders inside prompt lines', () => {
    const batches = createBatches(
      [
        entry({
          key: 'tooltip',
          value: '[ROOT.GetCountry.GetName] gains £gold£\\n#P Good #!',
          globalIndex: 0,
          lineIndex: 1,
        }),
      ],
      { maxLines: 80, maxChars: 1000 },
    )

    expect(batches[0].promptText).toBe(' tooltip:0 "<P0> gains <P1><P2><P3> Good <P4>"')
    expect(batches[0].entries[0].protectedValue).toBe('<P0> gains <P1><P2><P3> Good <P4>')
    expect(batches[0].entries[0].placeholders).toEqual([
      { token: '<P0>', value: '[ROOT.GetCountry.GetName]' },
      { token: '<P1>', value: '£gold£' },
      { token: '<P2>', value: '\\n' },
      { token: '<P3>', value: '#P' },
      { token: '<P4>', value: '#!' },
    ])
  })

  it('protects Concept placeholders before sending prompt lines', () => {
    const batches = createBatches(
      [
        entry({
          key: 'identity_desc',
          value:
            "This Identity values industrial and economic consolidation among its Bloc Members, treating sovereign [Concept('concept_country','$concept_countries$')] as corporate subsidiaries.",
          globalIndex: 0,
          lineIndex: 1,
        }),
      ],
      { maxLines: 80, maxChars: 1000 },
    )

    expect(batches[0].promptText).toBe(
      ' identity_desc:0 "This Identity values industrial and economic consolidation among its Bloc Members, treating sovereign <P0> as corporate subsidiaries."',
    )
    expect(batches[0].entries[0].placeholders).toEqual([
      { token: '<P0>', value: "[Concept('concept_country','$concept_countries$')]" },
    ])
  })

  it('protects mixed bracket and Concept placeholders before sending prompt lines', () => {
    const batches = createBatches(
      [
        entry({
          key: 'member_action_desc',
          value:
            "The [concept_power_bloc_leader] can use a [concept_bloc_member_action] to overthrow a [Concept('concept_power_bloc_member','$concept_power_bloc_member$')]'s government in favor of a [GetLawType('law_directorate').GetName]",
          globalIndex: 0,
          lineIndex: 1,
        }),
      ],
      { maxLines: 80, maxChars: 1000 },
    )

    expect(batches[0].promptText).toBe(
      ` member_action_desc:0 "The <P0> can use a <P1> to overthrow a <P2>'s government in favor of a <P3>"`,
    )
    expect(batches[0].entries[0].placeholders).toEqual([
      { token: '<P0>', value: '[concept_power_bloc_leader]' },
      { token: '<P1>', value: '[concept_bloc_member_action]' },
      {
        token: '<P2>',
        value: "[Concept('concept_power_bloc_member','$concept_power_bloc_member$')]",
      },
      { token: '<P3>', value: "[GetLawType('law_directorate').GetName]" },
    ])
  })

  it('supports lines without numeric version while preserving key structure', () => {
    const batches = createBatches(
      [
        entry({
          key: 'je_arab_spring',
          version: '',
          value: 'The Arab Spring',
          prefix: ' je_arab_spring: "',
          rawLine: ' je_arab_spring: "The Arab Spring"',
        }),
      ],
      { maxLines: 80, maxChars: 1000 },
    )

    expect(batches[0].promptText).toBe(' je_arab_spring: "The Arab Spring"')
  })

  it('throws for invalid limits', () => {
    expect(() => createBatches([], { maxLines: 0, maxChars: 100 })).toThrow(
      'maxLines must be a positive integer.',
    )
    expect(() => createBatches([], { maxLines: 80, maxChars: 0 })).toThrow(
      'maxChars must be a positive integer.',
    )
  })
})
