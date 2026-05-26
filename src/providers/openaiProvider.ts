import { buildPrompt } from '../ollama/buildPrompt'
import type { TranslationProvider } from './types'

type OpenAIResponse = {
  output_text?: string
  output?: Array<{
    content?: Array<{
      text?: string
      type?: string
    }>
  }>
  error?: {
    message?: string
  }
}

function extractOpenAIText(data: OpenAIResponse) {
  if (data.output_text?.trim()) {
    return data.output_text.trim()
  }

  const text = data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? '')
    .join('')
    .trim()

  if (!text) {
    throw new Error(data.error?.message ?? 'OpenAI response did not include translated text.')
  }

  return text
}

async function readOpenAIError(response: Response) {
  try {
    const data = (await response.json()) as OpenAIResponse
    return data.error?.message ?? `OpenAI returned HTTP ${response.status}.`
  } catch {
    return `OpenAI returned HTTP ${response.status}.`
  }
}

async function createOpenAIResponse(
  prompt: string,
  settings: Parameters<TranslationProvider['translateBatch']>[1],
  signal?: AbortSignal,
) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      input: prompt,
      temperature: settings.temperature,
      top_p: settings.topP,
    }),
  })

  if (!response.ok) {
    throw new Error(await readOpenAIError(response))
  }

  return extractOpenAIText((await response.json()) as OpenAIResponse)
}

export const openaiProvider: TranslationProvider = {
  id: 'openai',
  label: 'OpenAI GPT',
  defaultModel: 'gpt-5.4',
  requiresApiKey: true,
  async checkConnection(settings) {
    if (!settings.apiKey.trim()) {
      return { ok: false, label: 'OpenAI GPT', error: 'API key is required.' }
    }

    try {
      await createOpenAIResponse('Return OK only.', {
        ...settings,
        temperature: 0,
      })

      return { ok: true, label: 'OpenAI GPT', detail: 'Test request completed.' }
    } catch (error) {
      return {
        ok: false,
        label: 'OpenAI GPT',
        error: error instanceof Error ? error.message : 'Unable to call OpenAI API.',
      }
    }
  },
  translateBatch(batch, settings, signal, retryInstructions) {
    return createOpenAIResponse(
      buildPrompt(batch, {
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        customInstructions: settings.customInstructions,
        glossaryEntries: settings.glossaryEntries,
        retryInstructions,
      }),
      settings,
      signal,
    )
  },
}
