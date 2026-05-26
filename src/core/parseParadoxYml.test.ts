import { parseParadoxYml } from './parseParadoxYml'

describe('parseParadoxYml', () => {
  it('parses versioned localization lines as entries', () => {
    const [entry] = parseParadoxYml('  my_event.1.t:0 "A Dangerous Proposal"', {
      fileName: 'events.yml',
    })

    expect(entry).toMatchObject({
      type: 'entry',
      fileName: 'events.yml',
      lineIndex: 0,
      globalIndex: 0,
      rawLine: '  my_event.1.t:0 "A Dangerous Proposal"',
      indent: '  ',
      key: 'my_event.1.t',
      version: ':0',
      value: 'A Dangerous Proposal',
      prefix: '  my_event.1.t:0 "',
      suffix: '"',
    })
  })

  it('parses localization lines without numeric versions from the example file style', () => {
    const [entry] = parseParadoxYml(' je_arab_spring: "The Arab Spring"', {
      fileName: 'arab_spring_l_english.yml',
    })

    expect(entry).toMatchObject({
      type: 'entry',
      key: 'je_arab_spring',
      version: '',
      value: 'The Arab Spring',
      prefix: ' je_arab_spring: "',
      suffix: '"',
    })
  })

  it('preserves comments, blank lines, headers, and unknown lines as raw', () => {
    const parsed = parseParadoxYml(
      ['l_english:', '', ' # comment', 'not a localization line', ' key_without_quote: value'].join(
        '\n',
      ),
      { fileName: 'raw.yml' },
    )

    expect(parsed).toEqual([
      { type: 'raw', lineIndex: 0, rawLine: 'l_english:' },
      { type: 'raw', lineIndex: 1, rawLine: '' },
      { type: 'raw', lineIndex: 2, rawLine: ' # comment' },
      { type: 'raw', lineIndex: 3, rawLine: 'not a localization line' },
      { type: 'raw', lineIndex: 4, rawLine: ' key_without_quote: value' },
    ])
  })

  it('handles escaped quotes inside quoted values', () => {
    const [entry] = parseParadoxYml(' quote_test:0 "He said \\"Hello\\" today"', {
      fileName: 'quotes.yml',
    })

    expect(entry).toMatchObject({
      type: 'entry',
      key: 'quote_test',
      version: ':0',
      value: 'He said \\"Hello\\" today',
      suffix: '"',
    })
  })

  it('keeps unescaped inner quotes as part of the localization value', () => {
    const [entry] = parseParadoxYml(' boardroom_schism.5.f: ""For years, we claimed.""', {
      fileName: 'quotes.yml',
    })

    expect(entry).toMatchObject({
      type: 'entry',
      key: 'boardroom_schism.5.f',
      version: '',
      value: '"For years, we claimed."',
      suffix: '"',
    })
  })

  it('keeps trailing text after the closing quote in the suffix', () => {
    const [entry] = parseParadoxYml(' key:0 "Value" # translator note', {
      fileName: 'suffix.yml',
    })

    expect(entry).toMatchObject({
      type: 'entry',
      value: 'Value',
      suffix: '" # translator note',
    })
  })

  it('increments globalIndex only for entries and supports an offset', () => {
    const parsed = parseParadoxYml(['# comment', ' first:0 "One"', ' second:0 "Two"'].join('\n'), {
      fileName: 'global.yml',
      globalIndexStart: 10,
    })

    expect(parsed[0]).toMatchObject({ type: 'raw', lineIndex: 0 })
    expect(parsed[1]).toMatchObject({ type: 'entry', globalIndex: 10, lineIndex: 1 })
    expect(parsed[2]).toMatchObject({ type: 'entry', globalIndex: 11, lineIndex: 2 })
  })

  it('normalizes CRLF input while preserving line order', () => {
    const parsed = parseParadoxYml('l_english:\r\n key:0 "Value"\r\n', {
      fileName: 'crlf.yml',
    })

    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toMatchObject({ type: 'raw', rawLine: 'l_english:' })
    expect(parsed[1]).toMatchObject({ type: 'entry', key: 'key' })
    expect(parsed[2]).toMatchObject({ type: 'raw', rawLine: '' })
  })
})
