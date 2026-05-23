export type ParadoxLanguageCode =
  | 'l_braz_por'
  | 'l_english'
  | 'l_french'
  | 'l_german'
  | 'l_japanese'
  | 'l_korean'
  | 'l_polish'
  | 'l_russian'
  | 'l_simp_chinese'
  | 'l_spanish'
  | 'l_turkish'

export type ParadoxLanguage = {
  code: ParadoxLanguageCode
  name: string
}

export const PARADOX_LANGUAGES: ParadoxLanguage[] = [
  { code: 'l_korean', name: 'Korean' },
  { code: 'l_english', name: 'English' },
  { code: 'l_simp_chinese', name: 'Simplified Chinese' },
  { code: 'l_japanese', name: 'Japanese' },
  { code: 'l_braz_por', name: 'Brazilian Portuguese' },
  { code: 'l_french', name: 'French' },
  { code: 'l_german', name: 'German' },
  { code: 'l_polish', name: 'Polish' },
  { code: 'l_russian', name: 'Russian' },
  { code: 'l_spanish', name: 'Spanish' },
  { code: 'l_turkish', name: 'Turkish' },
]

const supportedLanguageCodes = PARADOX_LANGUAGES.map((language) => language.code)

export function getParadoxLanguageName(code: ParadoxLanguageCode) {
  return PARADOX_LANGUAGES.find((language) => language.code === code)?.name ?? code
}

export function replaceLanguageHeader(rawLine: string, targetLanguage: ParadoxLanguageCode) {
  return rawLine.replace(/^(\s*)l_[a-z_]+:(.*)$/, `$1${targetLanguage}:$2`)
}

export function isLanguageHeader(rawLine: string) {
  return /^\s*l_[a-z_]+:/.test(rawLine)
}

export function localizeParadoxFileName(fileName: string, targetLanguage: ParadoxLanguageCode) {
  const languagePattern = new RegExp(
    `(^|[_.-])(${supportedLanguageCodes.join('|')})(?=([_.-]|$))`,
  )

  if (languagePattern.test(fileName)) {
    return fileName.replace(languagePattern, `$1${targetLanguage}`)
  }

  const extensionMatch = fileName.match(/(\.ya?ml)$/i)

  if (!extensionMatch) {
    return `${fileName}_${targetLanguage}`
  }

  return fileName.replace(/(\.ya?ml)$/i, `_${targetLanguage}$1`)
}

export function localizeParadoxRelativePath(
  relativePath: string,
  targetLanguage: ParadoxLanguageCode,
) {
  const pathParts = relativePath.split(/[\\/]/)
  const fileName = pathParts.pop()

  if (!fileName) {
    return localizeParadoxFileName(relativePath, targetLanguage)
  }

  return [...pathParts, localizeParadoxFileName(fileName, targetLanguage)].join('/')
}
