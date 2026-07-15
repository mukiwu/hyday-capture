import { defineConfig } from 'vitest/config'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'esnext',
  },
  test: {
    // 純邏輯已移進 organize-engine 套件在那裡測；擴充端只剩瀏覽器 adapter，
    // 依 spec 以手動/整合測驗證，不進單元測試核心
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
