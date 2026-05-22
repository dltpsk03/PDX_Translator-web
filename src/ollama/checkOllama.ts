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
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/\/+$/, '')
}

export async function checkOllama(
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
): Promise<OllamaConnectionResult> {
  const normalizedEndpoint = normalizeEndpoint(endpoint)

  try {
    const response = await fetch(`${normalizedEndpoint}/api/tags`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return {
        ok: false,
        endpoint: normalizedEndpoint,
        error: `Ollama returned HTTP ${response.status}.`,
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
