import { normalizeLocalOllamaEndpoint } from './localEndpoint'

describe('normalizeLocalOllamaEndpoint', () => {
  it('accepts local HTTP Ollama endpoints', () => {
    expect(normalizeLocalOllamaEndpoint('http://localhost:11434/')).toBe('http://localhost:11434')
    expect(normalizeLocalOllamaEndpoint('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434')
    expect(normalizeLocalOllamaEndpoint('http://[::1]:11434/')).toBe('http://[::1]:11434')
  })

  it('rejects remote, credentialed, and non-HTTP endpoints', () => {
    expect(() => normalizeLocalOllamaEndpoint('https://localhost:11434')).toThrow(
      'Ollama endpoint must use http://.',
    )
    expect(() => normalizeLocalOllamaEndpoint('http://example.com:11434')).toThrow(
      'Ollama endpoint must be localhost, 127.0.0.1, or [::1].',
    )
    expect(() => normalizeLocalOllamaEndpoint('http://user:pass@localhost:11434')).toThrow(
      'Ollama endpoint must not include credentials.',
    )
  })
})
