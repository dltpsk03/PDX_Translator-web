const allowedLocalHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function normalizeLocalOllamaEndpoint(endpoint: string) {
  let url: URL

  try {
    url = new URL(endpoint)
  } catch {
    throw new Error('Ollama endpoint must be a valid local HTTP URL.')
  }

  if (url.protocol !== 'http:') {
    throw new Error('Ollama endpoint must use http://.')
  }

  if (url.username || url.password) {
    throw new Error('Ollama endpoint must not include credentials.')
  }

  if (!allowedLocalHosts.has(url.hostname.toLowerCase())) {
    throw new Error('Ollama endpoint must be localhost, 127.0.0.1, or [::1].')
  }

  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')

  return `${url.protocol}//${url.host}${path}`
}
