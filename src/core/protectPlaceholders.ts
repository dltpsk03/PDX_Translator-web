import type { ProtectedPlaceholder } from '../types/paradox'
import { findParadoxPlaceholderMatches } from './paradoxPlaceholders'

export type ProtectedText = {
  text: string
  placeholders: ProtectedPlaceholder[]
}

export function protectPlaceholders(value: string): ProtectedText {
  const placeholders: ProtectedPlaceholder[] = []
  let protectedText = ''
  let cursor = 0

  for (const match of findParadoxPlaceholderMatches(value)) {
    const token = `<P${placeholders.length}>`

    protectedText += value.slice(cursor, match.index)
    protectedText += token
    placeholders.push({
      token,
      value: match.text,
    })
    cursor = match.index + match.text.length
  }

  protectedText += value.slice(cursor)

  return {
    text: protectedText,
    placeholders,
  }
}
