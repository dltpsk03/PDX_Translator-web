import { parseGlossary } from './parseGlossary'

describe('parseGlossary', () => {
  it('parses supported glossary separators and ignores comments', () => {
    expect(
      parseGlossary(
        ['# Victoria terms', 'Empire => 제국', 'War Support = 전쟁 지지도', 'Legitimacy\t정통성'].join(
          '\n',
        ),
      ),
    ).toEqual([
      { source: 'Empire', target: '제국' },
      { source: 'War Support', target: '전쟁 지지도' },
      { source: 'Legitimacy', target: '정통성' },
    ])
  })

  it('ignores blank lines and malformed entries', () => {
    expect(parseGlossary(['', 'Only source', ' => target', 'source => '].join('\n'))).toEqual([])
  })
})
