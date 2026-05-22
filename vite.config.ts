import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

function getBasePath() {
  if (process.env.VITE_BASE_PATH) {
    return process.env.VITE_BASE_PATH
  }

  if (process.env.GITHUB_REPOSITORY) {
    const repositoryName = process.env.GITHUB_REPOSITORY.split('/')[1]

    return repositoryName ? `/${repositoryName}/` : '/'
  }

  return process.env.NODE_ENV === 'production' ? '/PTT/' : '/'
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: getBasePath(),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
