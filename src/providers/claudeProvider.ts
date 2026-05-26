import { buildPrompt } from '../ollama/buildPrompt'
import type { TranslationProvider } from './types'

type ClaudeResponse = {
  content?: Array<{
    type?: string
    text?: string
  }>
  error?: {
    message?: string
  }
}

type ClaudeModelResponse = {
  id?: string
  error?: {
    message?: string
  }
}

function extractClaudeText(data: ClaudeResponse) {
  const text = data.content
    ?.map((content) => content.text ?? '')
    .join('')
    .trim()

  if (!text) {
    throw new Error(data.error?.message ?? 'Claude response did not include translated text.')
  }

  return text
}

async function readClaudeError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as ClaudeResponse | ClaudeModelResponse
    return data.error?.message ?? fallback
  } catch {
    return fallback
  }
}

async function createClaudeMessage(
  prompt: string,
  settings: Parameters<TranslationProvider['translateBatch']>[1],
  signal?: AbortSignal,
) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-api-key': settings.apiKey,
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 8192,
      temperature: settings.temperature,
      top_p: settings.topP,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(await readClaudeError(response, `Claude returned HTTP ${response.status}.`))
  }

  return extractClaudeText((await response.json()) as ClaudeResponse)
}

async function checkClaudeModel(settings: Parameters<TranslationProvider['checkConnection']>[0]) {
  const response = await fetch(
    `https://api.anthropic.com/v1/models/${encodeURIComponent(settings.model)}`,
    {
      method: 'GET',
      headers: {
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'x-api-key': settings.apiKey,
      },
    },
  )

  if (!response.ok) {
    throw new Error(await readClaudeError(response, `Claude returned HTTP ${response.status}.`))
  }

  return (await response.json()) as ClaudeModelResponse
}

export const claudeProvider: TranslationProvider = {
  id: 'claude',
  label: 'Anthropic Claude',
  defaultModel: 'claude-sonnet-4-6',
  requiresApiKey: true,
  async checkConnection(settings) {
    if (!settings.apiKey.trim()) {
      return { ok: false, label: 'Anthropic Claude', error: 'API key is required.' }
    }

    try {
      const model = await checkClaudeModel(settings)

      return {
        ok: true,
        label: 'Anthropic Claude',
        detail: `Model available: ${model.id ?? settings.model}`,
        models: [model.id ?? settings.model],
      }
    } catch (error) {
      return {
        ok: false,
        label: 'Anthropic Claude',
        error: error instanceof Error ? error.message : 'Unable to call Claude API.',
      }
    }
  },
  translateBatch(batch, settings, signal, retryInstructions) {
    return createClaudeMessage(
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
