export type GlossaryEntry = {
  source: string
  target: string
}

export function parseGlossary(glossaryText: string): GlossaryEntry[] {
  return glossaryText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .flatMap((line) => {
      const separator =
        line.includes('=>') ? '=>' : line.includes('\t') ? '\t' : line.includes('=') ? '=' : null

      if (!separator) {
        return []
      }

      const [source, ...targetParts] = line.split(separator)
      const target = targetParts.join(separator)
      const normalizedSource = source.trim()
      const normalizedTarget = target.trim()

      return normalizedSource && normalizedTarget
        ? [{ source: normalizedSource, target: normalizedTarget }]
        : []
    })
}
