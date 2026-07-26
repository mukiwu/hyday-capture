#!/usr/bin/env node
/**
 * 讀 hyday vault 的 clippings 資料夾，逐檔報「抽取品質」的訊號，最壞的排最前面。
 *
 * 為什麼需要這支：分段流失這類問題不是一站一站看得出來的，要橫向比對一批不同排版的
 * 網站才知道問題類別的全貌（2026-07-26 拍板的蒐集優先）。每次動抽取或 markdown 轉換
 * 都該重跑一次，比對前後。
 *
 * 用法：
 *   node scripts/diagnose-clippings.mjs [clippings 資料夾路徑]
 * 不給路徑時讀 HYDAY_CLIPPINGS 環境變數，都沒有就報錯，不猜使用者的 vault 位置。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? process.env.HYDAY_CLIPPINGS
if (!dir) {
  console.error('請給 clippings 資料夾路徑，或設 HYDAY_CLIPPINGS')
  process.exit(1)
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n*([\s\S]*)$/

function field(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

/** 把本文拆成程式碼區塊與非程式碼區塊，避免圍籬內的內容污染分段統計 */
function splitFences(body) {
  const parts = body.split(/^```[\s\S]*?^```/gm)
  const fences = body.match(/^```[\s\S]*?^```/gm) ?? []
  return { prose: parts.join('\n'), fenceCount: fences.length }
}

function diagnose(name) {
  const raw = readFileSync(join(dir, name), 'utf-8')
  const m = raw.match(FRONTMATTER)
  const fm = m ? m[1] : ''
  const body = m ? m[2] : raw
  const { prose, fenceCount } = splitFences(body)

  const paragraphs = prose.split(/\n\s*\n/).filter((p) => p.trim()).length
  const hardBreaks = (prose.match(/ {2}\n/g) ?? []).length
  const longestLine = prose
    .split('\n')
    .reduce((max, line) => Math.max(max, line.trim().length), 0)
  // 殘留 HTML：轉換沒吃掉的標籤。markdown 裡合理出現的自閉合與註解不算
  const htmlTags = (prose.match(/<\/?[a-z][a-z0-9]*(\s[^>]*)?>/gi) ?? []).length
  const tables = (prose.match(/^\|.*\|$/gm) ?? []).length
  const listItems = (prose.match(/^\s*([-*+]|\d+\.)\s+/gm) ?? []).length
  const images = (prose.match(/!\[[^\]]*\]\(/g) ?? []).length

  return {
    name,
    domain: field(fm, 'sourceDomain'),
    type: field(fm, 'type'),
    chars: prose.trim().length,
    paragraphs,
    longestLine,
    hardBreaks,
    htmlTags,
    tables,
    fences: fenceCount,
    listItems,
    images,
  }
}

/**
 * 分段有沒有壞的判斷：一大坨的特徵是「單行超長」且「段落數相對字數少得離譜」。
 * 分數越高越可疑，排序用。
 */
function suspicion(r) {
  const perParagraph = r.paragraphs > 0 ? r.chars / r.paragraphs : r.chars
  return Math.max(r.longestLine, perParagraph)
}

const names = readdirSync(dir).filter((n) => n.endsWith('.md') && statSync(join(dir, n)).isFile())
if (names.length === 0) {
  console.error(`${dir} 裡沒有 .md`)
  process.exit(1)
}

const rows = names.map(diagnose).sort((a, b) => suspicion(b) - suspicion(a))

const pad = (s, w) => String(s).padEnd(w)
const padL = (s, w) => String(s).padStart(w)
console.log(
  pad('來源', 22),
  pad('型別', 8),
  padL('字數', 6),
  padL('段落', 5),
  padL('最長行', 7),
  padL('硬換行', 7),
  padL('殘留HTML', 9),
  padL('表格', 5),
  padL('圍籬', 5),
  padL('清單', 5),
  padL('圖', 4),
)
console.log('-'.repeat(96))
for (const r of rows) {
  console.log(
    pad(r.domain.slice(0, 21), 22),
    pad(r.type, 8),
    padL(r.chars, 6),
    padL(r.paragraphs, 5),
    padL(r.longestLine, 7),
    padL(r.hardBreaks, 7),
    padL(r.htmlTags, 9),
    padL(r.tables, 5),
    padL(r.fences, 5),
    padL(r.listItems, 5),
    padL(r.images, 4),
  )
}

console.log()
console.log('怎麼讀：最長行破千、段落數個位數，就是分段塌成一坨；殘留 HTML 不為零表示轉換沒吃乾淨')
console.log('檔名對照（依可疑度排序）：')
rows.forEach((r, i) => console.log(`${padL(i + 1, 3)}. ${r.name}`))
