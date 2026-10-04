/**
 * postBoundary 安全網的收口：邊界標記只能讓結果變好，不能讓擷取從可用變失敗。
 *
 * postBoundary 靠啟發式訊號（指向本頁的連結）標出目標貼文容器，啟發式就會有誤判。
 * 過去誤判的後果是 Defuddle 被 contentSelector 綁死在錯的容器上，抽出空內容直接報
 * 「抽取不到正文」，比沒有這個功能還糟（muki.tw 留言表單誤標實案，2026-08-05）。
 *
 * 這裡把不變量做成結構保證：帶 selector 抽出空內容（或抽取拋錯）就退回不帶 selector
 * 的原生抽取重試，兩次都空才交由上層報失敗。未來任何新型態的誤判，最壞情況都只是
 * 退回「沒有邊界偵測」的行為，不會讓原本抽得到的頁面變成抽不到。
 *
 * 刻意只在「全空」時退回，不用長度門檻：feed 型網站的貼文可以合法地只有一句話，
 * 用門檻判斷會把短貼文誤退回整片 feed，重演 postBoundary 當初要解的問題。
 *
 * 抽取本身是非同步的（Defuddle 的 YouTube 字幕只有 parseAsync 拿得到），所以 reject
 * 也要當成「這次抽取失敗」退回原生抽取；同步 try/catch 接不到 rejected Promise，
 * 一定要 await 在 try 裡面。parse 同時收同步與非同步實作，測試給同步值也成立。
 */
export async function parseWithBoundaryFallback<T extends { content?: string | null }>(
  boundarySelector: string | undefined,
  parse: (selector: string | undefined) => T | Promise<T>,
): Promise<T> {
  if (!boundarySelector) return parse(undefined)

  let withBoundary: T
  try {
    withBoundary = await parse(boundarySelector)
  } catch {
    return parse(undefined)
  }
  if ((withBoundary.content ?? '').trim()) return withBoundary
  return parse(undefined)
}
