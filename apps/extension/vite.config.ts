import { defineConfig } from 'vitest/config'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'esnext',
  },
  test: {
    // 純函式 seam 不需要 DOM 環境
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
