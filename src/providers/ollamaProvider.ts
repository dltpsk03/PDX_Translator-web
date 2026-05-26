import { checkOllama } from '../ollama/checkOllama'
import { translateBatch as translateOllamaBatch } from '../ollama/translateBatch'
import type { TranslationProvider } from './types'

export const ollamaProvider: TranslationProvider = {
  id: 'ollama',
  label: 'Local Ollama',
  defaultModel: 'gemma4:e4b',
  requiresApiKey: false,
  async checkConnection(settings) {
    const result = await checkOllama(settings.endpoint)

    if (!result.ok) {
      return {
        ok: false,
        label: 'Local Ollama',
        error: result.error,
      }
    }

    return {
      ok: true,
      label: 'Local Ollama',
      detail: `${result.models.length} installed model(s) found.`,
      models: result.models.map((model) => model.name),
    }
  },
  translateBatch(batch, settings, signal, retryInstructions) {
    return translateOllamaBatch(batch, {
      endpoint: settings.endpoint,
      model: settings.model,
      keepAlive: settings.keepAlive,
      temperature: settings.temperature,
      topP: settings.topP,
      repeatPenalty: settings.repeatPenalty,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      customInstructions: settings.customInstructions,
      glossaryEntries: settings.glossaryEntries,
      retryInstructions,
      signal,
    })
  },
}
