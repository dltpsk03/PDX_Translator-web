function sanitizeSegment(segment: string) {
  return segment
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
}

export function sanitizeZipPath(path: string, fallbackName = 'file.yml') {
  const segments = path
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:\/+/, '')
    .split('/')
    .map(sanitizeSegment)
    .filter((segment) => segment && segment !== '.' && segment !== '..')

  if (segments.length === 0) {
    return fallbackName
  }

  return segments.join('/')
}

export function createUniqueZipPath(path: string, usedPaths: Set<string>) {
  const sanitizedPath = sanitizeZipPath(path)

  if (!usedPaths.has(sanitizedPath)) {
    usedPaths.add(sanitizedPath)
    return sanitizedPath
  }

  const segments = sanitizedPath.split('/')
  const fileName = segments.pop() ?? 'file.yml'
  const extensionIndex = fileName.lastIndexOf('.')
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : ''

  for (let index = 2; ; index += 1) {
    const candidate = [...segments, `${baseName}-${index}${extension}`].join('/')

    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate)
      return candidate
    }
  }
}
