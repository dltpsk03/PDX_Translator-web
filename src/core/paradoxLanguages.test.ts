import {
  localizeParadoxFileName,
  localizeParadoxRelativePath,
  replaceLanguageHeader,
} from './paradoxLanguages'

describe('paradox language helpers', () => {
  it('replaces a Paradox language code in the file name', () => {
    expect(localizeParadoxFileName('trigger_system_l_english.yml', 'l_korean')).toBe(
      'trigger_system_l_korean.yml',
    )
    expect(localizeParadoxFileName('l_english_system.yml', 'l_korean')).toBe(
      'l_korean_system.yml',
    )
    expect(localizeParadoxFileName('events_l_french.yml', 'l_simp_chinese')).toBe(
      'events_l_simp_chinese.yml',
    )
    expect(localizeParadoxFileName('l_russian_system.yml', 'l_turkish')).toBe(
      'l_turkish_system.yml',
    )
  })

  it('adds the target language before the extension when no language code exists', () => {
    expect(localizeParadoxFileName('events.yml', 'l_japanese')).toBe('events_l_japanese.yml')
  })

  it('replaces only the filename language code in a relative path', () => {
    expect(
      localizeParadoxRelativePath('localization/english/events_l_english.yml', 'l_korean'),
    ).toBe('localization/english/events_l_korean.yml')
  })

  it('replaces a localization header line', () => {
    expect(replaceLanguageHeader('l_english:', 'l_korean')).toBe('l_korean:')
    expect(replaceLanguageHeader('  l_english:', 'l_french')).toBe('  l_french:')
  })
})
