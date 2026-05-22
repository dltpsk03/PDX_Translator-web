# AGENTS.md

## Project

Paradox MOD YML Translator

## Goal

Build a browser-only translation tool for Paradox Interactive MOD localization `.yml` files.

Users open the app from GitHub Pages, upload `.yml` files, configure translation settings, and translate through Ollama running on their own PC.

## Architecture

- Frontend only.
- No backend for MVP.
- Host on GitHub Pages.
- Parse files in the browser.
- Call the user's local Ollama API.
- Rebuild and download translated `.yml` files in the browser.

Expected Ollama endpoint:

```text
http://localhost:11434
````

Default model:

```text
gemma4:e4b
```

## Core Rules

* Do not add a backend unless explicitly requested.
* Do not upload user files to any server.
* Do not use paid APIs.
* Do not translate localization keys.
* Do not translate placeholders.
* Do not change line order.
* Do not silently output broken localization.
* Preserve comments, blank lines, indentation, and non-localization lines whenever possible.
* Prefer small working steps over large rewrites.

## Translation Strategy

Use line-preserving batch translation.

Do not send only isolated values to the LLM.

Send batches in near-original localization line format:

```yml
  my_event.1.t:0 "A Dangerous Proposal"
  my_event.1.d:0 "<P0> has arrived in the capital.\nThe nobles are restless."
  my_event.1.a:0 "Accept their demands."
  my_event.1.b:0 "Refuse them."
```

The LLM should translate only the quoted text and keep the key structure unchanged.

Internally, still parse each line and validate the result. Do not trust the LLM to preserve structure.

## Batch Rules

For large files:

* Extract translatable localization lines.
* Preserve globalIndex and lineIndex.
* Split into batches of 50-100 lines.
* Also limit batch size by character count.
* Translate multiple batches concurrently.
* Do not send 100 simultaneous requests to Ollama by default.
* Use controlled concurrency.

Default settings:

```ts
batchSize = 80
concurrency = 2
temperature = 0.1
keepAlive = "30m"
```

Presets:

```text
Low-end PC:
batchSize = 50
concurrency = 1

Recommended:
batchSize = 80
concurrency = 2

High-end PC:
batchSize = 100
concurrency = 4
```

## Placeholder Protection

Before sending lines to Ollama, protect placeholders inside quoted values.

Protect patterns like:

```text
[ROOT.GetCountry.GetName]
[This.GetName]
[TARGET.GetName]
$CHARACTER$
$COUNTRY_NAME$
£gold£
£authority£
#P positive text #!
#N negative text #!
\n
```

Replace them with tokens:

```text
<P0>
<P1>
<P2>
```

After translation, restore the original placeholders exactly.

## Validation Rules

After every translated batch, validate:

* same number of lines
* same line order
* same keys
* same version numbers such as `:0`
* same indentation where possible
* same placeholders
* same escaped newline markers
* valid quoted localization values

If validation fails:

1. Retry the batch once.
2. Split the batch into smaller batches.
3. Retry again.
4. If still failing, mark entries as failed and preserve the original text.

## Parser Requirements

Use a line-based parser, not a generic YAML parser.

Each parsed line should be either:

```ts
type ParsedLine = LocalizationEntry | RawLine;
```

Localization entry:

```ts
type LocalizationEntry = {
  type: "entry";
  fileName: string;
  lineIndex: number;
  globalIndex: number;
  rawLine: string;
  indent: string;
  key: string;
  version: string;
  value: string;
  prefix: string;
  suffix: string;
};
```

Raw line:

```ts
type RawLine = {
  type: "raw";
  lineIndex: number;
  rawLine: string;
};
```

## Ollama Integration

Use:

```text
GET /api/tags
POST /api/generate
```

Use `/api/tags` to check whether Ollama is running and which models are installed.

Use `/api/generate` with:

```json
{
  "stream": false,
  "keep_alive": "30m",
  "options": {
    "temperature": 0.1,
    "top_p": 0.9,
    "repeat_penalty": 1.05
  }
}
```

If Ollama connection fails, show setup guidance:

```bash
OLLAMA_ORIGINS=https://YOUR_GITHUB_USERNAME.github.io ollama serve
```

Do not recommend `OLLAMA_ORIGINS=*` as the default.

## UI Requirements

Build a simple practical UI:

1. File Upload
2. Ollama Connection
3. Translation Settings
4. Progress
5. Result Download
6. Failed Entries

The UI should show:

* Ollama connection status
* selected model
* number of files
* number of parsed localization entries
* batch progress
* failed batches or lines
* download button

## Tech Stack

Use:

```text
Vite
React
TypeScript
Tailwind CSS
pnpm
Vitest
```

Core parsing and translation logic should be pure TypeScript and testable without React.

Suggested structure:

```text
src/
  components/
  core/
    parseParadoxYml.ts
    protectPlaceholders.ts
    restorePlaceholders.ts
    createBatches.ts
    rebuildParadoxYml.ts
    validateTranslatedBatch.ts
  ollama/
    checkOllama.ts
    translateBatch.ts
    buildPrompt.ts
  types/
```

## Testing

Add tests for core logic.

Minimum tests:

* parse localization line
* preserve comments and raw lines
* handle escaped quotes
* protect placeholders
* restore placeholders
* create batches
* validate unchanged keys
* validate missing placeholders
* rebuild yml in original order

## GitHub Pages

The app must be deployable to GitHub Pages.

If using Vite, configure `base` properly for repository deployment.

## Development Commands

Use pnpm.

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
```

## Implementation Style

* Inspect existing files before editing.
* Implement one step at a time.
* Keep parsing, Ollama calls, validation, and UI separated.
* Do not perform broad refactors unless requested.
* After each meaningful change, run build and tests if available.
