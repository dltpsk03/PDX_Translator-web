import JSZip from 'jszip'
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'

import { SectionCard } from './components/SectionCard'
import { createBatches } from './core/createBatches'
import {
  localizeParadoxRelativePath,
  PARADOX_LANGUAGES,
  type ParadoxLanguageCode,
} from './core/paradoxLanguages'
import { parseParadoxYml } from './core/parseParadoxYml'
import { readDroppedTextFiles } from './core/readDroppedTextFiles'
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
import { DEFAULT_OLLAMA_ENDPOINT } from './ollama/checkOllama'
import { DEFAULT_TRANSLATION_MODEL } from './ollama/translateBatch'
import { buildPrompt } from './ollama/buildPrompt'
import { parseGlossaryWithDiagnostics } from './prompt/parseGlossary'
import {
  getTranslationProvider,
  PROVIDER_OPTIONS,
  type ProviderId,
  type ProviderSettings,
} from './providers'
import type { LocalizationEntry, ParsedLine } from './types/paradox'
import type { RejectedUploadFile, UploadedTextFile } from './types/uploadedFile'

type UiLanguage = 'en' | 'ko'
type AppStep = 'prepare' | 'runResult' | 'review'
type ThemeMode = 'light' | 'dark'

type ParsedUploadedFile = {
  file: UploadedTextFile
  parsedLines: ParsedLine[]
}

type ConnectionStatus = 'idle' | 'checking' | 'connected' | 'failed'

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
  activeBatches: 0,
  retriedBatches: 0,
  recentError: null,
}

const settingsStorageKey = 'pdx-translator-settings-v1'
const sessionStorageKey = 'pdx-translator-session-v1'
const maxStoredSessionCharacters = 3_500_000

type StoredSettings = {
  providerId?: ProviderId
  endpoint?: string
  model?: string
  sourceLanguage?: ParadoxLanguageCode
  targetLanguage?: ParadoxLanguageCode
  batchSize?: number
  concurrency?: number
  temperature?: number
  retryAttempts?: number
  splitFailedBatches?: boolean
  includeBomOnDownload?: boolean
  customInstructions?: string
  glossaryText?: string
}

type StoredTranslationResult = {
  globalIndex: number
  translatedValue: string
  outputLine: string
  failed: boolean
}

type StoredSession = {
  files: UploadedTextFile[]
  results: StoredTranslationResult[]
  targetLanguage: ParadoxLanguageCode
}

function readStoredSettings(): StoredSettings {
  try {
    return JSON.parse(localStorage.getItem(settingsStorageKey) ?? '{}') as StoredSettings
  } catch {
    return {}
  }
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

function describeConnectionError(error: string) {
  const normalizedError = error.toLowerCase()

  if (normalizedError.includes('cors') || normalizedError.includes('failed to fetch')) {
    return `${error} Check browser CORS access, endpoint URL, or provider browser-access settings.`
  }

  if (
    normalizedError.includes('api key') ||
    normalizedError.includes('unauthorized') ||
    normalizedError.includes('401')
  ) {
    return `${error} Check that the API key is present and has access to this provider.`
  }

  if (
    normalizedError.includes('model') ||
    normalizedError.includes('not found') ||
    normalizedError.includes('404')
  ) {
    return `${error} Check the selected model name.`
  }

  if (
    normalizedError.includes('rate') ||
    normalizedError.includes('quota') ||
    normalizedError.includes('429')
  ) {
    return `${error} Lower concurrency or wait for the provider rate limit to reset.`
  }

  return error
}

function OllamaInfoPanel({ uiLanguage }: { uiLanguage: UiLanguage }) {
  const isKorean = uiLanguage === 'ko'
  const githubPagesOrigin = 'https://YOUR_GITHUB_USERNAME.github.io'

  return (
    <section className="border border-slate-300 bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <p className="text-xs font-semibold uppercase text-[#476a5f]">
          {isKorean ? 'Local Ollama Setup' : 'Local Ollama Setup'}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">
          {isKorean ? 'Ollama 연결 설정 안내' : 'Ollama Connection Guide'}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          {isKorean
            ? '이 앱은 브라우저에서 실행되지만 번역 요청은 사용자 PC의 Ollama로 직접 보냅니다. GitHub Pages에서 로컬 Ollama에 접근하려면 Ollama 실행 시 허용 origin을 지정해야 합니다.'
            : 'This app runs in the browser and sends translation requests directly to Ollama on your PC. When using GitHub Pages, Ollama must be started with an allowed origin.'}
        </p>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
        <div className="space-y-5">
          <div className="border-l-4 border-[#476a5f] bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-950">
              {isKorean ? '1. Ollama 설치' : '1. Install Ollama'}
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              {isKorean
                ? 'Windows용 Ollama를 설치한 뒤 터미널에서 ollama 명령을 사용할 수 있는지 확인합니다.'
                : 'Install Ollama for Windows and confirm the ollama command is available in a terminal.'}
            </p>
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-[#476a5f]"
            >
              https://ollama.com/download
            </a>
          </div>

          <div className="border-l-4 border-[#476a5f] bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-950">
              {isKorean ? '2. 번역 모델 다운로드' : '2. Pull the Translation Model'}
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              {isKorean
                ? '기본 모델은 gemma4:e4b입니다. 다른 모델을 사용할 수도 있지만, 앱의 모델 입력값과 Ollama에 설치된 모델명이 일치해야 합니다.'
                : 'The default model is gemma4:e4b. Other models can be used, but the app model value must match an installed Ollama model name.'}
            </p>
            <pre className="mt-3 overflow-auto bg-slate-950 p-3 text-sm text-slate-50">
              <code>ollama pull gemma4:e4b</code>
            </pre>
          </div>

          <div className="border-l-4 border-[#d7b36b] bg-[#fff8e7] px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-950">
              {isKorean ? '3. GitHub Pages origin 허용 후 Ollama 실행' : '3. Start Ollama with GitHub Pages Origin Allowed'}
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              {isKorean
                ? '아래 주소의 YOUR_GITHUB_USERNAME을 실제 GitHub 사용자명으로 바꿔서 실행합니다. 보안을 위해 기본 안내에서는 OLLAMA_ORIGINS=*를 사용하지 않습니다.'
                : 'Replace YOUR_GITHUB_USERNAME with your real GitHub username. The default guidance does not use OLLAMA_ORIGINS=*.'}
            </p>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-600">
                  {isKorean ? 'CMD 명령 프롬프트' : 'CMD Command Prompt'}
                </div>
                <pre className="mt-2 overflow-auto bg-slate-950 p-3 text-sm text-slate-50">
                  <code>{`set OLLAMA_ORIGINS=${githubPagesOrigin} && ollama serve`}</code>
                </pre>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase text-slate-600">
                  {isKorean ? 'PowerShell' : 'PowerShell'}
                </div>
                <pre className="mt-2 overflow-auto bg-slate-950 p-3 text-sm text-slate-50">
                  <code>{`$env:OLLAMA_ORIGINS="${githubPagesOrigin}"; ollama serve`}</code>
                </pre>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-700">
              {isKorean
                ? '이미 Ollama가 백그라운드에서 실행 중이면 기존 프로세스를 종료한 뒤 위 명령으로 다시 실행해야 origin 설정이 적용됩니다.'
                : 'If Ollama is already running in the background, stop it first and start it again with the command above so the origin setting takes effect.'}
            </p>
          </div>

          <div className="border-l-4 border-[#476a5f] bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-950">
              {isKorean ? '4. 앱에서 연결 확인' : '4. Check the Connection in the App'}
            </h3>
            <p className="mt-2 text-sm text-slate-700">
              {isKorean
                ? '번역 화면으로 돌아가서 Ollama Connection의 Check Connection을 누릅니다. 연결되면 설치된 모델 목록이 표시되고 번역을 시작할 수 있습니다.'
                : 'Return to the translator, press Check Connection in Ollama Connection, and confirm that installed models appear before translating.'}
            </p>
          </div>
        </div>

          <div className="border-l-4 border-[#1f2f2a] bg-white px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-950">
              {isKorean ? '5. 외부 API Provider 적용 방법' : '5. External API Provider Setup'}
            </h3>
            <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
              <div className="border border-slate-300 bg-slate-50 p-3">
                <div className="font-semibold text-slate-950">Google Gemini API</div>
                <p className="mt-1">
                  {isKorean
                    ? 'Google AI Studio에서 API 키를 발급하고 Provider를 Google Gemini API로 선택한 뒤 API 키와 모델명을 입력합니다.'
                    : 'Create an API key in Google AI Studio, choose Google Gemini API, then enter the API key and model name.'}
                </p>
              </div>
              <div className="border border-slate-300 bg-slate-50 p-3">
                <div className="font-semibold text-slate-950">OpenAI GPT</div>
                <p className="mt-1">
                  {isKorean
                    ? 'OpenAI API 키를 입력하고 Responses API에서 사용할 모델명을 직접 입력합니다. 파일 내용은 OpenAI API로 전송됩니다.'
                    : 'Enter an OpenAI API key and the model name to use with the Responses API. File contents are sent to OpenAI.'}
                </p>
              </div>
              <div className="border border-slate-300 bg-slate-50 p-3">
                <div className="font-semibold text-slate-950">Anthropic Claude</div>
                <p className="mt-1">
                  {isKorean
                    ? 'Anthropic API 키와 Claude 모델명을 입력합니다. 브라우저 직접 호출이 차단되면 provider 오류로 표시됩니다.'
                    : 'Enter an Anthropic API key and Claude model name. If direct browser access is blocked, the app will show the provider error.'}
                </p>
              </div>
            </div>
          </div>

        <aside className="border border-slate-300 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase text-slate-500">
            {isKorean ? '현재 앱 기본값' : 'Current App Defaults'}
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
              <dt className="font-semibold text-slate-500">Generation</dt>
              <dd className="mt-1 text-slate-950">think: false, temperature 0.1</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Batch</dt>
              <dd className="mt-1 text-slate-950">20 lines, concurrency 30</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Origin</dt>
              <dd className="mt-1 break-all text-slate-950">{githubPagesOrigin}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  )
}

function App() {
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('ko')
  const t = copy[uiLanguage]
  const [storedSettings] = useState(readStoredSettings)
  const [activeStep, setActiveStep] = useState<AppStep>('prepare')
  const [themeMode, setThemeMode] = useState<ThemeMode>('light')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedTextFile[]>([])
  const [parsedFiles, setParsedFiles] = useState<ParsedUploadedFile[]>([])
  const [localizationEntries, setLocalizationEntries] = useState<LocalizationEntry[]>([])
  const [rejectedFiles, setRejectedFiles] = useState<RejectedUploadFile[]>([])
  const [isReadingFiles, setIsReadingFiles] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [providerStatus, setProviderStatus] = useState<ConnectionStatus>('idle')
  const [providerCheckDetail, setProviderCheckDetail] = useState<string | null>(null)
  const [providerModels, setProviderModels] = useState<string[]>([])
  const [providerError, setProviderError] = useState<string | null>(null)
  const [providerId, setProviderId] = useState<ProviderId>(storedSettings.providerId ?? 'ollama')
  const [endpoint, setEndpoint] = useState(storedSettings.endpoint ?? DEFAULT_OLLAMA_ENDPOINT)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(storedSettings.model ?? DEFAULT_TRANSLATION_MODEL)
  const [sourceLanguage, setSourceLanguage] = useState<ParadoxLanguageCode>(
    storedSettings.sourceLanguage ?? 'l_english',
  )
  const [targetLanguage, setTargetLanguage] = useState<ParadoxLanguageCode>(
    storedSettings.targetLanguage ?? 'l_korean',
  )
  const [batchSize, setBatchSize] = useState(storedSettings.batchSize ?? 20)
  const [concurrency, setConcurrency] = useState(storedSettings.concurrency ?? 30)
  const [temperature, setTemperature] = useState(storedSettings.temperature ?? 0.1)
  const [retryAttempts, setRetryAttempts] = useState(storedSettings.retryAttempts ?? 1)
  const [splitFailedBatches, setSplitFailedBatches] = useState(
    storedSettings.splitFailedBatches ?? true,
  )
  const [translationStatus, setTranslationStatus] = useState<
    'idle' | 'running' | 'done' | 'failed' | 'stopped'
  >('idle')
  const [translationProgress, setTranslationProgress] =
    useState<TranslationProgress>(initialProgress)
  const [translationError, setTranslationError] = useState<string | null>(null)
  const [failedTranslationEntries, setFailedTranslationEntries] = useState<
    TranslatedEntryResult[]
  >([])
  const [translationResults, setTranslationResults] = useState<TranslatedEntryResult[]>([])
  const [includeBomOnDownload, setIncludeBomOnDownload] = useState(
    storedSettings.includeBomOnDownload ?? true,
  )
  const [showOllamaInfo, setShowOllamaInfo] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [customInstructions, setCustomInstructions] = useState(
    storedSettings.customInstructions ?? '',
  )
  const [glossaryText, setGlossaryText] = useState(storedSettings.glossaryText ?? '')
  const [glossaryFileName, setGlossaryFileName] = useState<string | null>(null)
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const [translationStartedAt, setTranslationStartedAt] = useState<number | null>(null)
  const [translationFinishedAt, setTranslationFinishedAt] = useState<number | null>(null)
  const [externalApiConfirmed, setExternalApiConfirmed] = useState(false)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)
  const [sessionSavedAt, setSessionSavedAt] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const totalBytes = uploadedFiles.reduce((sum, file) => sum + file.size, 0)
  const bomCount = uploadedFiles.filter((file) => file.hadBom).length
  const normalizedBatchSize = Number.isFinite(batchSize) ? batchSize : 20
  const normalizedConcurrency = Number.isFinite(concurrency) ? concurrency : 30
  const normalizedTemperature = Number.isFinite(temperature) ? temperature : 0.1
  const normalizedRetryAttempts = Number.isFinite(retryAttempts) ? retryAttempts : 1
  const glossaryDiagnostics = parseGlossaryWithDiagnostics(glossaryText)
  const glossaryEntries = glossaryDiagnostics.entries
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
  const elapsedSeconds =
    translationStartedAt && (translationProgress.completedEntries > 0 || translationStatus === 'running')
      ? Math.max(
          1,
          Math.round(((translationFinishedAt ?? Date.now()) - translationStartedAt) / 1000),
        )
      : 0
  const entriesPerMinute =
    elapsedSeconds > 0
      ? Math.round((translationProgress.completedEntries / elapsedSeconds) * 60)
      : 0
  const remainingEntries = Math.max(
    0,
    translationProgress.totalEntries - translationProgress.completedEntries,
  )
  const etaMinutes =
    entriesPerMinute > 0 ? Math.ceil(remainingEntries / entriesPerMinute) : null
  const elapsedTimeText =
    elapsedSeconds > 0
      ? `${Math.floor(elapsedSeconds / 60)}m ${String(elapsedSeconds % 60).padStart(2, '0')}s`
      : '-'
  const successfulEntries = translationResults.filter((result) => !result.failed).length
  const originalKeptEntries = translationResults.filter((result) => result.failed).length
  const translationResultMap = createTranslationResultMap(translationResults)
  const unchangedTranslationCount = translationResults.filter(
    (result) => !result.failed && result.translatedValue === result.entry.value,
  ).length
  const missingResultCount = Math.max(0, localizationEntries.length - translationResults.length)
  const reviewFileStats = parsedFiles.map((parsedFile) => {
    const entries = parsedFile.parsedLines.filter(
      (line): line is LocalizationEntry => line.type === 'entry',
    )
    const translated = entries.filter((entry) => {
      const result = translationResultMap.get(entry.globalIndex)
      return result && !result.failed
    }).length
    const failed = entries.filter((entry) => translationResultMap.get(entry.globalIndex)?.failed)
      .length

    return {
      fileName: parsedFile.file.relativePath,
      total: entries.length,
      translated,
      failed,
    }
  })
  const previewFile = parsedFiles[0]
  const previewLines =
    previewFile?.parsedLines
      .filter((line): line is LocalizationEntry => line.type === 'entry')
      .slice(0, 12)
      .map((entry) => ({
        key: entry.key,
        original: entry.value,
        translated: translationResultMap.get(entry.globalIndex)?.translatedValue ?? entry.value,
      })) ?? []
  const canUseExternalApi = providerId === 'ollama' || externalApiConfirmed
  const prepareReady =
    uploadedFiles.length > 0 &&
    localizationEntries.length > 0 &&
    providerStatus === 'connected' &&
    canUseExternalApi &&
    sourceLanguage !== targetLanguage
  const selectedProvider = getTranslationProvider(providerId)
  const statusLabel =
    providerStatus === 'connected'
      ? t.connected
      : providerStatus === 'checking'
        ? t.checking
        : providerStatus === 'failed'
          ? t.connectionFailed
          : t.notChecked
  const providerSettings: ProviderSettings = {
    provider: providerId,
    endpoint,
    apiKey,
    model,
    temperature: normalizedTemperature,
    topP: 0.9,
    repeatPenalty: 1.05,
    keepAlive: '30m',
    sourceLanguage,
    targetLanguage,
    customInstructions,
    glossaryEntries,
  }
  const sourceLanguageLabel = uiLanguage === 'ko' ? '시작 언어' : 'Source Language'
  const targetLanguageLabel = uiLanguage === 'ko' ? '도착 언어' : 'Target Language'
  const sameLanguageWarning =
    uiLanguage === 'ko'
      ? '시작 언어와 도착 언어가 같습니다.'
      : 'Source and target languages are the same.'
  const engineTitle = uiLanguage === 'ko' ? '번역 엔진' : 'Translation Engine'
  const engineDesc =
    uiLanguage === 'ko'
      ? '로컬 Ollama 또는 사용자 API 키로 외부 LLM을 선택합니다.'
      : 'Choose local Ollama or an external LLM with your own API key.'
  const providerLabel = uiLanguage === 'ko' ? '회사 / Provider' : 'Company / Provider'
  const apiKeyLabel = uiLanguage === 'ko' ? 'API 키' : 'API Key'
  const folderDropText =
    uiLanguage === 'ko'
      ? '파일 또는 폴더를 여기로 드래그하거나 클릭해서 선택하세요.'
      : 'Drag files or folders here, or click to choose files.'
  const outputZipText =
    uiLanguage === 'ko'
      ? '결과는 원본 폴더 구조를 유지한 OUTPUT.zip으로 저장됩니다.'
      : 'Results are saved as OUTPUT.zip with the original folder structure.'
  const providerPrivacyText =
    providerId === 'ollama'
      ? uiLanguage === 'ko'
        ? '파일 내용은 로컬 PC의 Ollama로만 전송됩니다.'
        : 'File contents are sent only to Ollama on your PC.'
      : uiLanguage === 'ko'
        ? '외부 API 사용 시 번역할 파일 내용이 선택한 provider로 전송되며 요금이 발생할 수 있습니다.'
        : 'External APIs receive the text being translated and may incur usage costs.'
  const providerSetupText =
    providerId === 'ollama'
      ? uiLanguage === 'ko'
        ? '로컬 Ollama는 PC 성능에 따라 동시 요청을 조정하세요. 실패가 늘면 동시 요청을 낮추는 것이 좋습니다.'
        : 'Tune concurrency for your local PC. If failures increase, lower the concurrent request count.'
      : providerId === 'claude'
        ? uiLanguage === 'ko'
          ? 'Claude는 Anthropic API 키와 모델 ID가 필요합니다. 기본값: claude-sonnet-4-6'
          : 'Claude requires an Anthropic API key and model ID. Default: claude-sonnet-4-6.'
        : providerId === 'openai'
          ? uiLanguage === 'ko'
            ? 'OpenAI는 Responses API를 사용합니다. 모델명과 API 키 권한을 확인하세요.'
            : 'OpenAI uses the Responses API. Confirm the model name and API key permissions.'
          : uiLanguage === 'ko'
            ? 'Gemini는 Google AI Studio API 키를 사용합니다. 브라우저 호출이 차단되면 provider 오류로 표시됩니다.'
            : 'Gemini uses a Google AI Studio API key. Browser access issues appear as provider errors.'
  const promptTitle = uiLanguage === 'ko' ? '프롬프트 / 용어집' : 'Prompt / Glossary'
  const promptDesc =
    uiLanguage === 'ko'
      ? '고정 구조 보존 규칙에 추가 지시사항과 용어집을 더합니다.'
      : 'Add custom instructions and glossary terms without replacing the core safety rules.'
  const promptPreviewText = buildPrompt(
    {
      batchIndex: 0,
      entries: [],
      promptText:
        localizationEntries[0]?.rawLine ?? ' sample_key:0 "Sample localization text."',
      charCount: 0,
    },
    {
      sourceLanguage,
      targetLanguage,
      customInstructions,
      glossaryEntries,
    },
  )
  const steps: Array<{
    id: AppStep
    label: string
    detail: string
    status: string
  }> = [
    {
      id: 'prepare',
      label: uiLanguage === 'ko' ? '1 준비' : '1 Prepare',
      detail: uiLanguage === 'ko' ? '파일, 엔진, 선택 옵션' : 'Files, engine, optional controls',
      status: prepareReady ? 'OK' : uiLanguage === 'ko' ? '필요' : 'Required',
    },
    {
      id: 'runResult',
      label: uiLanguage === 'ko' ? '2 실행 / 결과' : '2 Run / Result',
      detail: uiLanguage === 'ko' ? '진행, 다운로드, 재시도' : 'Progress, download, retry',
      status: translationStatus === 'running' ? (uiLanguage === 'ko' ? '진행중' : 'Running') : '',
    },
    {
      id: 'review',
      label: uiLanguage === 'ko' ? '3 검토' : '3 Review',
      detail: uiLanguage === 'ko' ? '파일별, 실패, 품질' : 'Files, failures, quality',
      status:
        failedTranslationEntries.length > 0
          ? `${failedTranslationEntries.length}`
          : translationResults.length > 0
            ? 'OK'
            : '',
    },
  ]

  useEffect(() => {
    const settings: StoredSettings = {
      providerId,
      endpoint,
      model,
      sourceLanguage,
      targetLanguage,
      batchSize: normalizedBatchSize,
      concurrency: normalizedConcurrency,
      temperature: normalizedTemperature,
      retryAttempts: normalizedRetryAttempts,
      splitFailedBatches,
      includeBomOnDownload,
      customInstructions,
      glossaryText,
    }

    localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
  }, [
    providerId,
    endpoint,
    model,
    sourceLanguage,
    targetLanguage,
    normalizedBatchSize,
    normalizedConcurrency,
    normalizedTemperature,
    normalizedRetryAttempts,
    splitFailedBatches,
    includeBomOnDownload,
    customInstructions,
    glossaryText,
  ])

  useEffect(() => {
    if (uploadedFiles.length === 0) {
      localStorage.removeItem(sessionStorageKey)
      setSessionSavedAt(null)
      return
    }

    const session: StoredSession = {
      files: uploadedFiles,
      targetLanguage,
      results: translationResults.map((result) => ({
        globalIndex: result.entry.globalIndex,
        translatedValue: result.translatedValue,
        outputLine: result.outputLine,
        failed: result.failed,
      })),
    }
    const serializedSession = JSON.stringify(session)

    if (serializedSession.length > maxStoredSessionCharacters) {
      setSessionSavedAt(null)
      return
    }

    try {
      localStorage.setItem(sessionStorageKey, serializedSession)
      setSessionSavedAt(new Date().toLocaleTimeString())
    } catch {
      setSessionSavedAt(null)
    }
  }, [uploadedFiles, targetLanguage, translationResults])

  useEffect(() => {
    const storedSessionText = localStorage.getItem(sessionStorageKey)

    if (!storedSessionText || uploadedFiles.length > 0) {
      return
    }

    try {
      const storedSession = JSON.parse(storedSessionText) as StoredSession
      let globalIndexStart = 0
      const nextParsedFiles = storedSession.files.map((file) => {
        const parsedLines = parseParadoxYml(file.text, {
          fileName: file.relativePath,
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
      const entryMap = new Map(nextEntries.map((entry) => [entry.globalIndex, entry]))
      const restoredResults = storedSession.results.flatMap((storedResult) => {
        const entry = entryMap.get(storedResult.globalIndex)

        return entry
          ? [
              {
                entry,
                translatedValue: storedResult.translatedValue,
                outputLine: storedResult.outputLine,
                failed: storedResult.failed,
                errors: [],
              },
            ]
          : []
      })

      setUploadedFiles(storedSession.files)
      setParsedFiles(nextParsedFiles)
      setLocalizationEntries(nextEntries)
      setTranslationResults(restoredResults)
      setFailedTranslationEntries(restoredResults.filter((result) => result.failed))
      setTranslationProgress({
        ...initialProgress,
        totalEntries: nextEntries.length,
        totalBatches:
          nextEntries.length > 0
            ? createBatches(nextEntries, { maxLines: normalizedBatchSize, maxChars: 12000 }).length
            : 0,
        completedEntries: restoredResults.length,
      })
      setRestoreNotice(
        uiLanguage === 'ko'
          ? '이전 작업을 브라우저 저장소에서 복구했습니다.'
          : 'Restored the previous workspace from browser storage.',
      )
    } catch {
      localStorage.removeItem(sessionStorageKey)
    }
  }, [normalizedBatchSize, uiLanguage, uploadedFiles.length])

  function applyUploadResult(result: Awaited<ReturnType<typeof readUploadedTextFiles>>) {
    let globalIndexStart = 0
    const nextParsedFiles = result.files.map((file) => {
      const parsedLines = parseParadoxYml(file.text, {
        fileName: file.relativePath,
        globalIndexStart,
      })
      const entries = parsedLines.filter((line): line is LocalizationEntry => line.type === 'entry')

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
    setRestoreNotice(null)
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = event.currentTarget.files

    if (!selectedFiles?.length) {
      return
    }

    setIsReadingFiles(true)
    setUploadError(null)

    try {
      applyUploadResult(await readUploadedTextFiles(selectedFiles))
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

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragActive(false)
    setIsReadingFiles(true)
    setUploadError(null)

    try {
      applyUploadResult(await readDroppedTextFiles(event.dataTransfer))
    } catch {
      setUploadError(t.uploadError)
      setUploadedFiles([])
      setParsedFiles([])
      setLocalizationEntries([])
      setRejectedFiles([])
    } finally {
      setIsReadingFiles(false)
    }
  }

  async function handleCheckProvider() {
    setProviderStatus('checking')
    setProviderError(null)
    setProviderCheckDetail(null)
    setProviderModels([])

    const result = await selectedProvider.checkConnection(providerSettings)

    if (result.ok) {
      setProviderStatus('connected')
      setProviderCheckDetail(result.detail ?? null)
      setProviderModels(result.models ?? [])
      if (result.models?.length && !result.models.includes(model)) {
        setModel(result.models[0])
      }
      return
    }

    setProviderStatus('failed')
    setProviderError(describeConnectionError(result.error))
  }

  function mergeTranslationResults(
    currentResults: TranslatedEntryResult[],
    nextResults: TranslatedEntryResult[],
  ) {
    const resultMap = new Map(
      currentResults.map((result) => [result.entry.globalIndex, result]),
    )

    for (const result of nextResults) {
      resultMap.set(result.entry.globalIndex, result)
    }

    return [...resultMap.values()].toSorted((a, b) => a.entry.globalIndex - b.entry.globalIndex)
  }

  async function runTranslationForEntries(entries: LocalizationEntry[], retryOnly = false) {
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    setTranslationStartedAt(Date.now())
    setTranslationFinishedAt(null)
    setTranslationStatus('running')
    setTranslationError(null)
    if (!retryOnly) {
      setFailedTranslationEntries([])
      setTranslationResults([])
    }

      const result = await runTranslation({
        entries,
        batchSize: normalizedBatchSize,
        concurrency: normalizedConcurrency,
        retryAttempts: normalizedRetryAttempts,
        splitFailedBatches,
        signal: abortController.signal,
      translateBatch: (batch) =>
        selectedProvider.translateBatch(batch, providerSettings, abortController.signal),
      onProgress: setTranslationProgress,
    })

    const mergedResults = retryOnly
      ? mergeTranslationResults(translationResults, result.results)
      : result.results
    const mergedFailedEntries = mergedResults.filter((mergedResult) => mergedResult.failed)

    setTranslationProgress(result.progress)
    setTranslationResults(mergedResults)
    setFailedTranslationEntries(mergedFailedEntries)
    setTranslationStatus('done')
    setTranslationFinishedAt(Date.now())
    abortControllerRef.current = null
  }

  async function handleStartTranslation() {
    if (localizationEntries.length === 0 || translationStatus === 'running') {
      return
    }

    try {
      await runTranslationForEntries(localizationEntries)
    } catch (error) {
      abortControllerRef.current = null
      if (error instanceof DOMException && error.name === 'AbortError') {
        setTranslationStatus('stopped')
        setTranslationFinishedAt(Date.now())
        return
      }

      setTranslationStatus('failed')
      setTranslationError(error instanceof Error ? error.message : 'Translation failed.')
    }
  }

  async function handleRetryFailedEntries() {
    if (failedTranslationEntries.length === 0 || translationStatus === 'running') {
      return
    }

    try {
      await runTranslationForEntries(
        failedTranslationEntries.map((failedEntry) => failedEntry.entry),
        true,
      )
    } catch (error) {
      abortControllerRef.current = null
      if (error instanceof DOMException && error.name === 'AbortError') {
        setTranslationStatus('stopped')
        setTranslationFinishedAt(Date.now())
        return
      }

      setTranslationStatus('failed')
      setTranslationError(error instanceof Error ? error.message : 'Retry failed.')
    }
  }

  function handleStopTranslation() {
    abortControllerRef.current?.abort()
  }

  function handleKeepOriginalsForFailedEntries() {
    setFailedTranslationEntries([])
    setTranslationStatus('done')
  }

  async function handleGlossaryUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      setGlossaryFileName(file.name)
      setGlossaryText((current) => [current.trim(), text.trim()].filter(Boolean).join('\n'))
    } finally {
      event.currentTarget.value = ''
    }
  }

  function handleDownloadGlossary() {
    if (!glossaryText.trim()) {
      return
    }

    downloadBlob(
      'glossary.txt',
      new Blob([glossaryText], {
        type: 'text/plain;charset=utf-8',
      }),
    )
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
      name: `OUTPUT/${localizeParadoxRelativePath(parsedFile.file.relativePath, targetLanguage)}`,
      text: rebuildParadoxYml(parsedFile.parsedLines, translationResultMap, {
        targetLanguage,
      }).text,
    }))

    if (rebuiltFiles.length === 0) {
      return
    }

    const zip = new JSZip()

    for (const file of rebuiltFiles) {
      zip.file(file.name, createDownloadText(file.text))
    }

    downloadBlob(
      'OUTPUT.zip',
      await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
      }),
    )
  }

  return (
    <main data-theme={themeMode} className="app-shell min-h-screen bg-[#f5f6f2] text-slate-950">
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
              onClick={() => setThemeMode((current) => (current === 'light' ? 'dark' : 'light'))}
              className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-[#476a5f]"
            >
              {themeMode === 'light'
                ? uiLanguage === 'ko'
                  ? '다크 모드'
                  : 'Dark Mode'
                : uiLanguage === 'ko'
                  ? '라이트 모드'
                  : 'Light Mode'}
            </button>
            <button
              type="button"
              onClick={() => setShowOllamaInfo((current) => !current)}
              className="border border-[#1f2f2a] bg-[#1f2f2a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#30473f]"
            >
              {showOllamaInfo
                ? uiLanguage === 'ko'
                  ? '번역 화면으로 돌아가기'
                  : 'Back to Translator'
                : uiLanguage === 'ko'
                  ? '설정 안내'
                  : 'Setup Guide'}
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
          <OllamaInfoPanel uiLanguage={uiLanguage} />
        ) : (
          <>
        <section className="mb-5 grid grid-cols-2 gap-4 border border-slate-300 bg-white p-4 lg:grid-cols-4">
          <Metric label={t.files} value={uploadedFiles.length} />
          <Metric label={t.entries} value={localizationEntries.length} />
          <Metric label={t.batches} value={batchCount} />
          <Metric label={t.failed} value={failedTranslationEntries.length} />
        </section>

        {restoreNotice || sessionSavedAt ? (
          <div className="mb-5 border border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
            {restoreNotice ? <span>{restoreNotice}</span> : null}
            {sessionSavedAt ? (
              <span className={restoreNotice ? 'ml-2' : ''}>
                {uiLanguage === 'ko'
                  ? `작업 자동 저장: ${sessionSavedAt}`
                  : `Workspace autosaved: ${sessionSavedAt}`}
              </span>
            ) : null}
          </div>
        ) : null}

        <nav className="mb-5 grid grid-cols-3 border border-slate-300 bg-white p-1">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
              className={`px-4 py-3 text-left transition ${
                activeStep === step.id
                  ? 'bg-[#1f2f2a] text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{step.label}</span>
                {step.status ? (
                  <span
                    className={`text-[11px] font-semibold uppercase ${
                      activeStep === step.id ? 'text-[#d7b36b]' : 'text-[#476a5f]'
                    }`}
                  >
                    {step.status}
                  </span>
                ) : null}
              </span>
              <span
                className={`mt-1 block text-xs ${
                  activeStep === step.id ? 'text-slate-200' : 'text-slate-500'
                }`}
              >
                {step.detail}
              </span>
            </button>
          ))}
        </nav>

        <section
          className={
            activeStep === 'review'
              ? 'grid grid-cols-1 gap-4'
              : 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]'
          }
        >
          <div className="space-y-4">
            {activeStep === 'runResult' ? (
            <SectionCard title={t.fileUpload} description={t.fileUploadDesc}>
              <div className="space-y-4">
                <label
                  onDragEnter={(event) => {
                    event.preventDefault()
                    setIsDragActive(true)
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragActive(false)}
                  onDrop={handleDrop}
                  className={`flex min-h-32 cursor-pointer items-center justify-center border border-dashed px-4 py-6 text-center text-sm font-semibold transition hover:border-[#476a5f] hover:bg-white ${
                    isDragActive
                      ? 'border-[#476a5f] bg-white text-slate-950'
                      : 'border-slate-400 bg-[#fbfcf8] text-slate-700'
                  }`}
                >
                  <input
                    type="file"
                    accept=".yml,.yaml"
                    multiple
                    {...({ webkitdirectory: '' } as Record<string, string>)}
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  {isReadingFiles ? t.readingFiles : folderDropText}
                </label>
                <p className="text-xs text-slate-500">{outputZipText}</p>

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
            ) : null}

            {activeStep === 'prepare' ? (
              <SectionCard title={engineTitle} description={engineDesc}>
                <div className="space-y-4 text-sm text-slate-700">
                  <label className="space-y-1 text-sm text-slate-700">
                    <span className="block text-xs font-semibold uppercase text-slate-500">
                      {providerLabel}
                    </span>
                    <select
                      value={providerId}
                      onChange={(event) => {
                        const nextProviderId = event.currentTarget.value as ProviderId
                        const nextProvider = getTranslationProvider(nextProviderId)

                        setProviderId(nextProviderId)
                        setModel(nextProvider.defaultModel)
                        setProviderStatus('idle')
                        setProviderCheckDetail(null)
                        setProviderError(null)
                        setProviderModels([])
                        setExternalApiConfirmed(nextProviderId === 'ollama')
                      }}
                      className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                    >
                      {PROVIDER_OPTIONS.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-3 border border-slate-300 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        {t.status}
                      </div>
                      <div className="mt-1 font-semibold text-slate-950">{statusLabel}</div>
                      {providerCheckDetail ? (
                        <div className="mt-1 text-xs text-slate-500">{providerCheckDetail}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleCheckProvider}
                      disabled={providerStatus === 'checking'}
                      className="bg-[#d7b36b] px-4 py-2 font-semibold text-slate-950 transition hover:bg-[#e5c77e] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {providerStatus === 'checking' ? t.checking : t.checkConnection}
                    </button>
                  </div>

                  <div className="border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      {uiLanguage === 'ko' ? 'Provider 설정' : 'Provider Setup'}
                    </div>
                    <p className="mt-1">{providerSetupText}</p>
                  </div>

                  <div
                    className={
                      providerId === 'ollama'
                        ? 'border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700'
                        : 'border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900'
                    }
                  >
                    {providerPrivacyText}
                    {providerId !== 'ollama' ? (
                      <label className="mt-3 flex items-start gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={externalApiConfirmed}
                          onChange={(event) =>
                            setExternalApiConfirmed(event.currentTarget.checked)
                          }
                          className="mt-1 h-4 w-4"
                        />
                        <span>
                          {uiLanguage === 'ko'
                            ? '번역할 파일 내용이 선택한 외부 API로 전송되는 것을 확인했습니다.'
                            : 'I understand that file contents will be sent to the selected external API.'}
                        </span>
                      </label>
                    ) : null}
                  </div>

                  {providerStatus === 'failed' ? (
                    <div className="border border-red-200 bg-red-50 px-3 py-3 text-red-900">
                      <p className="font-semibold">{t.unableToConnect}</p>
                      {providerError ? <p className="mt-1">{providerError}</p> : null}
                    </div>
                  ) : null}
                </div>
              </SectionCard>
            ) : null}

            {activeStep === 'runResult' ? (
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
                    value={`${translationProgress.completedEntries} / ${
                      translationProgress.totalEntries || localizationEntries.length
                    }`}
                  />
                  <Metric
                    label={t.batches}
                    value={`${translationProgress.completedBatches} / ${
                      translationProgress.totalBatches || batchCount
                    }`}
                  />
                  <Metric
                    label={t.failed}
                    value={failedTranslationEntries.length || translationProgress.failedEntries}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                  <Metric
                    label={uiLanguage === 'ko' ? '처리 중' : 'Active'}
                    value={translationProgress.activeBatches}
                  />
                  <Metric
                    label={uiLanguage === 'ko' ? '재시도' : 'Retries'}
                    value={translationProgress.retriedBatches}
                  />
                  <Metric
                    label={uiLanguage === 'ko' ? '속도' : 'Speed'}
                    value={entriesPerMinute ? `${entriesPerMinute}/min` : '-'}
                  />
                  <Metric
                    label={uiLanguage === 'ko' ? '남은 시간' : 'ETA'}
                    value={etaMinutes === null ? '-' : `${etaMinutes}m`}
                  />
                  <Metric
                    label={uiLanguage === 'ko' ? '소요 시간' : 'Elapsed'}
                    value={elapsedTimeText}
                  />
                </div>

                {translationProgress.recentError ? (
                  <div className="border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                    <span className="font-semibold">
                      {uiLanguage === 'ko' ? '최근 재시도 사유' : 'Latest retry reason'}:
                    </span>{' '}
                    {translationProgress.recentError}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleStartTranslation}
                    disabled={
                      localizationEntries.length === 0 ||
                      translationStatus === 'running' ||
                      sourceLanguage === targetLanguage ||
                      !canUseExternalApi
                    }
                    className="bg-[#1f2f2a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#30473f] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {translationStatus === 'running' ? t.translating : t.startTranslation}
                  </button>
                  <button
                    type="button"
                    onClick={handleStopTranslation}
                    disabled={translationStatus !== 'running'}
                    className="border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-[#476a5f] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uiLanguage === 'ko' ? '중단' : 'Stop'}
                  </button>
                </div>

                <div className="border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  {translationStatus === 'done'
                    ? t.finished
                    : translationStatus === 'stopped'
                      ? t.stopped
                    : translationStatus === 'failed'
                      ? t.stopped
                      : localizationEntries.length > 0
                        ? t.ready
                        : t.waiting}
                </div>

                {translationError ? (
                  <p className="text-sm text-red-700">{translationError}</p>
                ) : null}
                {sourceLanguage === targetLanguage ? (
                  <p className="text-sm text-red-700">{sameLanguageWarning}</p>
                ) : null}
                {!canUseExternalApi ? (
                  <p className="text-sm text-amber-800">
                    {uiLanguage === 'ko'
                      ? '외부 API 전송 확인을 체크해야 번역을 시작할 수 있습니다.'
                      : 'Confirm external API transfer before starting translation.'}
                  </p>
                ) : null}
              </div>
            </SectionCard>
            ) : null}
          </div>

          <div className="space-y-4">
            {false && activeStep === 'prepare' ? (
            <SectionCard title={engineTitle} description={engineDesc}>
              <div className="space-y-4 text-sm text-slate-700">
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {providerLabel}
                  </span>
                  <select
                    value={providerId}
                    onChange={(event) => {
                      const nextProviderId = event.currentTarget.value as ProviderId
                      const nextProvider = getTranslationProvider(nextProviderId)

                      setProviderId(nextProviderId)
                      setModel(nextProvider.defaultModel)
                      setProviderStatus('idle')
                      setProviderCheckDetail(null)
                      setProviderError(null)
                      setProviderModels([])
                      setExternalApiConfirmed(nextProviderId === 'ollama')
                    }}
                    className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                  >
                    {PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-3 border border-slate-300 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="text-xs font-semibold uppercase text-slate-500">{t.status}</div>
                    <div className="mt-1 font-semibold text-slate-950">{statusLabel}</div>
                    {providerCheckDetail ? (
                      <div className="mt-1 text-xs text-slate-500">{providerCheckDetail}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckProvider}
                    disabled={providerStatus === 'checking'}
                    className="bg-[#d7b36b] px-4 py-2 font-semibold text-slate-950 transition hover:bg-[#e5c77e] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {providerStatus === 'checking' ? t.checking : t.checkConnection}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Provider" value={selectedProvider.label} />
                  <Metric label={t.models} value={providerModels.length || 'Manual'} />
                </div>

                <div className="border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700">
                  <div className="text-xs font-semibold uppercase text-slate-500">
                    {uiLanguage === 'ko' ? 'Provider 설정' : 'Provider Setup'}
                  </div>
                  <p className="mt-1">{providerSetupText}</p>
                </div>

                {providerModels.length > 0 ? (
                  <div className="border border-slate-300 bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      {t.installedModels}
                    </p>
                    <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                      {providerModels.map((installedModel) => (
                        <li key={installedModel} className="bg-slate-50 px-3 py-2 font-medium">
                          {installedModel}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div
                  className={
                    providerId === 'ollama'
                      ? 'border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700'
                      : 'border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900'
                  }
                >
                  {providerPrivacyText}
                  {providerId !== 'ollama' ? (
                    <label className="mt-3 flex items-start gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={externalApiConfirmed}
                        onChange={(event) => setExternalApiConfirmed(event.currentTarget.checked)}
                        className="mt-1 h-4 w-4"
                      />
                      <span>
                        {uiLanguage === 'ko'
                          ? '번역할 파일 내용이 선택한 외부 API로 전송되는 것을 확인했습니다.'
                          : 'I understand that file contents will be sent to the selected external API.'}
                      </span>
                    </label>
                  ) : null}
                </div>

                {providerStatus === 'failed' ? (
                  <div className="border border-red-200 bg-red-50 px-3 py-3 text-red-900">
                    <p className="font-semibold">{t.unableToConnect}</p>
                    {providerError ? <p className="mt-1">{providerError}</p> : null}
                  </div>
                ) : null}
              </div>
            </SectionCard>
            ) : null}

            {activeStep === 'prepare' ? (
            <details open className="border border-slate-300 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
                {uiLanguage === 'ko' ? '번역 옵션' : 'Translation Options'}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {normalizedBatchSize} / {normalizedConcurrency}
                </span>
              </summary>
            <SectionCard title={t.settings} description={t.settingsDesc}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {sourceLanguageLabel}
                  </span>
                  <select
                    value={sourceLanguage}
                    onChange={(event) =>
                      setSourceLanguage(event.currentTarget.value as ParadoxLanguageCode)
                    }
                    className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                  >
                    {PARADOX_LANGUAGES.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.name} ({language.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {targetLanguageLabel}
                  </span>
                  <select
                    value={targetLanguage}
                    onChange={(event) =>
                      setTargetLanguage(event.currentTarget.value as ParadoxLanguageCode)
                    }
                    className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                  >
                    {PARADOX_LANGUAGES.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.name} ({language.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {t.model}
                  </span>
                  <input
                    value={model}
                    onChange={(event) => setModel(event.currentTarget.value)}
                    className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                  />
                  <span className="block text-xs text-slate-500">
                    {uiLanguage === 'ko'
                      ? '연결 확인이 실패하면 모델명이 실제 계정/Provider에서 사용 가능한지 확인하세요.'
                      : 'If connection fails, confirm this model is available for your account and provider.'}
                  </span>
                </label>
                {providerId === 'ollama' ? (
                  <label className="space-y-1 text-sm text-slate-700">
                    <span className="block text-xs font-semibold uppercase text-slate-500">
                      {t.endpoint}
                    </span>
                    <input
                      value={endpoint}
                      onChange={(event) => setEndpoint(event.currentTarget.value)}
                      className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                    />
                  </label>
                ) : (
                  <label className="space-y-1 text-sm text-slate-700">
                    <span className="block text-xs font-semibold uppercase text-slate-500">
                      {apiKeyLabel}
                    </span>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.currentTarget.value)}
                      autoComplete="off"
                      className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                    />
                  </label>
                )}
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {t.batchSize}
                  </span>
                  <input
                    type="number"
                    min="1"
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
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {uiLanguage === 'ko' ? '재시도 횟수' : 'Retry Attempts'}
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={retryAttempts}
                    onChange={(event) => {
                      if (!Number.isNaN(event.currentTarget.valueAsNumber)) {
                        setRetryAttempts(event.currentTarget.valueAsNumber)
                      }
                    }}
                    className="w-full border border-slate-300 bg-white px-3 py-2 outline-none focus:border-[#476a5f]"
                  />
                </label>
                <label className="flex items-center gap-3 border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={splitFailedBatches}
                    onChange={(event) => setSplitFailedBatches(event.currentTarget.checked)}
                    className="h-4 w-4"
                  />
                  {uiLanguage === 'ko' ? '실패한 배치를 나누어 재시도' : 'Split failed batches'}
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Metric label={t.keepAlive} value="30m" />
                <Metric label={t.topP} value="0.9" />
                <Metric label={t.penalty} value="1.05" />
                <Metric label={t.maxChars} value="12000" />
              </div>
            </SectionCard>
            </details>
            ) : null}

            {activeStep === 'prepare' ? (
            <details className="border border-slate-300 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
                {uiLanguage === 'ko' ? '프롬프트 / 용어집 열기' : 'Open Prompt / Glossary'}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {glossaryEntries.length
                    ? uiLanguage === 'ko'
                      ? `용어 ${glossaryEntries.length}`
                      : `${glossaryEntries.length} terms`
                    : uiLanguage === 'ko'
                      ? '선택'
                      : 'Optional'}
                </span>
              </summary>
            <SectionCard title={promptTitle} description={promptDesc}>
              <div className="space-y-4">
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {uiLanguage === 'ko' ? '사용자 지시사항' : 'Custom Instructions'}
                  </span>
                  <textarea
                    value={customInstructions}
                    onChange={(event) => setCustomInstructions(event.currentTarget.value)}
                    rows={4}
                    placeholder={
                      uiLanguage === 'ko'
                        ? '예: 역사 전략 게임 문체로, 자연스럽고 격식 있게 번역하세요.'
                        : 'Example: Use a natural grand strategy game tone.'
                    }
                    className="w-full resize-y border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#476a5f]"
                  />
                </label>

                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block text-xs font-semibold uppercase text-slate-500">
                    {uiLanguage === 'ko' ? '용어집' : 'Glossary'}
                  </span>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      onChange={handleGlossaryUpload}
                      className="w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-slate-700 focus:border-[#476a5f]"
                    />
                    {glossaryFileName ? (
                      <span className="text-xs text-slate-500">{glossaryFileName}</span>
                    ) : null}
                  </div>
                  <textarea
                    value={glossaryText}
                    onChange={(event) => setGlossaryText(event.currentTarget.value)}
                    rows={5}
                    placeholder={[
                      'Empire => 제국',
                      'War Support = 전쟁 지지도',
                      'Legitimacy\t정통성',
                    ].join('\n')}
                    className="w-full resize-y border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#476a5f]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Metric
                    label={uiLanguage === 'ko' ? '용어 수' : 'Terms'}
                    value={glossaryEntries.length}
                  />
                  <Metric
                    label={uiLanguage === 'ko' ? '형식 오류' : 'Invalid'}
                    value={glossaryDiagnostics.invalidLines.length}
                  />
                  <Metric
                    label={uiLanguage === 'ko' ? '중복' : 'Duplicates'}
                    value={glossaryDiagnostics.duplicateSources.length}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPromptPreview((current) => !current)}
                    className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-[#476a5f]"
                  >
                    {showPromptPreview
                      ? uiLanguage === 'ko'
                        ? '미리보기 숨기기'
                        : 'Hide Preview'
                      : uiLanguage === 'ko'
                        ? '프롬프트 미리보기'
                        : 'Preview Prompt'}
                  </button>
                </div>

                {glossaryEntries.length > 0 ? (
                  <div className="max-h-36 overflow-auto border border-slate-300 bg-white p-3 text-sm">
                    <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
                      {uiLanguage === 'ko' ? '용어집 미리보기' : 'Glossary Preview'}
                    </div>
                    <div className="grid gap-1">
                      {glossaryEntries.slice(0, 8).map((entry) => (
                        <div
                          key={`${entry.source}-${entry.target}`}
                          className="grid grid-cols-[1fr_auto_1fr] gap-2 border-b border-slate-100 py-1 last:border-b-0"
                        >
                          <span className="break-words font-medium text-slate-900">
                            {entry.source}
                          </span>
                          <span className="text-slate-400">=</span>
                          <span className="break-words text-slate-700">{entry.target}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {glossaryDiagnostics.invalidLines.length > 0 ||
                glossaryDiagnostics.duplicateSources.length > 0 ? (
                  <div className="border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                    {glossaryDiagnostics.invalidLines.length > 0 ? (
                      <p>
                        {uiLanguage === 'ko' ? '무시된 줄' : 'Ignored lines'}:{' '}
                        {glossaryDiagnostics.invalidLines
                          .slice(0, 3)
                          .map((line) => line.lineNumber)
                          .join(', ')}
                      </p>
                    ) : null}
                    {glossaryDiagnostics.duplicateSources.length > 0 ? (
                      <p className="mt-1">
                        {uiLanguage === 'ko' ? '중복 원문' : 'Duplicate sources'}:{' '}
                        {glossaryDiagnostics.duplicateSources.slice(0, 3).join(', ')}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomInstructions('')
                      setGlossaryText('')
                      setGlossaryFileName(null)
                    }}
                    className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#476a5f]"
                  >
                    {uiLanguage === 'ko' ? '초기화' : 'Reset'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setGlossaryText(
                        ['Empire => 제국', 'Authority => 권위', 'War Support => 전쟁 지지도'].join(
                          '\n',
                        ),
                      )
                    }
                    className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#476a5f]"
                  >
                    {uiLanguage === 'ko' ? '예시 넣기' : 'Insert Example'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadGlossary}
                    disabled={!glossaryText.trim()}
                    className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#476a5f] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uiLanguage === 'ko' ? '용어집 저장' : 'Export Glossary'}
                  </button>
                </div>

                {showPromptPreview ? (
                  <pre className="max-h-96 overflow-auto bg-slate-950 p-3 text-xs text-slate-50">
                    <code>{promptPreviewText}</code>
                  </pre>
                ) : null}
              </div>
            </SectionCard>
            </details>
            ) : null}

            {activeStep === 'runResult' ? (
            <SectionCard title={t.resultDownload} description={t.resultDesc}>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Metric
                    label={uiLanguage === 'ko' ? '번역됨' : 'Translated'}
                    value={successfulEntries}
                  />
                  <Metric
                    label={uiLanguage === 'ko' ? '원문 유지' : 'Original'}
                    value={originalKeptEntries}
                  />
                  <Metric
                    label={uiLanguage === 'ko' ? '총 항목' : 'Total'}
                    value={translationResults.length}
                  />
                </div>
                <div className="border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  <span className="font-semibold">
                    {uiLanguage === 'ko' ? '번역 소요 시간' : 'Translation time'}:
                  </span>{' '}
                  {elapsedTimeText}
                </div>
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
                  {translationStatus === 'running'
                    ? uiLanguage === 'ko'
                      ? '현재까지 번역된 파일 다운로드'
                      : 'Download Current Partial Result'
                    : t.download}
                </button>
                <div className="border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
                  {t.failedEntries}: {failedTranslationEntries.length}
                  {translationResults.length > 0 ? (
                    <span className="ml-2">
                      {uiLanguage === 'ko'
                        ? `다운로드 시 ${originalKeptEntries}개 항목은 원문으로 유지됩니다.`
                        : `${originalKeptEntries} entries will stay original when downloaded.`}
                    </span>
                  ) : null}
                </div>
                {failedTranslationEntries.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleRetryFailedEntries}
                      disabled={translationStatus === 'running'}
                      className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-[#476a5f] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uiLanguage === 'ko' ? '실패 항목만 재시도' : 'Retry Failed Only'}
                    </button>
                    <button
                      type="button"
                      onClick={handleKeepOriginalsForFailedEntries}
                      disabled={translationStatus === 'running'}
                      className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-[#476a5f] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uiLanguage === 'ko' ? '실패 항목 원문 유지' : 'Keep Failed Originals'}
                    </button>
                  </div>
                ) : null}
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
            ) : null}

            {activeStep === 'review' ? (
              <>
                <SectionCard
                  title={uiLanguage === 'ko' ? '파일별 진행' : 'File Progress'}
                  description={
                    uiLanguage === 'ko'
                      ? '파일마다 번역 완료와 실패 수를 확인합니다.'
                      : 'Check translated and failed entries by file.'
                  }
                >
                  <div className="max-h-80 overflow-auto border border-slate-300">
                    {reviewFileStats.length > 0 ? (
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left">File</th>
                            <th className="px-3 py-2 text-right">Total</th>
                            <th className="px-3 py-2 text-right">Done</th>
                            <th className="px-3 py-2 text-right">Failed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reviewFileStats.map((file) => (
                            <tr key={file.fileName} className="border-t border-slate-200">
                              <td className="max-w-[420px] truncate px-3 py-2 font-medium">
                                {file.fileName}
                              </td>
                              <td className="px-3 py-2 text-right">{file.total}</td>
                              <td className="px-3 py-2 text-right">{file.translated}</td>
                              <td className="px-3 py-2 text-right">{file.failed}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="p-3 text-sm text-slate-500">
                        {uiLanguage === 'ko'
                          ? '검토할 파일이 없습니다.'
                          : 'No files to review yet.'}
                      </p>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title={uiLanguage === 'ko' ? '결과 미리보기' : 'Result Preview'}
                  description={
                    uiLanguage === 'ko'
                      ? '첫 번째 파일의 일부 항목을 원문과 결과로 비교합니다.'
                      : 'Compare a sample from the first file.'
                  }
                >
                  <div className="max-h-96 overflow-auto border border-slate-300">
                    {previewLines.length > 0 ? (
                      <div className="divide-y divide-slate-200 text-sm">
                        {previewLines.map((line) => (
                          <div key={line.key} className="grid grid-cols-[180px_1fr_1fr] gap-3 p-3">
                            <div className="font-mono text-xs font-semibold text-slate-500">
                              {line.key}
                            </div>
                            <div className="break-words text-slate-700">{line.original}</div>
                            <div className="break-words font-medium text-slate-950">
                              {line.translated}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="p-3 text-sm text-slate-500">
                        {uiLanguage === 'ko'
                          ? '미리볼 번역 결과가 없습니다.'
                          : 'No previewable results yet.'}
                      </p>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title={uiLanguage === 'ko' ? '실패 / 품질 리포트' : 'Failure / Quality Report'}
                  description={
                    uiLanguage === 'ko'
                      ? '다운로드 전에 눈에 띄는 위험 신호만 간단히 확인합니다.'
                      : 'Review only the most important warnings before download.'
                  }
                >
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <Metric
                      label={uiLanguage === 'ko' ? '실패' : 'Failed'}
                      value={failedTranslationEntries.length}
                    />
                    <Metric
                      label={uiLanguage === 'ko' ? '원문 동일' : 'Unchanged'}
                      value={unchangedTranslationCount}
                    />
                    <Metric
                      label={uiLanguage === 'ko' ? '미처리' : 'Missing'}
                      value={missingResultCount}
                    />
                  </div>

                  {failedTranslationEntries.length > 0 ? (
                    <ul className="mt-4 max-h-44 space-y-2 overflow-auto border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                      {failedTranslationEntries.slice(0, 20).map((failedEntry) => (
                        <li key={failedEntry.entry.globalIndex}>
                          <span className="font-mono text-xs">{failedEntry.entry.key}</span>
                          <span className="ml-2">
                            {failedEntry.entry.fileName}:{failedEntry.entry.lineIndex + 1}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      {uiLanguage === 'ko'
                        ? '현재 표시할 실패 항목이 없습니다.'
                        : 'No failed entries to show.'}
                    </p>
                  )}
                </SectionCard>
              </>
            ) : null}
          </div>
        </section>
          </>
        )}
      </div>
    </main>
  )
}

export default App
