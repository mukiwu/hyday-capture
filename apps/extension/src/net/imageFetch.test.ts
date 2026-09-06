import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleFetchImageMessage } from './imageFetch'

const IMAGE_URL =
  'https://cdnfile.sspai.com/2026/08/13/example.png?imageView2/2/w/1120/format/webp'
const SOURCE_URL = 'https://sspai.com/post/113420'
const SOURCE_ORIGIN = 'https://sspai.com/'

describe('圖片下載來源頁情境', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('CDN 要求 Referer 時，暫時替 service worker 請求帶上來源頁再清掉規則', async () => {
    let activeReferer: string | undefined
    const updateSessionRules = vi.fn(
      async (update: {
        addRules?: Array<{
          action?: { requestHeaders?: Array<{ header: string; value?: string }> }
        }>
        removeRuleIds?: number[]
      }) => {
        if (update.removeRuleIds) activeReferer = undefined
        const referer = update.addRules?.[0]?.action?.requestHeaders?.find(
          (header) => header.header.toLowerCase() === 'referer',
        )?.value
        if (referer) activeReferer = referer
      },
    )

    vi.stubGlobal('chrome', {
      runtime: { id: 'hyday-capture-test' },
      tabs: { TAB_ID_NONE: -1 },
      declarativeNetRequest: {
        ResourceType: { XMLHTTPREQUEST: 'xmlhttprequest' },
        RuleActionType: { MODIFY_HEADERS: 'modifyHeaders' },
        HeaderOperation: { SET: 'set' },
        updateSessionRules,
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (activeReferer !== SOURCE_ORIGIN) return new Response('hotlink denied', { status: 403 })
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        })
      }),
    )

    const handler = handleFetchImageMessage as (
      url: string,
      sourceUrl?: string,
    ) => ReturnType<typeof handleFetchImageMessage>
    const result = await handler(IMAGE_URL, SOURCE_URL)

    expect(updateSessionRules).toHaveBeenCalledTimes(2)
    expect(updateSessionRules.mock.calls[0]?.[0]).toMatchObject({
      addRules: [
        {
          action: {
            requestHeaders: [{ header: 'Referer', operation: 'set', value: SOURCE_ORIGIN }],
          },
          condition: {
            initiatorDomains: ['hyday-capture-test'],
            resourceTypes: ['xmlhttprequest'],
            tabIds: [-1],
          },
        },
      ],
    })
    const addedRule = updateSessionRules.mock.calls[0]?.[0].addRules?.[0] as
      | { id?: number; condition?: { regexFilter?: string } }
      | undefined
    expect(addedRule?.condition?.regexFilter).toBeDefined()
    expect(new RegExp(addedRule?.condition?.regexFilter ?? '').test(IMAGE_URL)).toBe(true)
    expect(new RegExp(addedRule?.condition?.regexFilter ?? '').test(`${IMAGE_URL}&other=1`)).toBe(false)
    expect(updateSessionRules.mock.calls[1]?.[0]).toMatchObject({
      removeRuleIds: [addedRule?.id],
    })
    expect(activeReferer).toBeUndefined()
    expect(result).toMatchObject({ ok: true, contentType: 'image/webp' })
  })
})

describe('圖片要登入才給的情境', () => {
  // Notion 實案（2026-09-06）：app.notion.com/image/ 的圖匿名請求回 401
  // {"name":"UnauthorizedError","debugMessage":"Must be authenticated."}，
  // service worker 的 fetch 預設不帶 cookie，於是每張需要登入態的圖都下載失敗
  const NOTION_IMAGE = 'https://app.notion.com/image/attachment%3Aabc%3A01.card(ch13).jpg?table=block'
  const NOTION_PAGE = 'https://app.notion.com/p/raymondhouch/01-161e6e226632'

  function stubChrome() {
    vi.stubGlobal('chrome', {
      runtime: { id: 'hyday-capture-test' },
      tabs: { TAB_ID_NONE: -1 },
      declarativeNetRequest: {
        ResourceType: { XMLHTTPREQUEST: 'xmlhttprequest' },
        RuleActionType: { MODIFY_HEADERS: 'modifyHeaders' },
        HeaderOperation: { SET: 'set' },
        updateSessionRules: vi.fn(async () => {}),
      },
    })
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('回 401 時帶著使用者在該站的登入態重試一次', async () => {
    stubChrome()
    const credentialsUsed: Array<string | undefined> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        credentialsUsed.push(init?.credentials)
        if (init?.credentials !== 'include') {
          return new Response('{"name":"UnauthorizedError"}', { status: 401 })
        }
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      }),
    )

    const result = await handleFetchImageMessage(NOTION_IMAGE, NOTION_PAGE)

    expect(credentialsUsed).toEqual([undefined, 'include'])
    expect(result).toMatchObject({ ok: true, contentType: 'image/jpeg' })
  })

  it('一次就拿得到的圖不會多帶登入態去要第二次', async () => {
    stubChrome()
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await handleFetchImageMessage('https://muki.tw/cover.png', 'https://muki.tw/post/1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('帶了登入態還是要不到就照實回報失敗', async () => {
    stubChrome()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })))

    const result = await handleFetchImageMessage(NOTION_IMAGE, NOTION_PAGE)

    expect(result).toMatchObject({ ok: false })
    expect((result as { error: string }).error).toContain('403')
  })
})
