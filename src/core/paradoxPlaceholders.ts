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

export function findParadoxPlaceholderText(value: string) {
  return [...value.matchAll(createParadoxPlaceholderPattern())]
    .map((match) => match[0])
    .filter((placeholder, index, placeholders) => placeholders.indexOf(placeholder) === index)
}
