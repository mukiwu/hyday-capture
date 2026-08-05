# Chrome Web Store 送審資料

送審時要填的欄位都整理在這裡，直接複製貼上

## 基本資訊

- 名稱：Hyday Capture（取自 manifest 的 name）
- 類別：生產力工具（Productivity）
- 語言：中文（繁體）
- 隱私權政策網址：https://github.com/mukiwu/hyday-capture/blob/master/PRIVACY.md

## 單一用途說明（Single purpose description）

把使用者正在看的網頁擷取成 Markdown 筆記，存進使用者自己選擇的本機資料夾，供 hyday 筆記 app 使用

## 權限理由（Permission justifications）

### host_permissions: <all_urls>

使用者可能想收藏任何網站的文章，擷取功能必須能在任意網頁上執行內文抽取，另外文章內的圖片存放在各站自己的 CDN，擴充功能需要代替頁面下載這些圖片到本機，讓筆記離線可讀，跨網域下載必須由 service worker 帶著 host 權限發出，否則會被目標站的 CORS 擋下

### content script on <all_urls>

內文抽取（Defuddle）需要 live DOM 才能判斷正文邊界，只能以 content script 形式在頁面內執行，平常閒置不動，只在使用者主動觸發擷取時才動態載入抽取器並處理當前頁面

### storage

在本機保存使用者的筆記模板設定，無任何資料離開裝置

### contextMenus

提供右鍵選單的三個擷取入口：擷取整頁、擷取選取內容、擷取連結

## 資料使用揭露（Privacy practices）

- 資料蒐集問卷全部勾選不蒐集：擴充功能沒有伺服器，所有處理都在本機完成，網頁內容轉成 Markdown 後直接寫入使用者選擇的本機資料夾
- 三項聲明全部勾選同意：不販售使用者資料給第三方、不將使用者資料用於單一用途以外的目的、不將使用者資料用於信用評估或借貸用途
- 遠端程式碼：無，所有程式碼都打包在擴充功能內

## 上架素材檢查清單

- [x] icon 128x128（隨包提交，manifest 已含 16/32/48/128）
- [x] 螢幕截圖 3 張（640x400），在 docs/store-assets/：popup 擷取成功、設定頁、Hyday 整理成果
- [ ] 小型宣傳圖 440x280（選填，有助曝光）
- [ ] 支援信箱（開發者儀表板帳號設定內填寫並驗證）

## 送審前置作業

- [ ] Chrome Web Store 開發者帳號（一次性註冊費 5 美元）
- [ ] 執行 pnpm --filter @hyday-capture/extension zip 產出上架 zip（apps/extension/release/）
- [ ] 上傳 zip 到開發者儀表板，填入上述欄位

## 審查注意事項

- <all_urls> 屬廣域 host 權限，會觸發較深入的人工審查，首次審查可能需要數天到數週
- 版本號更新規則：manifest 的 version 每次送審都要比前一版大
