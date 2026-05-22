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

type ParsedUploadedFile = {
  file: UploadedTextFile
  parsedLines: ParsedLine[]
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

const initialProgress: TranslationProgress = {
  completedEntries: 0,
  totalEntries: 0,
  completedBatches: 0,
  totalBatches: 0,
  failedEntries: 0,
}

function App() {
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
  const totalSections = 5
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
      setUploadError('Failed to read selected files as UTF-8 text.')
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

  function downloadTextFile(fileName: string, text: string) {
    const outputText = includeBomOnDownload ? `\ufeff${text}` : text
    const blob = new Blob([outputText], {
      type: 'text/yaml;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  function handleDownloadFiles() {
    const translationResultMap = createTranslationResultMap(translationResults)

    for (const parsedFile of parsedFiles) {
      const rebuilt = rebuildParadoxYml(parsedFile.parsedLines, translationResultMap)

      downloadTextFile(parsedFile.file.name, rebuilt.text)
    }
  }

  const fileUploadSection = (
    <SectionCard
      title="File Upload"
      description="Upload one or more Paradox localization .yml or .yaml files directly in the browser."
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-400/50 bg-white/60 px-4 py-8 text-center text-sm text-slate-600 transition hover:border-amber-500 hover:bg-amber-50">
          <input
            type="file"
            accept=".yml,.yaml"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          {isReadingFiles ? 'Reading UTF-8 text...' : 'Select `.yml` or `.yaml` files'}
        </label>

        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Loaded</div>
            <div className="mt-1 font-semibold text-slate-950">{uploadedFiles.length}</div>
          </div>
          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Size</div>
            <div className="mt-1 font-semibold text-slate-950">{formatBytes(totalBytes)}</div>
          </div>
          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">BOM</div>
            <div className="mt-1 font-semibold text-slate-950">{bomCount}</div>
          </div>
        </div>

        {uploadError ? <p className="text-sm text-rose-700">{uploadError}</p> : null}

        {rejectedFiles.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Rejected files</p>
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
          <ul className="max-h-56 space-y-2 overflow-auto rounded-2xl border border-slate-200 bg-white/70 p-3">
            {uploadedFiles.map((file) => (
              <li
                key={file.id}
                className="grid grid-cols-1 gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:grid-cols-[1fr_auto_auto]"
              >
                <span className="truncate font-medium text-slate-950">{file.name}</span>
                <span>{formatBytes(file.size)}</span>
                <span>{file.hadBom ? 'BOM detected' : 'No BOM'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">
            File text is kept in browser memory only. BOM is removed from internal text and tracked
            for future download options.
          </p>
        )}
      </div>
    </SectionCard>
  )

  const ollamaSection = (
    <SectionCard
      title="Ollama Connection"
      description="Browser-only connection to a local Ollama server running on your PC."
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div className="flex flex-col gap-3 rounded-2xl bg-slate-900 px-4 py-4 text-slate-100 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-300">Status</div>
            <div className="mt-1 font-semibold">
              {ollamaStatus === 'connected'
                ? 'Connected'
                : ollamaStatus === 'checking'
                  ? 'Checking...'
                  : ollamaStatus === 'failed'
                    ? 'Connection failed'
                    : 'Not checked'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCheckOllama}
            disabled={ollamaStatus === 'checking'}
            className="rounded-xl bg-amber-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ollamaStatus === 'checking' ? 'Checking' : 'Check Connection'}
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Endpoint</dt>
            <dd className="mt-1 font-medium text-slate-900">{DEFAULT_OLLAMA_ENDPOINT}</dd>
          </div>
          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">Models</dt>
            <dd className="mt-1 font-medium text-slate-900">{ollamaModels.length}</dd>
          </div>
        </dl>

        {ollamaModels.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Installed Models</p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
              {ollamaModels.map((model) => (
                <li key={model.name} className="rounded-xl bg-slate-50 px-3 py-2 font-medium">
                  {model.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ollamaStatus === 'failed' ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
            <p className="font-semibold">Unable to connect to Ollama.</p>
            {ollamaError ? <p className="mt-1">{ollamaError}</p> : null}
            <pre className="mt-3 overflow-auto rounded-xl bg-rose-950 px-3 py-2 text-xs text-rose-50">
              <code>OLLAMA_ORIGINS=https://YOUR_GITHUB_USERNAME.github.io ollama serve</code>
            </pre>
          </div>
        ) : null}
      </div>
    </SectionCard>
  )

  const settingsSection = (
    <SectionCard
      title="Translation Settings"
      description="Conservative defaults for line-preserving localization translation."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-700">
          <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Model</span>
          {ollamaModels.length > 0 ? (
            <select
              value={model}
              onChange={(event) => setModel(event.currentTarget.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-amber-500"
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
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-amber-500"
            />
          )}
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Batch Size</span>
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
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-amber-500"
          />
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Concurrency</span>
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
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-amber-500"
          />
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="block text-xs uppercase tracking-[0.18em] text-slate-500">Temperature</span>
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
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-amber-500"
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-2xl bg-slate-100 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Keep Alive</div>
          <div className="mt-1 font-semibold text-slate-950">30m</div>
        </div>
        <div className="rounded-2xl bg-slate-100 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Top P</div>
          <div className="mt-1 font-semibold text-slate-950">0.9</div>
        </div>
        <div className="rounded-2xl bg-slate-100 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Penalty</div>
          <div className="mt-1 font-semibold text-slate-950">1.05</div>
        </div>
        <div className="rounded-2xl bg-slate-100 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Max Chars</div>
          <div className="mt-1 font-semibold text-slate-950">12000</div>
        </div>
      </div>
    </SectionCard>
  )

  const progressSection = (
    <SectionCard
      title="Progress"
      description="Per-file and per-batch progress will be shown during translation."
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
            <span>Overall Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-200">
            <div
              className="h-3 rounded-full bg-amber-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Entries</div>
            <div className="mt-1 font-semibold text-slate-950">
              {translationProgress.completedEntries} / {localizationEntries.length}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Batches</div>
            <div className="mt-1 font-semibold text-slate-950">
              {translationProgress.completedBatches} / {batchCount}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-100 px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Failed</div>
            <div className="mt-1 font-semibold text-slate-950">
              {failedTranslationEntries.length || translationProgress.failedEntries}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleStartTranslation}
          disabled={localizationEntries.length === 0 || translationStatus === 'running'}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {translationStatus === 'running' ? 'Translating...' : 'Start Translation'}
        </button>

        <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          {translationStatus === 'done'
            ? 'Translation run finished.'
            : translationStatus === 'failed'
              ? 'Translation run stopped.'
              : localizationEntries.length > 0
                ? 'Ready to translate parsed entries.'
                : 'Waiting for files and Ollama connection.'}
        </div>

        {translationError ? <p className="text-sm text-rose-700">{translationError}</p> : null}
      </div>
    </SectionCard>
  )

  const resultSection = (
    <SectionCard
      title="Result Download"
      description="Translated files and failed entries will be available here after processing."
    >
      <div className="space-y-3">
        <label className="flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeBomOnDownload}
            onChange={(event) => setIncludeBomOnDownload(event.currentTarget.checked)}
            className="h-4 w-4"
          />
          Save as UTF-8 with BOM
        </label>
        <button
          type="button"
          disabled={translationResults.length === 0}
          onClick={handleDownloadFiles}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download translated files
        </button>
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500">
          Failed entries: {failedTranslationEntries.length}
        </div>
        {failedTranslationEntries.length > 0 ? (
          <ul className="max-h-40 space-y-2 overflow-auto rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            {failedTranslationEntries.map((failedEntry) => (
              <li key={failedEntry.entry.globalIndex}>
                {failedEntry.entry.fileName}:{failedEntry.entry.lineIndex + 1} {failedEntry.entry.key}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SectionCard>
  )

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f5e7b8_0%,#f6f1df_22%,#d8e1d2_58%,#d1d8e6_100%)] px-4 py-10 text-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 px-6 py-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">
                Browser-Only Translation Tool
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Paradox MOD YML Translator
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-700 sm:text-base">
                Upload localization files, connect to local Ollama, preserve line structure, and
                export translated `.yml` output without sending files to any server.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[24rem]">
              <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-300">Files</div>
                <div className="mt-2 text-2xl font-semibold">{uploadedFiles.length}</div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-slate-200">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Entries</div>
                <div className="mt-2 text-2xl font-semibold">{localizationEntries.length}</div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-slate-200">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Batches</div>
                <div className="mt-2 text-2xl font-semibold">{batchCount}</div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-slate-200">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Sections</div>
                <div className="mt-2 text-2xl font-semibold">{totalSections}</div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {fileUploadSection}
          {ollamaSection}
          {settingsSection}
          {progressSection}
          {resultSection}
        </section>
      </div>
    </main>
  )
}

export default App
