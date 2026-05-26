import { createUniqueZipPath, sanitizeZipPath } from './sanitizeZipPath'

describe('sanitizeZipPath', () => {
  it('removes absolute paths and parent directory segments', () => {
    expect(sanitizeZipPath('/tmp/../mod/file.yml')).toBe('tmp/mod/file.yml')
    expect(sanitizeZipPath('C:\\Users\\name\\..\\mod\\file.yml')).toBe('Users/name/mod/file.yml')
  })

  it('replaces unsafe filename characters and control characters', () => {
    expect(sanitizeZipPath('OUTPUT/bad:name\u0000.yml')).toBe('OUTPUT/bad_name_.yml')
  })

  it('creates unique names for colliding paths', () => {
    const usedPaths = new Set<string>()

    expect(createUniqueZipPath('OUTPUT/file.yml', usedPaths)).toBe('OUTPUT/file.yml')
    expect(createUniqueZipPath('OUTPUT/file.yml', usedPaths)).toBe('OUTPUT/file-2.yml')
  })
})
