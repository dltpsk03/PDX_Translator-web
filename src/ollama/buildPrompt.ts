import type { TranslationBatch } from '../core/createBatches'

export function buildPrompt(batch: TranslationBatch) {
  return [
    'You are translating Paradox Interactive localization lines into Korean.',
    '',
    'Rules:',
    '- Translate only the quoted text into Korean.',
    '- Keep every localization key unchanged.',
    '- Keep version markers such as :0 unchanged.',
    '- Keep the exact same number of lines.',
    '- Keep the exact same line order.',
    '- Keep placeholders such as <P0>, <P1>, bracket placeholders, dollar placeholders, icon placeholders, #P ... #!, and #N ... #! unchanged.',
    '- Keep escaped newline markers \\n unchanged.',
    '- Do not use thinking, reasoning, or analysis output.',
    '- Do not add explanations.',
    '- Do not use markdown.',
    '- Return only translated localization lines.',
    '',
    'Localization lines:',
    batch.promptText,
  ].join('\n')
}
