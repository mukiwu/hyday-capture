// URL 是跨平台的 web 標準（瀏覽器、Node、React Native 都有），但不在 ES2022 lib，
// 這裡明確補上引擎用到的部分。若未來需要其他 web API，同樣在這裡宣告，
// 讓「引擎能用哪些平台無關 API」的邊界一目了然。
declare class URL {
  constructor(url: string, base?: string | URL)
  readonly protocol: string
  readonly hostname: string
  readonly pathname: string
  readonly href: string
  readonly search: string
  readonly hash: string
  readonly searchParams: URLSearchParams
}

declare class URLSearchParams {
  constructor(init?: string)
  get(name: string): string | null
}
