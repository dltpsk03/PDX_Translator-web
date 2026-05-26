import { buildPrompt } from '../ollama/buildPrompt'
import type { TranslationProvider } from './types'

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  error?: {
    message?: string
  }
}

function extractGeminiText(data: GeminiResponse) {
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim()

  if (!text) {
    throw new Error(data.error?.message ?? 'Gemini response did not include translated text.')
  }

  return text
}

async function readGeminiError(response: Response) {
  try {
    const data = (await response.json()) as GeminiResponse
    return data.error?.message ?? `Gemini returned HTTP ${response.status}.`
  } catch {
    return `Gemini returned HTTP ${response.status}.`
  }
}

export const geminiProvider: TranslationProvider = {
  id: 'gemini',
  label: 'Google Gemini API',
  defaultModel: 'gemini-3.1-flash-lite',
  requiresApiKey: true,
  async checkConnection(settings) {
    if (!settings.apiKey.trim()) {
      return { ok: false, label: 'Google Gemini API', error: 'API key is required.' }
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          settings.model,
        )}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': settings.apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Return OK only.' }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 8,
            },
          }),
        },
      )

      if (!response.ok) {
        return {
          ok: false,
          label: 'Google Gemini API',
          error: await readGeminiError(response),
        }
      }

      return { ok: true, label: 'Google Gemini API', detail: 'Test request completed.' }
    } catch (error) {
      return {
        ok: false,
        label: 'Google Gemini API',
        error: error instanceof Error ? error.message : 'Unable to call Gemini API.',
      }
    }
  },
  async translateBatch(batch, settings, signal, retryInstructions) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        settings.model,
      )}:generateContent`,
      {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': settings.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: buildPrompt(batch, {
                    sourceLanguage: settings.sourceLanguage,
                    targetLanguage: settings.targetLanguage,
                    customInstructions: settings.customInstructions,
                    glossaryEntries: settings.glossaryEntries,
                    retryInstructions,
                  }),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: settings.temperature,
            topP: settings.topP,
            responseMimeType: 'text/plain',
          },
        }),
      },
    )

    if (!response.ok) {
      throw new Error(await readGeminiError(response))
    }

    return extractGeminiText((await response.json()) as GeminiResponse)
  },
}
