const placeholderSources = [
  String.raw`\\n`,
  String.raw`#[A-Za-z][A-Za-z0-9_]*\b`,
  String.raw`#!`,
  String.raw`\[Concept\([^\r\n]*?\)\]`,
  String.raw`\[[^\]\r\n]+\]`,
  String.raw`\$[^$\r\n]+\$`,
  String.raw`£[^£\r\n]+£`,
  String.raw`@[A-Za-z0-9_.:-]+!`,
]

export function createParadoxPlaceholderPattern() {
  return new RegExp(placeholderSources.join('|'), 'g')
}

export type ParadoxPlaceholderMatch = {
  text: string
  index: number
}

export type MalformedParadoxPlaceholder = {
  text: string
  reason: string
}

function isAsciiLetter(value: string) {
  return /^[A-Za-z]$/.test(value)
}

function isStyleNameChar(value: string) {
  return /^[A-Za-z0-9_]$/.test(value)
}

function readStyleMarker(value: string, start: number): string | null {
  if (value[start] !== '#') {
    return null
  }

  if (value[start + 1] === '!') {
    return '#!'
  }

  if (!isAsciiLetter(value[start + 1] ?? '')) {
    return null
  }

  let end = start + 2
  while (end < value.length && isStyleNameChar(value[end])) {
    end += 1
  }

  return value.slice(start, end)
}

function readDelimitedPlaceholder(value: string, start: number, delimiter: string) {
  let end = start + 1
  while (end < value.length && value[end] !== '\r' && value[end] !== '\n') {
    if (value[end] === delimiter) {
      return value.slice(start, end + 1)
    }
    end += 1
  }

  return null
}

function readAtIcon(value: string, start: number) {
  if (value[start] !== '@') {
    return null
  }

  let end = start + 1
  while (end < value.length && /^[A-Za-z0-9_.:-]$/.test(value[end])) {
    end += 1
  }

  return value[end] === '!' && end > start + 1 ? value.slice(start, end + 1) : null
}

function readBracketPlaceholder(value: string, start: number) {
  if (value[start] !== '[') {
    return null
  }

  let depth = 0
  let quote: string | null = null

  for (let index = start; index < value.length; index += 1) {
    const char = value[index]

    if (char === '\r' || char === '\n') {
      return null
    }

    if (quote) {
      if (char === '\\') {
        index += 1
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      continue
    }

    if (char === '[') {
      depth += 1
    } else if (char === ']') {
      depth -= 1
      if (depth === 0) {
        return value.slice(start, index + 1)
      }
    }
  }

  return null
}

function readConceptPlaceholder(value: string, start: number) {
  if (!value.startsWith('[Concept(', start)) {
    return null
  }

  let end = start + '[Concept('.length
  while (end < value.length && value[end] !== '\r' && value[end] !== '\n') {
    if (value[end] === ')' && value[end + 1] === ']') {
      return value.slice(start, end + 2)
    }
    end += 1
  }

  return null
}

export function findParadoxPlaceholderMatches(value: string): ParadoxPlaceholderMatch[] {
  const matches: ParadoxPlaceholderMatch[] = []
  let index = 0

  while (index < value.length) {
    const char = value[index]
    let placeholder: string | null = null

    if (char === '\\' && value[index + 1] === 'n') {
      placeholder = '\\n'
    } else if (char === '#') {
      placeholder = readStyleMarker(value, index)
    } else if (char === '[') {
      placeholder = readConceptPlaceholder(value, index) ?? readBracketPlaceholder(value, index)
    } else if (char === '$') {
      placeholder = readDelimitedPlaceholder(value, index, '$')
    } else if (char === '£' || char === '짙') {
      placeholder = readDelimitedPlaceholder(value, index, char)
    } else if (char === '@') {
      placeholder = readAtIcon(value, index)
    }

    if (placeholder) {
      matches.push({ text: placeholder, index })
      index += placeholder.length
    } else {
      index += 1
    }
  }

  return matches
}

export function findParadoxPlaceholderText(value: string) {
  return findParadoxPlaceholderMatches(value)
    .map((match) => match.text)
    .filter((placeholder, index, placeholders) => placeholders.indexOf(placeholder) === index)
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1
}

export function findMalformedParadoxPlaceholderText(value: string): MalformedParadoxPlaceholder[] {
  return findParadoxPlaceholderMatches(value)
    .map((match) => match.text)
    .filter((placeholder, index, placeholders) => placeholders.indexOf(placeholder) === index)
    .flatMap((placeholder) => {
      if (!placeholder.startsWith('[Concept(')) {
        return []
      }

      const errors: MalformedParadoxPlaceholder[] = []
      if (countOccurrences(placeholder, '$') % 2 !== 0) {
        errors.push({
          text: placeholder,
          reason: 'contains an unbalanced $ placeholder marker',
        })
      }

      if (countOccurrences(placeholder, "'") % 2 !== 0) {
        errors.push({
          text: placeholder,
          reason: 'contains unbalanced single quotes',
        })
      }

      if (countOccurrences(placeholder, '"') % 2 !== 0) {
        errors.push({
          text: placeholder,
          reason: 'contains unbalanced double quotes',
        })
      }

      return errors
    })
}
