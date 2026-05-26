import { normalizeLocalOllamaEndpoint } from './localEndpoint'

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434'

export type OllamaModel = {
  name: string
  modifiedAt?: string
  size?: number
}

export type OllamaConnectionResult =
  | {
      ok: true
      endpoint: string
      models: OllamaModel[]
    }
  | {
      ok: false
      endpoint: string
      error: string
    }

type OllamaTagsResponse = {
  models?: Array<{
    name?: string
    model?: string
    modified_at?: string
    size?: number
  }>
  error?: string
}

export async function checkOllama(
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
): Promise<OllamaConnectionResult> {
  let normalizedEndpoint: string

  try {
    normalizedEndpoint = normalizeLocalOllamaEndpoint(endpoint)
  } catch (error) {
    return {
      ok: false,
      endpoint,
      error: error instanceof Error ? error.message : 'Invalid Ollama endpoint.',
    }
  }

  try {
    const response = await fetch(`${normalizedEndpoint}/api/tags`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      let message = `Ollama returned HTTP ${response.status}.`
      try {
        const data = (await response.json()) as OllamaTagsResponse
        message = data.error ?? message
      } catch {
        // Keep HTTP status if Ollama did not return JSON.
      }

      return {
        ok: false,
        endpoint: normalizedEndpoint,
        error: message,
      }
    }

    const data = (await response.json()) as OllamaTagsResponse
    const models =
      data.models?.flatMap((model) => {
        const name = model.name ?? model.model

        return name
          ? [
              {
                name,
                modifiedAt: model.modified_at,
                size: model.size,
              },
            ]
          : []
      }) ?? []

    return {
      ok: true,
      endpoint: normalizedEndpoint,
      models,
    }
  } catch (error) {
    return {
      ok: false,
      endpoint: normalizedEndpoint,
      error: error instanceof Error ? error.message : 'Unable to connect to Ollama.',
    }
  }
}
