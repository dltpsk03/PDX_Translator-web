import type { ProtectedPlaceholder } from '../types/paradox'

export function restorePlaceholders(value: string, placeholders: ProtectedPlaceholder[]) {
  return placeholders.reduce(
    (restoredValue, placeholder) =>
      restoredValue.split(placeholder.token).join(placeholder.value),
    value,
  )
}
