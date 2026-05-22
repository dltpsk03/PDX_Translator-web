import type { ProtectedPlaceholder } from '../types/paradox'

export type ProtectedText = {
  text: string
  placeholders: ProtectedPlaceholder[]
}

const placeholderPattern = /\\n|\[[^\]\r\n]+\]|\$[^$\r\n]+\$|£[^£\r\n]+£|#[PN]\s+.*?\s+#!/g

export function protectPlaceholders(value: string): ProtectedText {
  const placeholders: ProtectedPlaceholder[] = []

  const text = value.replace(placeholderPattern, (placeholder) => {
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
