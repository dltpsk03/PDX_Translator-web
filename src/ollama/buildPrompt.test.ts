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

  it('instructs the model to translate only quoted text into Korean', () => {
    const prompt = buildPrompt(batch(' key:0 "Value"'))

    expect(prompt).toContain('Translate only the quoted text into Korean.')
    expect(prompt).toContain('Keep every localization key unchanged.')
    expect(prompt).toContain('Keep version markers such as :0 unchanged.')
  })

  it('requires preserving line count and order', () => {
    const prompt = buildPrompt(batch(' first:0 "One"\n second:0 "Two"'))

    expect(prompt).toContain('Keep the exact same number of lines.')
    expect(prompt).toContain('Keep the exact same line order.')
  })

  it('requires preserving placeholders and escaped newline markers', () => {
    const prompt = buildPrompt(batch(' tooltip:0 "<P0> gains <P1>\\n#P Good #!"'))

    expect(prompt).toContain(
      'Keep placeholders such as <P0>, <P1>, [...], $...$, £...£, #P ... #!, and #N ... #! unchanged.',
    )
    expect(prompt).toContain('Keep escaped newline markers \\n unchanged.')
  })

  it('forbids explanations and markdown and asks for localization lines only', () => {
    const prompt = buildPrompt(batch(' key:0 "Value"'))

    expect(prompt).toContain('Do not add explanations.')
    expect(prompt).toContain('Do not use markdown.')
    expect(prompt).toContain('Return only translated localization lines.')
  })
})
