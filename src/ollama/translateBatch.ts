import type { TranslationBatch } from '../core/createBatches'
import type { ParadoxLanguageCode } from '../core/paradoxLanguages'
import type { GlossaryEntry } from '../prompt/parseGlossary'
import { buildPrompt } from './buildPrompt'
import { DEFAULT_OLLAMA_ENDPOINT } from './checkOllama'
import { normalizeLocalOllamaEndpoint } from './localEndpoint'

export const DEFAULT_TRANSLATION_MODEL = 'gemma4:e4b'

export type TranslateBatchOptions = {
  endpoint?: string
  model?: string
  keepAlive?: string
  temperature?: number
  topP?: number
  repeatPenalty?: number
  sourceLanguage?: ParadoxLanguageCode
  targetLanguage?: ParadoxLanguageCode
  customInstructions?: string
  glossaryEntries?: GlossaryEntry[]
  retryInstructions?: string[]
  signal?: AbortSignal
}

type OllamaGenerateResponse = {
  response?: string
  error?: string
}

export async function translateBatch(
  batch: TranslationBatch,
  {
    endpoint = DEFAULT_OLLAMA_ENDPOINT,
    model = DEFAULT_TRANSLATION_MODEL,
    keepAlive = '30m',
    temperature = 0.1,
    topP = 0.9,
    repeatPenalty = 1.05,
    sourceLanguage = 'l_english',
    targetLanguage = 'l_korean',
    customInstructions = '',
    glossaryEntries = [],
    retryInstructions = [],
    signal,
  }: TranslateBatchOptions = {},
) {
  const normalizedEndpoint = normalizeLocalOllamaEndpoint(endpoint)
  const response = await fetch(`${normalizedEndpoint}/api/generate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      model,
      prompt: buildPrompt(batch, {
        sourceLanguage,
        targetLanguage,
        customInstructions,
        glossaryEntries,
        retryInstructions,
      }),
      stream: false,
      think: false,
      keep_alive: keepAlive,
      options: {
        temperature,
        top_p: topP,
        repeat_penalty: repeatPenalty,
      },
    }),
  })

  if (!response.ok) {
    let message = `Ollama returned HTTP ${response.status}.`
    try {
      const data = (await response.json()) as OllamaGenerateResponse
      message = data.error ?? message
    } catch {
      // Keep HTTP status if Ollama did not return a JSON error body.
    }
    throw new Error(message)
  }

  const data = (await response.json()) as OllamaGenerateResponse

  if (typeof data.response !== 'string') {
    throw new Error('Ollama response did not include translated text.')
  }

  return data.response
}
