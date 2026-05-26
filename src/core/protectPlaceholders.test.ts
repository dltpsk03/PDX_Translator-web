import { protectPlaceholders } from './protectPlaceholders'
import { restorePlaceholders } from './restorePlaceholders'

describe('protectPlaceholders', () => {
  it('protects bracket placeholders', () => {
    const result = protectPlaceholders('[ROOT.GetCountry.GetName] has arrived.')

    expect(result).toEqual({
      text: '<P0> has arrived.',
      placeholders: [{ token: '<P0>', value: '[ROOT.GetCountry.GetName]' }],
    })
  })

  it('protects bracket placeholders that contain dollar placeholders', () => {
    const source =
      "sovereign [Concept('concept_country','$concept_countries$')] as corporate subsidiaries."

    const result = protectPlaceholders(source)

    expect(result).toEqual({
      text: 'sovereign <P0> as corporate subsidiaries.',
      placeholders: [
        { token: '<P0>', value: "[Concept('concept_country','$concept_countries$')]" },
      ],
    })
  })

  it('protects dollar placeholders', () => {
    const result = protectPlaceholders('$COUNTRY_NAME$ declared war on $TARGET$')

    expect(result.text).toBe('<P0> declared war on <P1>')
    expect(result.placeholders).toEqual([
      { token: '<P0>', value: '$COUNTRY_NAME$' },
      { token: '<P1>', value: '$TARGET$' },
    ])
  })

  it('protects pound icon placeholders', () => {
    const result = protectPlaceholders('Gain £gold£ and spend £authority£')

    expect(result.text).toBe('Gain <P0> and spend <P1>')
    expect(result.placeholders).toEqual([
      { token: '<P0>', value: '£gold£' },
      { token: '<P1>', value: '£authority£' },
    ])
  })

  it('protects positive and negative formatting blocks', () => {
    const result = protectPlaceholders('#P positive text #! and #N negative text #!')

    expect(result.text).toBe('<P0> and <P1>')
    expect(result.placeholders).toEqual([
      { token: '<P0>', value: '#P positive text #!' },
      { token: '<P1>', value: '#N negative text #!' },
    ])
  })

  it('protects escaped newline markers', () => {
    const result = protectPlaceholders('First line\\nSecond line')

    expect(result).toEqual({
      text: 'First line<P0>Second line',
      placeholders: [{ token: '<P0>', value: '\\n' }],
    })
  })

  it('protects multiple placeholder types in source order', () => {
    const source =
      '[This.GetName] spends £gold£\\n#P Good #! for $COUNTRY_NAME$ and #N Bad #!'

    const result = protectPlaceholders(source)

    expect(result.text).toBe('<P0> spends <P1><P2><P3> for <P4> and <P5>')
    expect(result.placeholders).toEqual([
      { token: '<P0>', value: '[This.GetName]' },
      { token: '<P1>', value: '£gold£' },
      { token: '<P2>', value: '\\n' },
      { token: '<P3>', value: '#P Good #!' },
      { token: '<P4>', value: '$COUNTRY_NAME$' },
      { token: '<P5>', value: '#N Bad #!' },
    ])
  })

  it('restores protected placeholders exactly after translation', () => {
    const source = '[ROOT.GetCountry.GetName] has arrived.\\n#N This is dangerous #!'
    const protectedText = protectPlaceholders(source)
    const translated = '도착했습니다: <P0><P1><P2>'

    expect(restorePlaceholders(translated, protectedText.placeholders)).toBe(
      '도착했습니다: [ROOT.GetCountry.GetName]\\n#N This is dangerous #!',
    )
  })

  it('does not alter text when no placeholders are present', () => {
    const result = protectPlaceholders('Plain localization text.')

    expect(result).toEqual({
      text: 'Plain localization text.',
      placeholders: [],
    })
    expect(restorePlaceholders(result.text, result.placeholders)).toBe('Plain localization text.')
  })
})
