import type { TranslationBatch } from '../core/createBatches'
import { translateBatch, DEFAULT_TRANSLATION_MODEL } from './translateBatch'

function batch(promptText = ' key:0 "Value"'): TranslationBatch {
  return {
    batchIndex: 0,
    entries: [],
    promptText,
    charCount: promptText.length,
  }
}

describe('translateBatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts a batch prompt to Ollama generate with default settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: ' key:0 "Translated"' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(translateBatch(batch())).resolves.toBe(' key:0 "Translated"')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }),
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)

    expect(body).toMatchObject({
      model: DEFAULT_TRANSLATION_MODEL,
      stream: false,
      think: false,
      keep_alive: '30m',
      options: {
        temperature: 0.1,
        top_p: 0.9,
        repeat_penalty: 1.05,
      },
    })
    expect(body.prompt).toContain(' key:0 "Value"')
  })

  it('supports custom endpoint, model, keepAlive, and generation options', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: ' key:0 "Custom translated"' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await translateBatch(batch(), {
      endpoint: 'http://localhost:11435/',
      model: 'qwen2.5:7b',
      keepAlive: '10m',
      temperature: 0.2,
      topP: 0.8,
      repeatPenalty: 1.1,
    })

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)

    expect(url).toBe('http://localhost:11435/api/generate')
    expect(body).toMatchObject({
      model: 'qwen2.5:7b',
      think: false,
      keep_alive: '10m',
      options: {
        temperature: 0.2,
        top_p: 0.8,
        repeat_penalty: 1.1,
      },
    })
  })

  it('throws for non-2xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    )

    await expect(translateBatch(batch())).rejects.toThrow('Ollama returned HTTP 500.')
  })

  it('rejects non-local endpoints before sending translation text', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      translateBatch(batch(' key:0 "Private text"'), {
        endpoint: 'http://example.com:11434',
      }),
    ).rejects.toThrow('Ollama endpoint must be localhost, 127.0.0.1, or [::1].')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when the response text is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ done: true }),
      }),
    )

    await expect(translateBatch(batch())).rejects.toThrow(
      'Ollama response did not include translated text.',
    )
  })
})
