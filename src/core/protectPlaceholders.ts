import type { ProtectedPlaceholder } from '../types/paradox'
import { createParadoxPlaceholderPattern } from './paradoxPlaceholders'

export type ProtectedText = {
  text: string
  placeholders: ProtectedPlaceholder[]
}

export function protectPlaceholders(value: string): ProtectedText {
  const placeholders: ProtectedPlaceholder[] = []

  const text = value.replace(createParadoxPlaceholderPattern(), (placeholder) => {
    const token = `<P${placeholders.length}>`

    placeholders.push({
      token,
      value: placeholder,
    })

    return token
  })

  return {
    text,
    placeholders,
  }
}
