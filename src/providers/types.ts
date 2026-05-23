import type { TranslationBatch } from '../core/createBatches'
import type { ParadoxLanguageCode } from '../core/paradoxLanguages'

export type ProviderId = 'ollama' | 'gemini' | 'vertex-gemini' | 'openai' | 'claude'

export type ProviderSettings = {
  provider: ProviderId
  endpoint: string
  apiKey: string
  projectId: string
  location: string
  model: string
  temperature: number
  topP: number
  repeatPenalty: number
  keepAlive: string
  sourceLanguage: ParadoxLanguageCode
  targetLanguage: ParadoxLanguageCode
}

export type ProviderCheckResult =
  | {
      ok: true
      label: string
      detail?: string
      models?: string[]
    }
  | {
      ok: false
      label: string
      error: string
    }

export type TranslationProvider = {
  id: ProviderId
  label: string
  defaultModel: string
  requiresApiKey: boolean
  translateBatch: (batch: TranslationBatch, settings: ProviderSettings) => Promise<string>
  checkConnection: (settings: ProviderSettings) => Promise<ProviderCheckResult>
}

export const PROVIDER_OPTIONS: Array<{
  id: ProviderId
  label: string
  defaultModel: string
}> = [
  { id: 'ollama', label: 'Local Ollama', defaultModel: 'gemma4:e4b' },
  { id: 'gemini', label: 'Google Gemini API', defaultModel: 'gemini-2.5-flash' },
  { id: 'vertex-gemini', label: 'Google Vertex AI Gemini', defaultModel: 'gemini-2.5-flash' },
  { id: 'openai', label: 'OpenAI GPT', defaultModel: 'gpt-5.1' },
  { id: 'claude', label: 'Anthropic Claude', defaultModel: 'claude-sonnet-4-5' },
]
