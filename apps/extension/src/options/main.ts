import {
  getOutputDirHandle,
  saveOutputDirHandle,
} from '../storage/dirHandle'
import { ensureReadWritePermission } from '../fs/writeNote'
import {
  selectTemplate,
  renderTemplate,
  type Template,
  type ExtractedContent,
} from '@hyday-capture/organize-engine'
import { loadTemplates, saveTemplates, resetTemplates, DEFAULT_TEMPLATES } from '../templates/store'

const pickBtn = document.getElementById('pick') as HTMLButtonElement
const currentEl = document.getElementById('current')!

function setCurrent(cls: string, ...nodes: (string | Node)[]): void {
  currentEl.className = cls
  currentEl.replaceChildren(...nodes)
}

function code(text: string): HTMLElement {
  const el = document.createElement('code')
  el.textContent = text
  return el
}

async function showCurrent(): Promise<void> {
  const handle = await getOutputDirHandle()
  if (!handle) {
    setCurrent('muted', '尚未選擇資料夾')
    return
  }
  const granted = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
  setCurrent(
    granted ? 'ok' : 'muted',
    '目前輸出資料夾：',
    code(handle.name),
    granted ? '' : '（下次擷取時會再請求寫入權限）',
  )
}

async function pickFolder(): Promise<void> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    const granted = await ensureReadWritePermission(handle)
    if (!granted) {
      // 沒拿到寫入權就存 handle，之後每次擷取都會失敗，使用者卻以為設好了
      setCurrent('err', '沒有取得寫入權限，資料夾未儲存，請再選一次並允許寫入')
      return
    }
    await saveOutputDirHandle(handle)
    await showCurrent()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return // 使用者取消
    setCurrent('err', `選擇資料夾失敗：${err instanceof Error ? err.message : String(err)}`)
  }
}

pickBtn.addEventListener('click', () => {
  void pickFolder()
})
void showCurrent()

// ---- 模板編輯與預覽 ----

const templatesEl = document.getElementById('templates') as HTMLTextAreaElement
const sampleUrlEl = document.getElementById('sampleUrl') as HTMLInputElement
const previewEl = document.getElementById('preview')!
const pickedNameEl = document.getElementById('pickedName')!
const tplStatusEl = document.getElementById('tplStatus')!
const saveBtn = document.getElementById('save') as HTMLButtonElement
const resetBtn = document.getElementById('reset') as HTMLButtonElement

function setTplStatus(cls: string, text: string): void {
  tplStatusEl.className = `hint ${cls}`
  tplStatusEl.textContent = text
}

/** 給預覽用的假頁面資料，讓改模板的效果立刻看得到 */
function sampleExtracted(url: string): ExtractedContent {
  let domain = 'example.com'
  try {
    domain = new URL(url).hostname
  } catch {
    // 網址還沒打完就先沿用預設 domain
  }
  return {
    url,
    domain,
    title: '範例標題 Hello World',
    contentMarkdown: '這是範例正文第一段。\n\n這是第二段。',
    author: 'MUKi',
    published: '2026-07-01',
    description: '一段範例描述',
    image: 'https://example.com/cover.png',
    meta: { 'og:title': 'OG 範例標題', 'og:type': 'article' },
    schemaOrgTypes: ['Article'],
    selectors: { '.price': '$42' },
    selectorsHtml: { '.card': '<p>卡片 <strong>重點</strong></p>' },
  }
}

function parseTemplates(): Template[] | null {
  try {
    const parsed = JSON.parse(templatesEl.value) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setTplStatus('err', '模板必須是至少含一組的陣列')
      return null
    }
    return parsed as Template[]
  } catch (err) {
    setTplStatus('err', `JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/** 依目前的 textarea 與來源網址即時重繪預覽，改模板後輸出隨之改變 */
function renderPreview(): void {
  const templates = parseTemplates()
  if (!templates) {
    previewEl.textContent = ''
    pickedNameEl.textContent = '—'
    return
  }
  const url = sampleUrlEl.value.trim() || 'https://example.com/blog/hello'
  const extracted = sampleExtracted(url)
  const picked = selectTemplate(templates, {
    url: extracted.url,
    schemaOrgTypes: extracted.schemaOrgTypes,
  })
  if (!picked) {
    previewEl.textContent = ''
    pickedNameEl.textContent = '（無）'
    return
  }
  pickedNameEl.textContent = picked.name
  previewEl.textContent = renderTemplate(picked, { extracted, now: new Date() })
  setTplStatus('', '')
}

async function initTemplates(): Promise<void> {
  const templates = await loadTemplates()
  templatesEl.value = JSON.stringify(templates, null, 2)
  renderPreview()
}

saveBtn.addEventListener('click', () => {
  const templates = parseTemplates()
  if (!templates) return
  void saveTemplates(templates).then(() => setTplStatus('ok', '已儲存，之後每次擷取都會套用'))
})

resetBtn.addEventListener('click', () => {
  void resetTemplates().then(() => {
    templatesEl.value = JSON.stringify(DEFAULT_TEMPLATES, null, 2)
    renderPreview()
    setTplStatus('ok', '已重設為預設模板（記得按儲存才會生效於擷取）')
  })
})

templatesEl.addEventListener('input', renderPreview)
sampleUrlEl.addEventListener('input', renderPreview)
void initTemplates()
