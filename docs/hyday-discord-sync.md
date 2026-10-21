# 與 Hyday Discord 外部擷取的同步

Hyday 的 Discord 外部擷取頻道，要產出跟這個擴充元件一模一樣的筆記。兩邊不共用程式碼，Hyday 那邊是手動搬過去的一份，目前同步到 0.1.8

改了下面這些檔案，發版後要記得到 hyday-source 同步一次

- `packages/organize-engine/src/` 的 fences、filename、frontmatter、imageAssets、noteType、paragraphBreaks、rawClipping、videoEmbeds、youtube
- `apps/extension/src/extract/` 的 content、boundaryFallback、contentExtraction、facebookVideo、hardenParagraphs、markdownConverter、postBoundary、youtubePage
- `apps/extension/src/capture/localizeImages.ts` 與 `apps/extension/src/net/imageFetch.ts`

完整的檔案對照與刻意不搬的部分，見 hyday-source 的 `docs/lore/discord/business-rules.md`，標題是外部擷取與 Hyday Capture 各自維護
