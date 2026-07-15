/**
 * 錨定式開放下標（ADR 0004）。把既有標籤詞彙整包餵給注入的 AI，取回候選標籤後，
 * 引擎再做 deterministic 的後處理把關：沿用優先、真的沒有合適的才新增且最多一個、
 * 只留概念類、最多約五個、過濾來源類（網站名、書名一類）。
 *
 * 政策不能只靠 AI 聽話，這裡的後處理才是硬性保證，也讓測試可預期。
 * 平台無關：不碰任何瀏覽器全域，詞彙由呼叫端（擴充 adapter 掃資料夾）提供。
 */
import type { AICaller, ExtractedContent } from './types'

/** 概念類、寧缺勿濫：一則筆記最多約五個標籤 */
export const MAX_TAGS = 5
/** 錨定式開放：詞彙非空時，真的沒有合適的既有標籤才新增，且最多新增一個 */
export const MAX_NEW_TAGS = 1

export type AnchoredTaggingInput = {
  extracted: ExtractedContent
  /** 掃描輸出資料夾得到的既有標籤詞彙；優先沿用，未給則視為空詞彙、近似開放模式 */
  vocabulary: string[]
  /** 注入的 AI；測試時為回固定候選的假實作 */
  ai: AICaller
}

/**
 * 明顯屬來源／載體類、幾乎不帶概念訊號的通用標籤，借 hyday 書摘標籤哲學過濾掉。
 * 具體的網站名改由 sourceTermsFrom 依網域動態推出。
 */
const SOURCE_TYPE_TAGS = new Set(['book', 'books', '書', '書摘'])

/** 修剪頭尾、去掉前綴 #、把內部連續空白收成單一空白 */
function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim()
}

/**
 * 從來源網域推出「來源類」關鍵詞（網站名），例如 example.com → example、example.com，
 * sub.example.co.uk → example、sub.example.co.uk。用來擋掉拿網站名當標籤的情形（story #24）。
 */
function sourceTermsFrom(extracted: ExtractedContent): Set<string> {
  const terms = new Set<string>()
  const domain = extracted.domain?.toLowerCase().trim() ?? ''
  if (!domain) return terms
  const bare = domain.replace(/^www\./, '')
  terms.add(bare)
  const labels = bare.split('.').filter(Boolean)
  // 註冊名（倒數第二段，如 example.co.uk → example）與最前一段
  if (labels.length >= 2) terms.add(labels[labels.length - 2]!)
  if (labels.length >= 1) terms.add(labels[0]!)
  return terms
}

/**
 * 錨定政策的純後處理：不呼叫 AI，只把候選標籤依政策整形。
 * @param candidates AI 回傳的候選標籤（未整形）
 * @param vocabulary 既有標籤詞彙
 * @param extracted 來源頁面資料，用來推出要過濾的來源類關鍵詞
 */
export function applyAnchoredPolicy(
  candidates: string[],
  vocabulary: string[],
  extracted: ExtractedContent,
): string[] {
  // 詞彙查表：lowercased key → 詞彙原本的顯示形，沿用時輸出詞彙自己的樣子
  const vocabByKey = new Map<string, string>()
  for (const v of vocabulary) {
    const norm = normalizeTag(v)
    if (!norm) continue
    const key = norm.toLowerCase()
    if (!vocabByKey.has(key)) vocabByKey.set(key, norm)
  }

  const sourceTerms = sourceTermsFrom(extracted)

  const existing: string[] = []
  const fresh: string[] = []
  const seen = new Set<string>()

  for (const raw of candidates) {
    const norm = normalizeTag(raw)
    if (!norm) continue
    const key = norm.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const canonical = vocabByKey.get(key)
    if (canonical !== undefined) {
      // 既有詞彙：沿用，且用詞彙原本的樣子
      existing.push(canonical)
    } else {
      // 新標：先擋掉來源類（網站名、books 一類），再受新標數與總量上限節制
      if (SOURCE_TYPE_TAGS.has(key) || sourceTerms.has(key)) continue
      fresh.push(norm)
    }
  }

  // 詞彙非空 → 錨定，最多新增一個；詞彙為空 → 冷啟動近似開放模式，新標放寬到總量上限。
  const newLimit = vocabulary.length === 0 ? MAX_TAGS : MAX_NEW_TAGS
  // 沿用優先：既有詞彙先佔位，再補至多 newLimit 個新標，最後夾在總量上限內。
  return [...existing, ...fresh.slice(0, newLimit)].slice(0, MAX_TAGS)
}

/** 打包餵給 AI 的下標提示詞；把既有詞彙與政策一起交代給模型 */
function buildTaggingPrompts(vocabulary: string[]): string[] {
  const vocabLine = vocabulary.length
    ? `既有標籤詞彙（請優先沿用）：${vocabulary.join(', ')}`
    : '輸出資料夾目前沒有既有標籤。'
  return [
    [
      '為這篇內容挑選標籤。',
      vocabLine,
      '優先沿用上面的既有標籤；只有真的沒有合適的既有標籤時才新增，且最多新增一個。',
      '只挑概念類標籤，寧缺勿濫，最多約五個。',
      '不要用來源類標籤，例如網站名、書名、平台名。',
      '直接回傳標籤清單。',
    ].join('\n'),
  ]
}

/** 打包餵給 AI 的內容脈絡 */
function buildTaggingContext(extracted: ExtractedContent): string {
  return [`標題：${extracted.title}`, '', extracted.contentMarkdown].join('\n')
}

/**
 * 錨定式開放下標：問注入的 AI 要候選標籤，再用 applyAnchoredPolicy 硬性把關。
 * AICaller 回傳的整個字串陣列視為候選標籤清單。
 */
export async function anchoredTagging(input: AnchoredTaggingInput): Promise<string[]> {
  const { extracted, vocabulary, ai } = input
  const candidates = await ai(buildTaggingPrompts(vocabulary), buildTaggingContext(extracted))
  return applyAnchoredPolicy(candidates, vocabulary, extracted)
}
