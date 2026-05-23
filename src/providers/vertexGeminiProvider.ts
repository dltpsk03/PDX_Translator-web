import { buildPrompt } from '../ollama/buildPrompt'
import type { TranslationProvider } from './types'

type VertexGeminiResponse = {
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

function extractVertexGeminiText(data: VertexGeminiResponse) {
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim()

  if (!text) {
    throw new Error(data.error?.message ?? 'Vertex AI response did not include translated text.')
  }

  return text
}

function createVertexUrl(settings: Parameters<TranslationProvider['translateBatch']>[1]) {
  const location = encodeURIComponent(settings.location.trim())
  const projectId = encodeURIComponent(settings.projectId.trim())
  const model = encodeURIComponent(settings.model.trim())

  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`
}

async function generateVertexGeminiContent(
  prompt: string,
  settings: Parameters<TranslationProvider['translateBatch']>[1],
) {
  const response = await fetch(createVertexUrl(settings), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: settings.temperature,
        topP: settings.topP,
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Vertex AI returned HTTP ${response.status}.`)
  }

  return extractVertexGeminiText((await response.json()) as VertexGeminiResponse)
}

export const vertexGeminiProvider: TranslationProvider = {
  id: 'vertex-gemini',
  label: 'Google Vertex AI Gemini',
  defaultModel: 'gemini-2.5-flash',
  requiresApiKey: true,
  async checkConnection(settings) {
    if (!settings.apiKey.trim()) {
      return { ok: false, label: 'Google Vertex AI Gemini', error: 'API key is required.' }
    }

    if (!settings.projectId.trim() || !settings.location.trim()) {
      return {
        ok: false,
        label: 'Google Vertex AI Gemini',
        error: 'Project ID and location are required.',
      }
    }

    try {
      await generateVertexGeminiContent('Return OK only.', {
        ...settings,
        temperature: 0,
      })

      return { ok: true, label: 'Google Vertex AI Gemini', detail: 'Test request completed.' }
    } catch (error) {
      return {
        ok: false,
        label: 'Google Vertex AI Gemini',
        error: error instanceof Error ? error.message : 'Unable to call Vertex AI.',
      }
    }
  },
  translateBatch(batch, settings) {
    return generateVertexGeminiContent(
      buildPrompt(batch, {
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
      }),
      settings,
    )
  },
}
