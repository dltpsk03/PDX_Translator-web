import type { ReadUploadResult, UploadedTextFile } from '../types/uploadedFile'

const acceptedExtensions = new Set(['.yml', '.yaml'])
const utf8Bom = [0xef, 0xbb, 0xbf] as const

export function isAcceptedLocalizationFile(fileName: string) {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()

  return acceptedExtensions.has(extension)
}

export function stripUtf8Bom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function hasUtf8Bom(bytes: Uint8Array) {
  return bytes[0] === utf8Bom[0] && bytes[1] === utf8Bom[1] && bytes[2] === utf8Bom[2]
}

function createFileId(file: File) {
  const relativePath = getFileRelativePath(file)

  return `${relativePath}-${file.size}-${file.lastModified}`
}

function getFileRelativePath(file: File) {
  return file.webkitRelativePath || file.name
}

export async function readUploadedTextFile(file: File): Promise<UploadedTextFile> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const hadBom = hasUtf8Bom(bytes)
  const decodedText = new TextDecoder('utf-8').decode(bytes)
  const relativePath = getFileRelativePath(file)

  return {
    id: createFileId(file),
    name: file.name,
    relativePath,
    size: file.size,
    lastModified: file.lastModified,
    mimeType: file.type,
    text: stripUtf8Bom(decodedText),
    hadBom,
    includeBomOnDownload: hadBom,
  }
}

export async function readUploadedTextFiles(fileList: FileList | File[]): Promise<ReadUploadResult> {
  const inputFiles = Array.from(fileList)
  const acceptedFiles = inputFiles.filter((file) => isAcceptedLocalizationFile(file.name))
  const rejectedFiles = inputFiles
    .filter((file) => !isAcceptedLocalizationFile(file.name))
    .map((file) => ({
      name: file.name,
      reason: 'Only .yml and .yaml files are supported.',
    }))

  return {
    files: await Promise.all(acceptedFiles.map(readUploadedTextFile)),
    rejectedFiles,
  }
}
