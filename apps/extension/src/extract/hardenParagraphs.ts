/**
 * 分段流失的一般解，DOM 那半邊。整套設計與判準見 organize-engine 的 paragraphBreaks.ts。
 *
 * 在把頁面交給抽取器之前，把兩種「視覺上是分段、結構上不是」的表示法換成純文字標記：
 *
 * 1. pre-wrap 文字節點裡的真換行（X、Threads 這類社群貼文）。這種一定要在抽取之前處理，
 *    因為 HTML 把這些換行當空白，抽取器會正規化成空格，之後就再也救不回來
 * 2. 連續或單獨的 `<br>`（電子報、Substack）。這種抽取器留得住，但 turndown 會轉成
 *    行尾兩個空白的硬換行，不是空行分段
 *
 * 不維護站台名單：靠 computed style 判斷哪裡的換行是真的換行，這是瀏覽器自己的判斷。
 *
 * 會動到 live DOM，但轉換在視覺上是等價的（pre-wrap 裡的換行跟 `<br>` 畫出來一樣），
 * 而且回傳的 undo 會把每一處改動還原，抽取完就恢復原狀。
 */
import { PARAGRAPH_BREAK_TOKEN } from '@hyday-capture/organize-engine'

/**
 * 這些容器裡的換行不能變成段落邊界，會把 markdown 的區塊結構打斷
 * （表格儲存格、標題、清單項、連結文字）
 */
const BLOCK_SAFE_ANCESTORS = 'td, th, li, h1, h2, h3, h4, h5, h6, a'

function isInsideBlockSafeAncestor(node: Node): boolean {
  const el = node.parentElement
  return el ? el.closest(BLOCK_SAFE_ANCESTORS) !== null : false
}

/** pre-wrap／pre-line／pre／break-spaces 這幾種，換行才是真的換行 */
function preservesNewlines(el: Element): boolean {
  return getComputedStyle(el).whiteSpace.startsWith('pre')
}

/** 收集所有文字節點。手寫遞迴而不用 TreeWalker 的 filter 物件，少一層 API 相依 */
function collectTextNodes(root: Node, out: Text[]): void {
  for (let child = root.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3) out.push(child as Text)
    else if (child.nodeType === 1) collectTextNodes(child, out)
  }
}

function markPreWrapNewlines(doc: Document, undos: (() => void)[]): void {
  const all: Text[] = []
  collectTextNodes(doc.body, all)

  const targets = all.filter((node) => {
    const text = node.nodeValue ?? ''
    // 有換行、也有實際內容，才可能是作者按出來的分段
    if (!text.includes('\n') || !/\S/.test(text)) return false
    if (isInsideBlockSafeAncestor(node)) return false
    const parent = node.parentElement
    return parent !== null && preservesNewlines(parent)
  })

  for (const node of targets) {
    const original = node.nodeValue ?? ''
    node.nodeValue = original.replace(/\n+/g, ` ${PARAGRAPH_BREAK_TOKEN} `)
    undos.push(() => {
      node.nodeValue = original
    })
  }
}

function markBrRuns(doc: Document, undos: (() => void)[]): void {
  const brs = Array.from(doc.body.querySelectorAll('br'))
  const consumed = new Set<Element>()

  for (const br of brs) {
    if (consumed.has(br) || isInsideBlockSafeAncestor(br)) continue

    // 收下這顆與它後面連續的 br（中間只有空白文字節點也算連續）。
    // nodeType 用數值不用 Node.TEXT_NODE 這種全域常數，少一層環境相依
    const run: ChildNode[] = [br]
    let cursor: ChildNode | null = br.nextSibling
    while (cursor) {
      if (cursor.nodeType === 3 && !/\S/.test(cursor.nodeValue ?? '')) {
        run.push(cursor)
        cursor = cursor.nextSibling
        continue
      }
      if (cursor.nodeType === 1 && (cursor as Element).tagName === 'BR') {
        run.push(cursor)
        consumed.add(cursor as Element)
        cursor = cursor.nextSibling
        continue
      }
      break
    }

    const parent = br.parentNode
    if (!parent) continue
    const marker = doc.createTextNode(` ${PARAGRAPH_BREAK_TOKEN} `)
    parent.insertBefore(marker, br)
    for (const node of run) node.remove()
    undos.push(() => {
      for (const node of run) parent.insertBefore(node, marker)
      marker.remove()
    })
  }
}

/**
 * 把段落邊界標記進 DOM，回傳還原函式。呼叫端務必在抽取結束後（含失敗時）呼叫還原。
 */
export function hardenParagraphs(doc: Document = document): () => void {
  const undos: (() => void)[] = []
  // 兩個 pass 各自獨立收錯：一個失敗不該連帶讓另一個沒跑，而且要出聲，
  // 不然前處理整個沒生效也看不出來（2026-07-26 踩過：共用一個 try 把錯吞掉，
  // pre-wrap 那 pass 拋錯，連 br 那 pass 也沒跑，落地看起來就像修法無效）
  for (const pass of [markPreWrapNewlines, markBrRuns]) {
    try {
      pass(doc, undos)
    } catch (err) {
      console.warn(`[hyday-capture] 分段前處理的 ${pass.name} 失敗，該部分略過`, err)
    }
  }
  return () => {
    for (const undo of undos.reverse()) undo()
  }
}
