import { parseGlossary, parseGlossaryWithDiagnostics } from './parseGlossary'

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

  it('reports malformed and duplicate glossary lines', () => {
    expect(
      parseGlossaryWithDiagnostics(
        ['Empire => 제국', 'Only source', 'Empire = 제국2'].join('\n'),
      ),
    ).toEqual({
      entries: [
        { source: 'Empire', target: '제국' },
        { source: 'Empire', target: '제국2' },
      ],
      invalidLines: [{ lineNumber: 2, text: 'Only source' }],
      duplicateSources: ['Empire'],
    })
  })
})
