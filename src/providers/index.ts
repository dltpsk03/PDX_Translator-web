import { claudeProvider } from './claudeProvider'
import { geminiProvider } from './geminiProvider'
import { ollamaProvider } from './ollamaProvider'
import { openaiProvider } from './openaiProvider'
import { vertexGeminiProvider } from './vertexGeminiProvider'
import type { ProviderId, TranslationProvider } from './types'

export { PROVIDER_OPTIONS, type ProviderId, type ProviderSettings } from './types'

export const translationProviders: Record<ProviderId, TranslationProvider> = {
  ollama: ollamaProvider,
  gemini: geminiProvider,
  'vertex-gemini': vertexGeminiProvider,
  openai: openaiProvider,
  claude: claudeProvider,
}

export function getTranslationProvider(providerId: ProviderId) {
  return translationProviders[providerId]
}
