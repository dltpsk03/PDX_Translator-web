import { readUploadedTextFile, readUploadedTextFiles, stripUtf8Bom } from './readUploadedTextFiles'

describe('readUploadedTextFiles', () => {
  it('reads yml and yaml files as UTF-8 text in memory', async () => {
    const ymlFile = new File(['l_english:\n key:0 "Hello"'], 'mod.yml', {
      type: 'text/yaml',
      lastModified: 1,
    })
    const yamlFile = new File(['l_korean:\n key:0 "안녕"'], 'mod.yaml', {
      type: 'text/yaml',
      lastModified: 2,
    })

    const result = await readUploadedTextFiles([ymlFile, yamlFile])

    expect(result.rejectedFiles).toEqual([])
    expect(result.files).toHaveLength(2)
    expect(result.files[0]).toMatchObject({
      name: 'mod.yml',
      text: 'l_english:\n key:0 "Hello"',
      hadBom: false,
      includeBomOnDownload: false,
    })
    expect(result.files[1].text).toContain('안녕')
  })

  it('detects UTF-8 BOM and removes it from internal text', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x6c, 0x5f, 0x65])
    const file = new File([bytes], 'bom.yml', { lastModified: 3 })

    const result = await readUploadedTextFile(file)

    expect(result.hadBom).toBe(true)
    expect(result.includeBomOnDownload).toBe(true)
    expect(result.text).toBe('l_e')
    expect(result.text.charCodeAt(0)).not.toBe(0xfeff)
  })

  it('rejects non-localization file extensions', async () => {
    const ymlFile = new File(['key:0 "Hello"'], 'valid.yml')
    const textFile = new File(['key:0 "Hello"'], 'notes.txt')

    const result = await readUploadedTextFiles([ymlFile, textFile])

    expect(result.files.map((file) => file.name)).toEqual(['valid.yml'])
    expect(result.rejectedFiles).toEqual([
      {
        name: 'notes.txt',
        reason: 'Only .yml and .yaml files are supported.',
      },
    ])
  })

  it('strips a decoded BOM character defensively', () => {
    expect(stripUtf8Bom('\ufeffl_english:')).toBe('l_english:')
  })
})
