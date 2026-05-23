import type { TranslationBatch } from '../core/createBatches'
import type { ParadoxLanguageCode } from '../core/paradoxLanguages'
import { buildPrompt } from './buildPrompt'
import { DEFAULT_OLLAMA_ENDPOINT } from './checkOllama'

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
}

type OllamaGenerateResponse = {
  response?: string
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/\/+$/, '')
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
  }: TranslateBatchOptions = {},
) {
  const normalizedEndpoint = normalizeEndpoint(endpoint)
  const response = await fetch(`${normalizedEndpoint}/api/generate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: buildPrompt(batch, { sourceLanguage, targetLanguage }),
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
    throw new Error(`Ollama returned HTTP ${response.status}.`)
  }

  const data = (await response.json()) as OllamaGenerateResponse

  if (typeof data.response !== 'string') {
    throw new Error('Ollama response did not include translated text.')
  }

  return data.response
}
