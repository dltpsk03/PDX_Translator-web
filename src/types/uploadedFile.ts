export type UploadedTextFile = {
  id: string
  name: string
  relativePath: string
  size: number
  lastModified: number
  mimeType: string
  text: string
  hadBom: boolean
  includeBomOnDownload: boolean
}

export type RejectedUploadFile = {
  name: string
  reason: string
}

export type ReadUploadResult = {
  files: UploadedTextFile[]
  rejectedFiles: RejectedUploadFile[]
}
