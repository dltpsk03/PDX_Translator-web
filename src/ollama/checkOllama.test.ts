import { checkOllama, DEFAULT_OLLAMA_ENDPOINT } from './checkOllama'

describe('checkOllama', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('checks the default Ollama tags endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            name: 'gemma4:e4b',
            modified_at: '2026-05-22T10:00:00Z',
            size: 123,
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkOllama()

    expect(fetchMock).toHaveBeenCalledWith(`${DEFAULT_OLLAMA_ENDPOINT}/api/tags`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
    expect(result).toEqual({
      ok: true,
      endpoint: DEFAULT_OLLAMA_ENDPOINT,
      models: [
        {
          name: 'gemma4:e4b',
          modifiedAt: '2026-05-22T10:00:00Z',
          size: 123,
        },
      ],
    })
  })

  it('normalizes a trailing slash in custom endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      }),
    )

    await expect(checkOllama('http://localhost:11434/')).resolves.toMatchObject({
      ok: true,
      endpoint: 'http://localhost:11434',
    })
  })

  it('rejects non-local endpoints without sending a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(checkOllama('http://example.com:11434')).resolves.toEqual({
      ok: false,
      endpoint: 'http://example.com:11434',
      error: 'Ollama endpoint must be localhost, 127.0.0.1, or [::1].',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a failed result for non-2xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }),
    )

    await expect(checkOllama()).resolves.toEqual({
      ok: false,
      endpoint: DEFAULT_OLLAMA_ENDPOINT,
      error: 'Ollama returned HTTP 403.',
    })
  })

  it('returns a failed result when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))

    await expect(checkOllama()).resolves.toEqual({
      ok: false,
      endpoint: DEFAULT_OLLAMA_ENDPOINT,
      error: 'Failed to fetch',
    })
  })
})
