/**
 * 使用者的模板組，存進 chrome.storage.local，跨 session 存活。
 * 模板本身是純資料（無函式），可直接序列化。整理引擎的選模板與渲染邏輯
 * 在 @hyday-capture/organize-engine，這裡只負責存取。
 */
import type { Template } from '@hyday-capture/organize-engine'

const STORAGE_KEY = 'hyday.templates'

/**
 * 內建的預設模板，貼近走路骨架時的預設輸出（title/type/tags/createdAt/
 * lastModified/sourceUrl/sourceDomain），讓使用者有個能改的起點。
 * 清單最上面那組在皆不中時當預設。
 */
export const DEFAULT_TEMPLATES: Template[] = [
  {
    name: '預設文章',
    properties: [
      { name: 'title', value: '{{title}}', type: 'text' },
      { name: 'type', value: '{{type}}', type: 'text' },
      { name: 'tags', value: '{{tags}}', type: 'list' },
      { name: 'createdAt', value: '{{date}}', type: 'datetime' },
      { name: 'lastModified', value: '{{date}}', type: 'datetime' },
      { name: 'sourceUrl', value: '{{url}}', type: 'text' },
      { name: 'sourceDomain', value: '{{domain}}', type: 'text' },
    ],
    body: '# {{title}}\n\n{{content}}',
  },
]

export async function loadTemplates(): Promise<Template[]> {
  const got = await chrome.storage.local.get(STORAGE_KEY)
  const stored = got[STORAGE_KEY] as Template[] | undefined
  if (Array.isArray(stored) && stored.length > 0) return stored
  return DEFAULT_TEMPLATES
}

export async function saveTemplates(templates: Template[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: templates })
}

export async function resetTemplates(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}
