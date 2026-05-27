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

  it('protects Concept placeholders that contain bracket references', () => {
    const source =
      "inspect [Concept('concept_country','[SCOPE.sCountry(\"target\").GetName]')] before translating."

    const result = protectPlaceholders(source)

    expect(result).toEqual({
      text: 'inspect <P0> before translating.',
      placeholders: [
        {
          token: '<P0>',
          value: "[Concept('concept_country','[SCOPE.sCountry(\"target\").GetName]')]",
        },
      ],
    })
  })

  it('protects nested bracket placeholders as a single placeholder', () => {
    const source =
      "[SelectLocalization(EqualTo_string('x', '[This.GetName]'), 'yes_key', 'no_key')] follows."

    const result = protectPlaceholders(source)

    expect(result).toEqual({
      text: '<P0> follows.',
      placeholders: [
        {
          token: '<P0>',
          value:
            "[SelectLocalization(EqualTo_string('x', '[This.GetName]'), 'yes_key', 'no_key')]",
        },
      ],
    })
  })

  it('protects all bracket command placeholders without depending on command names', () => {
    const source =
      "[concept_power_bloc_leader] uses [GetLawType('law_directorate').GetName] through [SomeCommand('a', '[Nested.Command]')]."

    const result = protectPlaceholders(source)

    expect(result).toEqual({
      text: '<P0> uses <P1> through <P2>.',
      placeholders: [
        { token: '<P0>', value: '[concept_power_bloc_leader]' },
        { token: '<P1>', value: "[GetLawType('law_directorate').GetName]" },
        { token: '<P2>', value: "[SomeCommand('a', '[Nested.Command]')]" },
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

  it('protects style markers without hiding text inside them', () => {
    const result = protectPlaceholders('#P positive text #! and #N negative text #!')

    expect(result.text).toBe('<P0> positive text <P1> and <P2> negative text <P3>')
    expect(result.placeholders).toEqual([
      { token: '<P0>', value: '#P' },
      { token: '<P1>', value: '#!' },
      { token: '<P2>', value: '#N' },
      { token: '<P3>', value: '#!' },
    ])
  })

  it('protects general Paradox style blocks and at-sign icons', () => {
    const result = protectPlaceholders('#v highlighted value #! costs @money!')

    expect(result.text).toBe('<P0> highlighted value <P1> costs <P2>')
    expect(result.placeholders).toEqual([
      { token: '<P0>', value: '#v' },
      { token: '<P1>', value: '#!' },
      { token: '<P2>', value: '@money!' },
    ])
  })

  it('leaves lore text translatable while protecting lore markers', () => {
    const source = '#lore This leader views free-market competition as chaotic.#!'

    const result = protectPlaceholders(source)

    expect(result.text).toBe('<P0> This leader views free-market competition as chaotic.<P1>')
    expect(result.placeholders).toEqual([
      { token: '<P0>', value: '#lore' },
      { token: '<P1>', value: '#!' },
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

    expect(result.text).toBe('<P0> spends <P1><P2><P3> Good <P4> for <P5> and <P6> Bad <P7>')
    expect(result.placeholders).toEqual([
      { token: '<P0>', value: '[This.GetName]' },
      { token: '<P1>', value: '£gold£' },
      { token: '<P2>', value: '\\n' },
      { token: '<P3>', value: '#P' },
      { token: '<P4>', value: '#!' },
      { token: '<P5>', value: '$COUNTRY_NAME$' },
      { token: '<P6>', value: '#N' },
      { token: '<P7>', value: '#!' },
    ])
  })

  it('restores protected placeholders exactly after translation', () => {
    const source = '[ROOT.GetCountry.GetName] has arrived.\\n#N This is dangerous #!'
    const protectedText = protectPlaceholders(source)
    const translated = '도착했습니다: <P0><P1><P2> 위험합니다 <P3>'

    expect(restorePlaceholders(translated, protectedText.placeholders)).toBe(
      '도착했습니다: [ROOT.GetCountry.GetName]\\n#N 위험합니다 #!',
    )
  })

  it('restores placeholders containing JavaScript replacement markers literally', () => {
    const source = "[Concept('concept_country','$concept_countries$')]"
    const protectedText = protectPlaceholders(source)

    expect(restorePlaceholders('<P0>을 기업 자회사로 취급합니다.', protectedText.placeholders)).toBe(
      "[Concept('concept_country','$concept_countries$')]을 기업 자회사로 취급합니다.",
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
