/**
 * 詞彙掃描 adapter（issue #6，ADR 0004）。走訪 vault 裡既有的 .md，
 * 從 frontmatter 的 tags 加內文的 #hashtag 組成標籤詞彙，餵給引擎的錨定式下標。
 * 不依賴 hyday 索引、不依賴 hyday 有裝，只讀一般 Markdown。
 *
 * 這是瀏覽器專屬的薄 adapter：走訪目錄用 File System Access API，
 * 純字串解析（parse 那幾支）另外抽出來，方便單獨測。詞彙的錨定政策在引擎，不在這裡。
 */

// 不掃這些系統／範本目錄，避免把 .hyday、範本、附件裡的字當成使用者標籤
const EXCLUDED_DIRS = new Set(['.hyday', 'templates', 'assets'])
// 掃描檔數上限，避免超大 vault 拖住擷取
const DEFAULT_MAX_FILES = 2000

/** 修剪、去掉前綴 #；空字串代表不是有效標籤 */
function cleanTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim()
}

function stripQuotes(s: string): string {
  const t = s.trim()
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    return t.slice(1, -1)
  }
  return t
}

/** 取出檔案開頭的 frontmatter 區塊內文（不含前後 ---），沒有則回 null */
function frontmatterBlock(md: string): string | null {
  const m = md.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/)
  return m && m[1] !== undefined ? m[1] : null
}

/** 去掉開頭 frontmatter 後的正文 */
function bodyOf(md: string): string {
  const m = md.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return m ? md.slice(m[0].length) : md
}

/** 抽掉程式碼區塊與行內程式碼，避免把 #include、#fff 之類當成 hashtag */
function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
}

// hashtag：前面是行首或空白，# 之後緊接一個字母或數字（排除 markdown 標題的「# 」），
// 標籤字元含各語言文字、數字、底線、連字號與斜線（支援 #a/b 這種巢狀標籤）
const HASHTAG_RE = /(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}_/-]*)/gu

/** 從 frontmatter 區塊解析 tags，支援行內陣列、區塊清單與單一純量 */
function tagsFromFrontmatter(block: string): string[] {
  const lines = block.split(/\r?\n/)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^tags\s*:\s*(.*)$/i)
    if (!m) continue
    const rest = (m[1] ?? '').trim()
    if (rest.startsWith('[')) {
      // 行內陣列 tags: [a, "b", 'c']
      const inner = rest.replace(/^\[/, '').replace(/\]\s*$/, '')
      for (const part of inner.split(',')) {
        const v = stripQuotes(part)
        if (v) out.push(v)
      }
    } else if (rest === '' || rest === '|' || rest === '>') {
      // 區塊清單，往下讀 - item
      for (let j = i + 1; j < lines.length; j++) {
        const item = lines[j]!.match(/^\s*-\s+(.*)$/)
        if (!item) break
        const v = stripQuotes(item[1] ?? '')
        if (v) out.push(v)
      }
    } else {
      // 單一純量 tags: foo
      const v = stripQuotes(rest)
      if (v) out.push(v)
    }
    break // 只取第一個 tags 鍵
  }
  return out
}

/** 一份 Markdown 的所有標籤：frontmatter tags 加內文 #hashtag（未去重、未正規化大小寫） */
export function tagsFromMarkdown(md: string): string[] {
  const block = frontmatterBlock(md)
  const out = block ? tagsFromFrontmatter(block) : []
  const body = stripCode(bodyOf(md))
  for (const m of body.matchAll(HASHTAG_RE)) {
    if (m[1]) out.push(m[1])
  }
  return out
}

export type ScanOptions = { maxFiles?: number }

/**
 * 走訪資料夾底下的 .md，組成去重後的標籤詞彙。
 * 大小寫不敏感去重，保留第一次看到的樣子；跳過 .hyday、templates、assets 與隱藏目錄。
 */
export async function scanTagVocabulary(
  dir: FileSystemDirectoryHandle,
  opts: ScanOptions = {},
): Promise<string[]> {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES
  const byKey = new Map<string, string>() // lowercased key → 第一次看到的樣子
  let filesRead = 0

  async function walk(handle: FileSystemDirectoryHandle): Promise<void> {
    for await (const entry of handle.values()) {
      if (filesRead >= maxFiles) return
      if (entry.kind === 'directory') {
        if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue
        await walk(entry)
        continue
      }
      if (!entry.name.toLowerCase().endsWith('.md')) continue
      filesRead++
      let text: string
      try {
        const file = await entry.getFile()
        text = await file.text()
      } catch {
        continue // 讀不到就跳過，掃描盡力而為，不擋擷取
      }
      for (const raw of tagsFromMarkdown(text)) {
        const clean = cleanTag(raw)
        if (!clean) continue
        const key = clean.toLowerCase()
        if (!byKey.has(key)) byKey.set(key, clean)
      }
    }
  }

  await walk(dir)
  return [...byKey.values()]
}
