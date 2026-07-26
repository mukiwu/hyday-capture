import { defineConfig } from 'vitest/config'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'esnext',
    // defuddle/full 打包後約 700 kB（含 turndown 這套 markdown 轉換器），比 core 大一倍多，
    // 但那是抽取品質的來源、且只在按下擷取時才動態載入，不影響平常瀏覽。
    // 本機安裝的擴充沒有下載成本，所以放寬警告門檻而不是為了瘦身退回 core
    chunkSizeWarningLimit: 800,
  },
  test: {
    // 純邏輯已移進 organize-engine 套件在那裡測；擴充端只剩瀏覽器 adapter，
    // 依 spec 以手動/整合測驗證，不進單元測試核心
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
