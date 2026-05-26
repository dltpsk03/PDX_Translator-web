import { buildPrompt } from './buildPrompt'
import type { TranslationBatch } from '../core/createBatches'

function batch(promptText: string): TranslationBatch {
  return {
    batchIndex: 0,
    entries: [],
    promptText,
    charCount: promptText.length,
  }
}

describe('buildPrompt', () => {
  it('includes the protected localization batch lines', () => {
    const promptText = [
      ' my_event.1.t:0 "A Dangerous Proposal"',
      ' my_event.1.d:0 "<P0> has arrived\\nThe nobles are restless."',
    ].join('\n')

    const prompt = buildPrompt(batch(promptText))

    expect(prompt).toContain(promptText)
  })

  it('instructs the model to translate only quoted text into Korean by default', () => {
    const prompt = buildPrompt(batch(' key:0 "Value"'))

    expect(prompt).toContain('from English into Korean')
    expect(prompt).toContain('Translate only the quoted text from English into Korean.')
    expect(prompt).toContain(
      'If the quoted text itself contains quote characters, translated text inside those inner quotes too.',
    )
    expect(prompt).toContain(
      'Do not append, repeat, or preserve the original source sentence after the translation.',
    )
    expect(prompt).toContain('Keep every localization key unchanged.')
    expect(prompt).toContain('Keep version markers such as :0 unchanged.')
    expect(prompt).toContain(
      'Placeholder tokens are immutable. Keep every token such as <P0>, <P1>, and <P2> byte-for-byte unchanged.',
    )
    expect(prompt).toContain('Token handling examples:')
  })

  it('uses the selected source and target languages', () => {
    const prompt = buildPrompt(batch(' key:0 "Value"'), {
      sourceLanguage: 'l_french',
      targetLanguage: 'l_japanese',
    })

    expect(prompt).toContain('from French into Japanese')
    expect(prompt).toContain('Translate only the quoted text from French into Japanese.')
  })

  it('requires preserving line count and order', () => {
    const prompt = buildPrompt(batch(' first:0 "One"\n second:0 "Two"'))

    expect(prompt).toContain('Keep the exact same number of lines.')
    expect(prompt).toContain('Keep the exact same line order.')
  })

  it('includes glossary entries before localization lines', () => {
    const prompt = buildPrompt(batch(' key:0 "Empire"'), {
      glossaryEntries: [{ source: 'Empire', target: '제국' }],
    })

    expect(prompt).toContain('Glossary:')
    expect(prompt).toContain('- Empire => 제국')
    expect(prompt.indexOf('Glossary:')).toBeLessThan(prompt.indexOf('Localization lines:'))
  })

  it('includes custom instructions without replacing core rules', () => {
    const prompt = buildPrompt(batch(' key:0 "Value"'), {
      customInstructions: 'Use a formal historical tone.',
    })

    expect(prompt).toContain('Core rules:')
    expect(prompt).toContain('User style instructions:')
    expect(prompt).toContain('Use a formal historical tone.')
    expect(prompt.indexOf('Core rules:')).toBeLessThan(
      prompt.indexOf('User style instructions:'),
    )
  })

  it('requires preserving placeholders and escaped newline markers', () => {
    const prompt = buildPrompt(batch(' tooltip:0 "<P0> gains <P1>\\n#P Good #!"'))

    expect(prompt).toContain(
      'Placeholder tokens are immutable. Keep every token such as <P0>, <P1>, and <P2> byte-for-byte unchanged.',
    )
    expect(prompt).toContain(
      'Never write raw Paradox placeholders such as [Concept(...)], [ROOT.GetName], $COUNTRY$, £gold£, @money!, #P ... #!, or #v ... #! unless they already appear unprotected in the input line.',
    )
    expect(prompt).toContain('Keep escaped newline markers \\n unchanged.')
  })

  it('forbids reasoning, explanations, and markdown and asks for localization lines only', () => {
    const prompt = buildPrompt(batch(' key:0 "Value"'))

    expect(prompt).toContain('Do not use thinking, reasoning, or analysis output.')
    expect(prompt).toContain('Do not add explanations.')
    expect(prompt).toContain('Do not use markdown.')
    expect(prompt).toContain('Return only translated localization lines.')
  })

  it('adds retry correction instructions when provided', () => {
    const prompt = buildPrompt(batch(' key:0 "Value"'), {
      retryInstructions: ['Do not append the original source text after the translated text.'],
    })

    expect(prompt).toContain('Retry correction:')
    expect(prompt).toContain(
      '- Do not append the original source text after the translated text.',
    )
  })
})
