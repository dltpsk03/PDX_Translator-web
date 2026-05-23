import { readUploadedTextFiles } from './readUploadedTextFiles'
import type { ReadUploadResult } from '../types/uploadedFile'

type FileSystemEntryLike = {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath: string
}

type FileSystemFileEntryLike = FileSystemEntryLike & {
  file: (successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void) => void
}

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  createReader: () => {
    readEntries: (
      successCallback: (entries: FileSystemEntryLike[]) => void,
      errorCallback?: (error: DOMException) => void,
    ) => void
  }
}

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntryLike | null
}

async function readFileEntry(entry: FileSystemFileEntryLike): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file((file) => {
      Object.defineProperty(file, 'webkitRelativePath', {
        configurable: true,
        value: entry.fullPath.replace(/^\/+/, ''),
      })
      resolve(file)
    }, reject)
  })
}

async function readDirectoryEntries(entry: FileSystemDirectoryEntryLike) {
  const reader = entry.createReader()
  const entries: FileSystemEntryLike[] = []

  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })

    if (batch.length === 0) {
      break
    }

    entries.push(...batch)
  }

  return entries
}

async function collectEntryFiles(entry: FileSystemEntryLike): Promise<File[]> {
  if (entry.isFile) {
    return [await readFileEntry(entry as FileSystemFileEntryLike)]
  }

  if (!entry.isDirectory) {
    return []
  }

  const childEntries = await readDirectoryEntries(entry as FileSystemDirectoryEntryLike)
  const childFiles = await Promise.all(childEntries.map(collectEntryFiles))

  return childFiles.flat()
}

export async function readDroppedTextFiles(dataTransfer: DataTransfer): Promise<ReadUploadResult> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => (item as DataTransferItemWithEntry).webkitGetAsEntry?.() as FileSystemEntryLike | null | undefined)
    .filter((entry): entry is FileSystemEntryLike => Boolean(entry))

  if (entries.length > 0) {
    const files = (await Promise.all(entries.map(collectEntryFiles))).flat()

    return readUploadedTextFiles(files)
  }

  return readUploadedTextFiles(dataTransfer.files)
}
