import type { TranslationBatch } from '../core/createBatches'
import {
  getParadoxLanguageName,
  type ParadoxLanguageCode,
} from '../core/paradoxLanguages'
import type { GlossaryEntry } from '../prompt/parseGlossary'

export type BuildPromptOptions = {
  sourceLanguage?: ParadoxLanguageCode
  targetLanguage?: ParadoxLanguageCode
  customInstructions?: string
  glossaryEntries?: GlossaryEntry[]
  retryInstructions?: string[]
}

export function buildPrompt(
  batch: TranslationBatch,
  {
    sourceLanguage = 'l_english',
    targetLanguage = 'l_korean',
    customInstructions = '',
    glossaryEntries = [],
    retryInstructions = [],
  }: BuildPromptOptions = {},
) {
  const sourceLanguageName = getParadoxLanguageName(sourceLanguage)
  const targetLanguageName = getParadoxLanguageName(targetLanguage)
  const trimmedCustomInstructions = customInstructions.trim()
  const promptSections = [
    `You are translating Paradox Interactive localization lines from ${sourceLanguageName} into ${targetLanguageName}.`,
    '',
    'Core rules:',
    `- Translate only the quoted text from ${sourceLanguageName} into ${targetLanguageName}.`,
    '- If the quoted text itself contains quote characters, translated text inside those inner quotes too.',
    '- Do not append, repeat, or preserve the original source sentence after the translation.',
    '- Keep every localization key unchanged.',
    '- Keep version markers such as :0 unchanged.',
    '- Keep the exact same number of lines.',
    '- Keep the exact same line order.',
    '- Placeholder tokens are immutable. Keep every token such as <P0>, <P1>, and <P2> byte-for-byte unchanged.',
    '- Never expand, translate, repair, reinterpret, or move text inside a placeholder token.',
    '- Never write raw Paradox placeholders such as [Concept(...)], [ROOT.GetName], $COUNTRY$, £gold£, @money!, #P ... #!, or #v ... #! unless they already appear unprotected in the input line.',
    '- A placeholder token may appear inside a translated Korean sentence, but the token characters themselves must be identical.',
    '- Keep escaped newline markers \\n unchanged.',
    '- Do not use thinking, reasoning, or analysis output.',
    '- Do not add explanations.',
    '- Do not use markdown.',
    '- Return only translated localization lines.',
    '',
    'Token handling examples:',
    'Input:  example_key:0 "Source sentence with <P0> and <P1>."',
    'Output: example_key:0 "Translated sentence with <P0> and <P1>."',
    'Input:  example_tooltip:0 "<P0> gains <P1> after the event."',
    'Output: example_tooltip:0 "<P0> gains translated words with <P1>."',
    'Bad:    example_key:0 "Translated sentence with [Concept(...)] or $COUNTRY$ instead of <P0>."',
  ]

  if (glossaryEntries.length > 0) {
    promptSections.push(
      '',
      'Glossary:',
      'Apply these translations when the source term appears in quoted text, unless doing so would conflict with the core rules.',
      'Do not alter placeholders, keys, version markers, or line structure to satisfy glossary terms.',
      ...glossaryEntries.map((entry) => `- ${entry.source} => ${entry.target}`),
    )
  }

  if (trimmedCustomInstructions) {
    promptSections.push(
      '',
      'User style instructions:',
      'Apply these instructions only if they do not conflict with the core rules.',
      trimmedCustomInstructions,
    )
  }

  if (retryInstructions.length > 0) {
    promptSections.push(
      '',
      'Retry correction:',
      'The previous output failed validation. Fix these issues in the new output:',
      ...retryInstructions.map((instruction) => `- ${instruction}`),
    )
  }

  promptSections.push(
    '',
    'Localization lines:',
    batch.promptText,
  )

  return promptSections.join('\n')
}
