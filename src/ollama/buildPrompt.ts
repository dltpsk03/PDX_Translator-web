import type { TranslationBatch } from '../core/createBatches'
import {
  getParadoxLanguageName,
  type ParadoxLanguageCode,
} from '../core/paradoxLanguages'

export type BuildPromptOptions = {
  sourceLanguage?: ParadoxLanguageCode
  targetLanguage?: ParadoxLanguageCode
}

export function buildPrompt(
  batch: TranslationBatch,
  {
    sourceLanguage = 'l_english',
    targetLanguage = 'l_korean',
  }: BuildPromptOptions = {},
) {
  const sourceLanguageName = getParadoxLanguageName(sourceLanguage)
  const targetLanguageName = getParadoxLanguageName(targetLanguage)

  return [
    `You are translating Paradox Interactive localization lines from ${sourceLanguageName} into ${targetLanguageName}.`,
    '',
    'Rules:',
    `- Translate only the quoted text from ${sourceLanguageName} into ${targetLanguageName}.`,
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
