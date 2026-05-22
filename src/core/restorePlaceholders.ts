import type { ProtectedPlaceholder } from '../types/paradox'

export function restorePlaceholders(value: string, placeholders: ProtectedPlaceholder[]) {
  return placeholders.reduce(
    (restoredValue, placeholder) =>
      restoredValue.replaceAll(placeholder.token, placeholder.value),
    value,
  )
}
