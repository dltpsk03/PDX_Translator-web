export type GlossaryEntry = {
  source: string
  target: string
}

export type GlossaryParseResult = {
  entries: GlossaryEntry[]
  invalidLines: Array<{
    lineNumber: number
    text: string
  }>
  duplicateSources: string[]
}

function parseGlossaryLine(line: string): GlossaryEntry | null {
  const separator =
    line.includes('=>') ? '=>' : line.includes('\t') ? '\t' : line.includes('=') ? '=' : null

  if (!separator) {
    return null
  }

  const [source, ...targetParts] = line.split(separator)
  const target = targetParts.join(separator)
  const normalizedSource = source.trim()
  const normalizedTarget = target.trim()

  return normalizedSource && normalizedTarget
    ? { source: normalizedSource, target: normalizedTarget }
    : null
}

export function parseGlossaryWithDiagnostics(glossaryText: string): GlossaryParseResult {
  const entries: GlossaryEntry[] = []
  const invalidLines: GlossaryParseResult['invalidLines'] = []
  const sourceCounts = new Map<string, number>()

  glossaryText
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim()

      if (line.length === 0 || line.startsWith('#')) {
        return
      }

      const entry = parseGlossaryLine(line)

      if (!entry) {
        invalidLines.push({
          lineNumber: index + 1,
          text: rawLine,
        })
        return
      }

      entries.push(entry)
      sourceCounts.set(entry.source, (sourceCounts.get(entry.source) ?? 0) + 1)
    })

  return {
    entries,
    invalidLines,
    duplicateSources: [...sourceCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([source]) => source),
  }
}

export function parseGlossary(glossaryText: string): GlossaryEntry[] {
  return parseGlossaryWithDiagnostics(glossaryText).entries
}
