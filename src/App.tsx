import JSZip from 'jszip'
import { useState, type ChangeEvent } from 'react'

import { SectionCard } from './components/SectionCard'
import { createBatches } from './core/createBatches'
import { parseParadoxYml } from './core/parseParadoxYml'
import { readUploadedTextFiles } from './core/readUploadedTextFiles'
import {
  createTranslationResultMap,
  rebuildParadoxYml,
} from './core/rebuildParadoxYml'
import {
  runTranslation,
  type TranslatedEntryResult,
  type TranslationProgress,
} from './core/runTranslation'
import {
  checkOllama,
  DEFAULT_OLLAMA_ENDPOINT,
  type OllamaModel,
} from './ollama/checkOllama'
import {
  DEFAULT_TRANSLATION_MODEL,
  translateBatch as requestTranslateBatch,
} from './ollama/translateBatch'
import type { LocalizationEntry, ParsedLine } from './types/paradox'
import type { RejectedUploadFile, UploadedTextFile } from './types/uploadedFile'

type UiLanguage = 'en' | 'ko'

type ParsedUploadedFile = {
  file: UploadedTextFile
  parsedLines: ParsedLine[]
}

const copy = {
  en: {
    appTitle: 'Paradox MOD YML Translator',
    appSubtitle: 'Local browser workflow for Paradox localization files and Ollama.',
    interface: 'Interface',
    files: 'Files',
    entries: 'Entries',
    batches: 'Batches',
    failed: 'Failed',
    fileUpload: 'File Upload',
    fileUploadDesc: 'Read .yml or .yaml files as UTF-8 in browser memory.',
    selectFiles: 'Select .yml or .yaml files',
    readingFiles: 'Reading UTF-8 text...',
    loaded: 'Loaded',
    size: 'Size',
    bom: 'BOM',
    rejectedFiles: 'Rejected files',
    localOnly: 'Files stay in browser memory. BOM is stripped internally and kept as metadata.',
    ollamaConnection: 'Ollama Connection',
    ollamaDesc: 'Check local Ollama before sending translation batches.',
    status: 'Status',
    connected: 'Connected',
    checking: 'Checking...',
    connectionFailed: 'Connection failed',
    notChecked: 'Not checked',
    checkConnection: 'Check Connection',
    endpoint: 'Endpoint',
    models: 'Models',
    installedModels: 'Installed Models',
    unableToConnect: 'Unable to connect to Ollama.',
    settings: 'Translation Settings',
    settingsDesc: 'Batching and generation controls.',
    model: 'Model',
    batchSize: 'Batch Size',
    concurrency: 'Concurrency',
    temperature: 'Temperature',
    keepAlive: 'Keep Alive',
    topP: 'Top P',
    penalty: 'Penalty',
    maxChars: 'Max Chars',
    progress: 'Progress',
    progressDesc: 'Controlled-concurrency translation status.',
    overallProgress: 'Overall Progress',
    startTranslation: 'Start Translation',
    translating: 'Translating...',
    finished: 'Translation run finished.',
    stopped: 'Translation run stopped.',
    ready: 'Ready to translate parsed entries.',
    waiting: 'Waiting for files and Ollama connection.',
    resultDownload: 'Result Download',
    resultDesc: 'Rebuild original files and download translated output.',
    saveBom: 'Save as UTF-8 with BOM',
    download: 'Download translated files',
    failedEntries: 'Failed entries',
    uploadError: 'Failed to read selected files as UTF-8 text.',
    noBom: 'No BOM',
    bomDetected: 'BOM detected',
  },
  ko: {
    appTitle: 'Paradox MOD YML 번역기',
    appSubtitle: 'Paradox localization 파일과 로컬 Ollama를 위한 브라우저 작업 도구입니다.',
    interface: '화면 언어',
    files: '파일',
    entries: '항목',
    batches: '배치',
    failed: '실패',
    fileUpload: '파일 업로드',
    fileUploadDesc: '.yml 또는 .yaml 파일을 브라우저 메모리에서 UTF-8로 읽습니다.',
    selectFiles: '.yml 또는 .yaml 파일 선택',
    readingFiles: 'UTF-8 텍스트 읽는 중...',
    loaded: '로드됨',
    size: '크기',
    bom: 'BOM',
    rejectedFiles: '거부된 파일',
    localOnly: '파일은 브라우저 메모리에만 남습니다. BOM은 내부 처리에서 제거하고 메타데이터로 보관합니다.',
    ollamaConnection: 'Ollama 연결',
    ollamaDesc: '번역 배치를 보내기 전에 로컬 Ollama 상태를 확인합니다.',
    status: '상태',
    connected: '연결됨',
    checking: '확인 중...',
    connectionFailed: '연결 실패',
    notChecked: '미확인',
    checkConnection: '연결 확인',
    endpoint: '엔드포인트',
    models: '모델',
    installedModels: '설치된 모델',
    unableToConnect: 'Ollama에 연결할 수 없습니다.',
    settings: '번역 설정',
    settingsDesc: '배치 및 생성 옵션입니다.',
    model: '모델',
    batchSize: '배치 크기',
    concurrency: '동시 요청',
    temperature: 'Temperature',
    keepAlive: 'Keep Alive',
    topP: 'Top P',
    penalty: 'Penalty',
    maxChars: '최대 문자',
    progress: '진행률',
    progressDesc: '동시성 제한 번역 진행 상태입니다.',
    overallProgress: '전체 진행률',
    startTranslation: '번역 시작',
    translating: '번역 중...',
    finished: '번역 작업이 끝났습니다.',
    stopped: '번역 작업이 중단되었습니다.',
    ready: '파싱된 항목을 번역할 준비가 됐습니다.',
    waiting: '파일과 Ollama 연결을 기다리는 중입니다.',
    resultDownload: '결과 다운로드',
    resultDesc: '원본 파일 구조로 재빌드한 번역 결과를 다운로드합니다.',
    saveBom: 'UTF-8 with BOM으로 저장',
    download: '번역 파일 다운로드',
    failedEntries: '실패 항목',
    uploadError: '선택한 파일을 UTF-8 텍스트로 읽지 못했습니다.',
    noBom: 'BOM 없음',
    bomDetected: 'BOM 감지됨',
  },
} as const

const initialProgress: TranslationProgress = {
  completedEntries: 0,
  totalEntries: 0,
  completedBatches: 0,
  totalBatches: 0,
  failedEntries: 0,
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB'] as const
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-l border-slate-300 pl-3">
      <div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-950">{value}</div>
    </div>
  )
}

function App() {
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('en')
  const t = copy[uiLanguage]
  const [uploadedFiles, setUploadedFiles] = useState<UploadedTextFile[]>([])
  const [parsedFiles, setParsedFiles] = useState<ParsedUploadedFile[]>([])
  const [localizationEntries, setLocalizationEntries] = useState<LocalizationEntry[]>([])
  const [rejectedFiles, setRejectedFiles] = useState<RejectedUploadFile[]>([])
  const [isReadingFiles, setIsReadingFiles] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [ollamaStatus, setOllamaStatus] = useState<
    'idle' | 'checking' | 'connected' | 'failed'
  >('idle')
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([])
  const [ollamaError, setOllamaError] = useState<string | null>(null)
  const [model, setModel] = useState(DEFAULT_TRANSLATION_MODEL)
  const [batchSize, setBatchSize] = useState(80)
  const [concurrency, setConcurrency] = useState(2)
  const [temperature, setTemperature] = useState(0.1)
  const [translationStatus, setTranslationStatus] = useState<'idle' | 'running' | 'done' | 'failed'>(
    'idle',
  )
  const [translationProgress, setTranslationProgress] =
    useState<TranslationProgress>(initialProgress)
  const [translationError, setTranslationError] = useState<string | null>(null)
  const [failedTranslationEntries, setFailedTranslationEntries] = useState<
    TranslatedEntryResult[]
  >([])
  const [translationResults, setTranslationResults] = useState<TranslatedEntryResult[]>([])
  const [includeBomOnDownload, setIncludeBomOnDownload] = useState(true)
  const [showOllamaInfo, setShowOllamaInfo] = useState(false)
  const totalBytes = uploadedFiles.reduce((sum, file) => sum + file.size, 0)
  const bomCount = uploadedFiles.filter((file) => file.hadBom).length
  const normalizedBatchSize = Number.isFinite(batchSize) ? batchSize : 80
  const normalizedConcurrency = Number.isFinite(concurrency) ? concurrency : 2
  const normalizedTemperature = Number.isFinite(temperature) ? temperature : 0.1
  const batchCount =
    localizationEntries.length > 0
      ? createBatches(localizationEntries, {
          maxLines: normalizedBatchSize,
          maxChars: 12000,
        }).length
      : 0
  const progressPercent =
    translationProgress.totalEntries > 0
      ? Math.round((translationProgress.completedEntries / translationProgress.totalEntries) * 100)
      : 0
  const statusLabel =
    ollamaStatus === 'connected'
      ? t.connected
      : ollamaStatus === 'checking'
        ? t.checking
        : ollamaStatus === 'failed'
          ? t.connectionFailed
          : t.notChecked

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = event.currentTarget.files

    if (!selectedFiles?.length) {
      return
    }

    setIsReadingFiles(true)
    setUploadError(null)

    try {
      const result = await readUploadedTextFiles(selectedFiles)
      let globalIndexStart = 0
      const nextParsedFiles = result.files.map((file) => {
        const parsedLines = parseParadoxYml(file.text, {
          fileName: file.name,
          globalIndexStart,
        })
        const entries = parsedLines.filter(
          (line): line is LocalizationEntry => line.type === 'entry',
        )

        globalIndexStart += entries.length

        return {
          file,
          parsedLines,
        }
      })
      const nextEntries = nextParsedFiles.flatMap((parsedFile) =>
        parsedFile.parsedLines.filter((line): line is LocalizationEntry => line.type === 'entry'),
      )

      setUploadedFiles(result.files)
      setParsedFiles(nextParsedFiles)
      setLocalizationEntries(nextEntries)
      setRejectedFiles(result.rejectedFiles)
      setTranslationProgress({
        ...initialProgress,
        totalEntries: nextEntries.length,
        totalBatches:
          nextEntries.length > 0
            ? createBatches(nextEntries, { maxLines: normalizedBatchSize, maxChars: 12000 }).length
            : 0,
      })
      setTranslationStatus('idle')
      setFailedTranslationEntries([])
      setTranslationResults([])
    } catch {
      setUploadError(t.uploadError)
      setUploadedFiles([])
      setParsedFiles([])
      setLocalizationEntries([])
      setRejectedFiles([])
    } finally {
      setIsReadingFiles(false)
      event.currentTarget.value = ''
    }
  }

  async function handleCheckOllama() {
    setOllamaStatus('checking')
    setOllamaError(null)

    const result = await checkOllama()

    if (result.ok) {
      setOllamaStatus('connected')
      setOllamaModels(result.models)
      if (result.models.some((installedModel) => installedModel.name === model)) {
        return
      }
      if (result.models[0]) {
        setModel(result.models[0].name)
      }
      return
    }

    setOllamaStatus('failed')
    setOllamaModels([])
    setOllamaError(result.error)
  }

  async function handleStartTranslation() {
    if (localizationEntries.length === 0 || translationStatus === 'running') {
      return
    }

    setTranslationStatus('running')
    setTranslationError(null)
    setFailedTranslationEntries([])

    try {
      const result = await runTranslation({
        entries: localizationEntries,
        batchSize: normalizedBatchSize,
        concurrency: normalizedConcurrency,
        translateBatch: (batch) =>
          requestTranslateBatch(batch, {
            model,
            temperature: normalizedTemperature,
          }),
        onProgress: setTranslationProgress,
      })

      setTranslationProgress(result.progress)
      setTranslationResults(result.results)
      setFailedTranslationEntries(result.failedEntries)
      setTranslationStatus('done')
    } catch (error) {
      setTranslationStatus('failed')
      setTranslationError(error instanceof Error ? error.message : 'Translation failed.')
    }
  }

  function downloadBlob(fileName: string, blob: Blob) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  function createDownloadText(text: string) {
    return includeBomOnDownload ? `\ufeff${text}` : text
  }

  async function handleDownloadFiles() {
    const translationResultMap = createTranslationResultMap(translationResults)
    const rebuiltFiles = parsedFiles.map((parsedFile) => ({
      name: parsedFile.file.name,
      text: rebuildParadoxYml(parsedFile.parsedLines, translationResultMap).text,
    }))

    if (rebuiltFiles.length === 0) {
      return
    }

    if (rebuiltFiles.length === 1) {
      downloadBlob(
        rebuiltFiles[0].name,
        new Blob([createDownloadText(rebuiltFiles[0].text)], {
          type: 'text/yaml;charset=utf-8',
        }),
      )
      return
    }

    const zip = new JSZip()

    for (const file of rebuiltFiles) {
      zip.file(file.name, createDownloadText(file.text))
    }

    downloadBlob(
      'pdx-translator-results.zip',
      await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
      }),
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f6f2] text-slate-950">
      <div className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[#476a5f]">Browser-only</p>
            <h1 className="mt-1 text-2xl font-semibold">Paradox MOD YML Translator</h1>
            <p className="mt-1 text-sm text-slate-600">{t.appSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowOllamaInfo((current) => !current)}
              className="border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-[#476a5f] hover:text-slate-950"
            >
              {showOllamaInfo ? 'Back' : 'Info'}
            </button>
            <span className="text-xs font-semibold uppercase text-slate-500">{t.interface}</span>
            <div className="grid grid-cols-2 border border-slate-300 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setUiLanguage('en')}
                className={`px-3 py-1.5 text-sm font-semibold ${
                  uiLanguage === 'en' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setUiLanguage('ko')}
                className={`px-3 py-1.5 text-sm font-semibold ${
                  uiLanguage === 'ko' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
                }`}
              >
                한국어
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {showOllamaInfo ? (
          <section className="border border-slate-300 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-lg font-semibold text-slate-950">
                {uiLanguage === 'ko' ? 'Ollama + Gemma4 설정' : 'Ollama + Gemma4 Setup'}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {uiLanguage === 'ko'
                  ? '로컬 PC에서 Ollama를 실행하고 브라우저 앱이 접근할 수 있게 설정합니다.'
                  : 'Run Ollama locally and allow this browser app to access it.'}
              </p>
            </div>
            <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold uppercase text-[#476a5f]">
                    {uiLanguage === 'ko' ? '1. Ollama 설치' : '1. Install Ollama'}
                  </h3>
                  <p className="mt-2 text-sm text-slate-700">
                    {uiLanguage === 'ko'
                      ? 'Ollama 공식 사이트에서 Windows용 Ollama를 설치합니다.'
                      : 'Install Ollama for Windows from the official Ollama site.'}
                  </p>
                  <a
                    href="https://ollama.com/download"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-[#476a5f]"
                  >
                    https://ollama.com/download
                  </a>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase text-[#476a5f]">
                    {uiLanguage === 'ko' ? '2. Gemma4 모델 받기' : '2. Pull Gemma4'}
                  </h3>
                  <pre className="mt-2 overflow-auto bg-slate-950 p-3 text-sm text-slate-50">
                    <code>ollama pull gemma4:e4b</code>
                  </pre>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase text-[#476a5f]">
                    {uiLanguage === 'ko' ? '3. GitHub Pages Origin 허용' : '3. Allow GitHub Pages Origin'}
                  </h3>
                  <p className="mt-2 text-sm text-slate-700">
                    {uiLanguage === 'ko'
                      ? 'GitHub Pages에서 실행되는 브라우저 앱이 로컬 Ollama에 접근하려면 origin 허용이 필요합니다.'
                      : 'The browser app served from GitHub Pages needs an allowed origin to call local Ollama.'}
                  </p>
                  <pre className="mt-2 overflow-auto bg-slate-950 p-3 text-sm text-slate-50">
                    <code>OLLAMA_ORIGINS=https://dltpsk03.github.io ollama serve</code>
                  </pre>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase text-[#476a5f]">
                    {uiLanguage === 'ko' ? '4. 앱에서 확인' : '4. Check in the App'}
                  </h3>
                  <p className="mt-2 text-sm text-slate-700">
                    {uiLanguage === 'ko'
                      ? '앱으로 돌아가 Ollama 연결 확인을 누르고, 모델이 gemma4:e4b인지 확인합니다.'
                      : 'Return to the app, press Check Connection, and confirm the selected model is gemma4:e4b.'}
                  </p>
                </div>
              </div>

              <aside className="border border-slate-300 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold uppercase text-slate-500">
                  {uiLanguage === 'ko' ? '현재 앱 기본값' : 'Current App Defaults'}
                </h3>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="font-semibold text-slate-500">Endpoint</dt>
                    <dd className="mt-1 text-slate-950">{DEFAULT_OLLAMA_ENDPOINT}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Model</dt>
                    <dd className="mt-1 text-slate-950">gemma4:e4b</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Thinking</dt>
                    <dd className="mt-1 text-slate-950">think: false</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Batch</dt>
                    <dd className="mt-1 text-slate-950">80 lines, concurrency 2</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </section>
        ) : (
          <>
        <section className="mb-5 grid grid-cols-2 gap-4 border border-slate-300 bg-white p-4 lg:grid-cols-4">
          <Metric label={t.files} value={uploadedFiles.length} />
          <Metric label={t.entries} value={localizationEntries.length} />
          <Metric label={t.batches} value={batchCount} />
          <Metric label={t.failed} value={failedTranslationEntries.length} />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4">
            <SectionCard title={t.fileUpload} description={t.fileUploadDesc}>
              <div className="space-y-4">
                <label className="flex min-h-28 cursor-pointer items-center justify-center border border-dashed border-slate-400 bg-[#fbfcf8] px-4 py-6 text-center text-sm font-semibold text-slate-700 transition hover:border-[#476a5f] hover:bg-white">
                  <input
                    type="file"
                    accept=".yml,.yaml"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  {isReadingFiles ? t.readingFiles : t.selectFiles}
                </label>

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Metric label={t.loaded} value={uploadedFiles.length} />
                  <Metric label={t.size} value={formatBytes(totalBytes)} />
                  <Metric label={t.bom} value={bomCount} />
                </div>

                {uploadError ? <p className="text-sm text-red-700">{uploadError}</p> : null}

                {rejectedFiles.length > 0 ? (
                  <div className="border border-[#d7b36b] bg-[#fff8e7] px-3 py-3 text-sm text-[#6b4b16]">
                    <p className="font-semibold">{t.rejectedFiles}</p>
                    <ul className="mt-2 space-y-1">
                      {rejectedFiles.map((file) => (
                        <li key={file.name}>
                          {file.name}: {file.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {uploadedFiles.length > 0 ? (
                  <ul className="max-h-56 space-y-2 overflow-auto border border-slate-300 bg-white p-2">
                    {uploadedFiles.map((file) => (
                      <li
                        key={file.id}
                        className="grid grid-cols-1 gap-2 border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:grid-cols-[1fr_auto_auto]"
                      >
                        <span className="truncate font-medium text-slate-950">{file.name}</span>
                        <span>{formatBytes(file.size)}</span>
                        <span>{file.hadBom ? t.bomDetected : t.noBom}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">{t.localOnly}</p>
                )}
              </div>
            </SectionCard>

            <SectionCard title={t.progress} description={t.progressDesc}>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
                    <span>{t.overallProgress}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-2 bg-slate-200">
                    <div
                      className="h-2 bg-[#476a5f] transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Metric
                    label={t.entries}
                    value={`${translationProgress.completedEntries} / ${localizationEntries.length}`}
                  />
                  <Metric
                    label={t.batches}
                    value={`${translationProgress.completedBatches} / ${batchCount}`}
                  />
                  <Metric
                    label={t.failed}
                    value={failedTranslationEntries.length || translationProgress.failedEntries}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleStartTranslation}
                  disabled={localizationEntries.length === 0 || translationStatus === 'running'}
                  className="w-full bg-[#1f2f2a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#30473f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {translationStatus === 'running' ? t.translating : t.startTranslation}
                </button>

                <div className="border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  {translationStatus === 'done'
                    ? t.finished
                    : translationStatus === 'failed'
                      ? t.stopped
                      : localizationEntries.length > 0
                        ? t.ready
                        : t.waiting}
                </div>

                {translationError ? (
                  <p className="text-sm text-red-700">{translationError}</p>
                ) : null}
              </div>
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard title={t.ollamaConnection} description={t.ollamaDesc}>
              <div className="space-y-4 text-sm text-slate-700">
                <div className="grid gap-3 border border-slate-300 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="text-xs font-semibold uppercase text-slate-500">{t.status}</div>
                    <div className="mt-1 font-semibold text-slate-950">{statusLabel}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckOllama}
                    disabled={ollamaStatus === 'checking'}
                    className="bg-[#d7b36b] px-4 py-2 font-semibold text-slate-950 transition hover:bg-[#e5c77e] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {ollamaStatus === 'checking' ? t.checking : t.checkConnection}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Metric label={t.endpoint} value={DEFAULT_OLLAMA_ENDPOINT} />
                  <Metric label={t.models} value={ollamaModels.length} />
                </div>

                {ollamaModels.length > 0 ? (
                  <div className="border border-slate-300 bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      {t.installedModels}
                    </p>
                    <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                      {ollamaModels.map((installedModel) => (
                        <li key={installedModel.name} className="bg-slate-50 px-3 py-2 font-medium">
                          {installedModel.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {ollamaStatus === 'failed' ? (
                  <div className="border border-red-200 bg-red-50 px-3 py-3 text-red-900">
                    <p className="font-semibold">{t.unableToConnect}</p>
                    {ollamaError ? <p className="mt-1">{ollamaError}</p> : null}
                    <pre className="mt-3 overflow-auto bg-red-950 px-3 py-2 text-xs text-red-50">
                      <code>OLLAMA_ORIGINS=https://YOUR_GITHUB_USERNAME.github.io ollama serve</code>
                    </pre>
                  </div>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard title={t.settings} description={t.settingsDesc}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {t.model}
                  </span>
                  {ollamaModels.length > 0 ? (
                    <select
                      value={model}
                      onChange={(event) => setModel(event.currentTarget.value)}
                      className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                    >
                      {ollamaModels.map((installedModel) => (
                        <option key={installedModel.name} value={installedModel.name}>
                          {installedModel.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={model}
                      onChange={(event) => setModel(event.currentTarget.value)}
                      className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                    />
                  )}
                </label>
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {t.batchSize}
                  </span>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={batchSize}
                    onChange={(event) => {
                      if (!Number.isNaN(event.currentTarget.valueAsNumber)) {
                        setBatchSize(event.currentTarget.valueAsNumber)
                      }
                    }}
                    className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                  />
                </label>
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {t.concurrency}
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="4"
                    value={concurrency}
                    onChange={(event) => {
                      if (!Number.isNaN(event.currentTarget.valueAsNumber)) {
                        setConcurrency(event.currentTarget.valueAsNumber)
                      }
                    }}
                    className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                  />
                </label>
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {t.temperature}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
                    onChange={(event) => {
                      if (!Number.isNaN(event.currentTarget.valueAsNumber)) {
                        setTemperature(event.currentTarget.valueAsNumber)
                      }
                    }}
                    className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Metric label={t.keepAlive} value="30m" />
                <Metric label={t.topP} value="0.9" />
                <Metric label={t.penalty} value="1.05" />
                <Metric label={t.maxChars} value="12000" />
              </div>
            </SectionCard>

            <SectionCard title={t.resultDownload} description={t.resultDesc}>
              <div className="space-y-3">
                <label className="flex items-center gap-3 border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeBomOnDownload}
                    onChange={(event) => setIncludeBomOnDownload(event.currentTarget.checked)}
                    className="h-4 w-4"
                  />
                  {t.saveBom}
                </label>
                <button
                  type="button"
                  disabled={translationResults.length === 0}
                  onClick={handleDownloadFiles}
                  className="w-full bg-[#1f2f2a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#30473f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.download}
                </button>
                <div className="border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
                  {t.failedEntries}: {failedTranslationEntries.length}
                </div>
                {failedTranslationEntries.length > 0 ? (
                  <ul className="max-h-40 space-y-2 overflow-auto border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    {failedTranslationEntries.map((failedEntry) => (
                      <li key={failedEntry.entry.globalIndex}>
                        {failedEntry.entry.fileName}:{failedEntry.entry.lineIndex + 1}{' '}
                        {failedEntry.entry.key}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </SectionCard>
          </div>
        </section>
          </>
        )}
      </div>
    </main>
  )
}

export default App
