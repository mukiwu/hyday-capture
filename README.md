# Hyday Capture

一鍵把當前網頁擷取成 Markdown 筆記，落進你本機的 Hyday vault

Hyday Capture 是專為 [Hyday](https://hyday.tw) 打造的網頁擷取工具。Hyday 是一款將筆記儲存於本機 Markdown 檔案的個人筆記工具，擷取的網頁內容將透過 Hyday AI 整理成知識來源

## 功能

- 工具列一鍵擷取當前頁面，可附上隨手一句話
- 右鍵選單擷取整頁、選取內容或連結
- 快捷鍵擷取，Mac 是 Cmd+Shift+S，Windows 是 Ctrl+Shift+S
- 文章圖片自動下載到本機，筆記離線可讀
- YouTube 頁面保留描述與可點的時間戳
- 用 File System Access API 直接寫進你選的資料夾，擷取內容落在 vault 的 clippings 子資料夾

## 隱私

所有處理都在你的裝置上完成，沒有伺服器、沒有帳號、沒有追蹤，詳見 [PRIVACY.md](./PRIVACY.md)

## 開發

這是一個 pnpm workspace，分成兩塊：

- `apps/extension`：Chrome 擴充功能本體（Manifest V3，Vite 加 CRXJS 建置）
- `packages/organize-engine`：平台無關的整理引擎，正文轉原料檔的純邏輯都在這裡

常用指令：

```bash
pnpm install                                    # 安裝相依
pnpm --filter @hyday-capture/extension dev      # 開發模式
pnpm --filter @hyday-capture/extension build    # 建置到 apps/extension/dist
pnpm --filter @hyday-capture/extension zip      # 建置並打包上架用 zip
pnpm -r test                                    # 跑全部測試
pnpm --filter @hyday-capture/extension typecheck
```

本機安裝測試：先 build，再到 `chrome://extensions` 開啟開發人員模式，載入未封裝項目選 `apps/extension/dist`
