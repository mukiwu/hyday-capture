/**
 * markdown 掃描的共用小工具：只處理程式碼圍籬外的片段。
 * 圍籬內的東西是字面內容，任何改寫都不該碰它。
 */

const FENCE = /^```[\s\S]*?^```/gm

/** 對圍籬外的每個片段套用 fn，圍籬本身原樣保留後接回去 */
export function mapOutsideFences(md: string, fn: (chunk: string) => string): string {
  const out: string[] = []
  let last = 0
  for (const match of md.matchAll(FENCE)) {
    const start = match.index ?? 0
    out.push(fn(md.slice(last, start)), match[0])
    last = start + match[0].length
  }
  out.push(fn(md.slice(last)))
  return out.join('')
}

/** 掃圍籬外的片段但不改寫，給只需要蒐集的呼叫端 */
export function scanOutsideFences(md: string, fn: (chunk: string) => void): void {
  mapOutsideFences(md, (chunk) => {
    fn(chunk)
    return chunk
  })
}
