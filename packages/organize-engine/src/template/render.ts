/**
 * 模板渲染核心：依 Source 規則選模板、把變數代入 body 與 properties、
 * 套 filter、把 properties 依型別序列化成 frontmatter。全部純字串邏輯，不碰 DOM。
 */
import type { ExtractedContent, NoteType } from '../types'
import { detectNoteType } from '../noteType'
import { serializeFrontmatter, formatTimestamp } from '../frontmatter'
import type { FrontmatterValue } from '../frontmatter'
import { applyFilters, formatDate } from './filters'
import type { Template, TemplateProperty } from './types'

/** 選模板時要看的頁面訊號 */
export type TemplateSource = {
  url: string
  /** 頁面 schema.org @type（可多個），由宿主 adapter 先抽好 */
  schemaOrgTypes?: string[]
}

function triggerMatches(
  trigger: { type: string; value: string },
  source: TemplateSource,
): boolean {
  switch (trigger.type) {
    case 'urlPrefix':
      return source.url.startsWith(trigger.value)
    case 'regex':
      try {
        return new RegExp(trigger.value).test(source.url)
      } catch {
        return false // 壞掉的正規表達式當不命中，不炸掉整條選擇
      }
    case 'schemaOrg': {
      const want = trigger.value.toLowerCase()
      return (source.schemaOrgTypes ?? []).some((t) => t.toLowerCase() === want)
    }
    default:
      return false
  }
}

/**
 * 依 Source 規則選模板：第一個有 trigger 命中的模板勝出，皆不中則用清單最上面
 * 那組當預設。清單為空回 undefined，讓呼叫端走預設行為。
 */
export function selectTemplate(
  templates: Template[],
  source: TemplateSource,
): Template | undefined {
  if (templates.length === 0) return undefined
  for (const template of templates) {
    const triggers = template.triggers ?? []
    if (triggers.length === 0) continue // 無 trigger 只能當預設
    if (triggers.some((t) => triggerMatches(t, source))) return template
  }
  return templates[0]
}

/** 以引號感知的方式切 pipe，讓 filter 參數裡的 | 不被誤切 */
function splitPipes(expr: string): string[] {
  const parts: string[] = []
  let buf = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (quote) {
      buf += ch
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      buf += ch
      quote = ch
    } else if (ch === '|') {
      parts.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  parts.push(buf)
  return parts
}

export type RenderContext = {
  extracted: ExtractedContent
  now: Date
  /** 已判定的筆記類型，供 {{type}} 變數用 */
  noteType: NoteType
}

/** 解析單一變數引用（不含 filter），回傳其字串值，未知變數回空字串 */
function resolveVariable(ref: string, ctx: RenderContext): string {
  const trimmed = ref.trim()
  const colon = trimmed.indexOf(':')
  if (colon !== -1) {
    const prefix = trimmed.slice(0, colon).trim()
    const key = trimmed.slice(colon + 1).trim()
    const e = ctx.extracted
    if (prefix === 'meta') return e.meta?.[key] ?? ''
    if (prefix === 'selector') return e.selectors?.[key] ?? ''
    if (prefix === 'selectorHtml') return e.selectorsHtml?.[key] ?? ''
    // 非已知前綴，落到下面當一般變數（例如未來擴充），找不到就空字串
  }
  const e = ctx.extracted
  switch (trimmed) {
    case 'title':
      return e.title
    case 'content':
      return e.contentMarkdown
    case 'author':
      return e.author ?? ''
    case 'published':
      return e.published ?? ''
    case 'description':
      return e.description ?? ''
    case 'image':
      return e.image ?? ''
    case 'url':
      return e.url
    case 'domain':
      return e.domain
    case 'type':
      return ctx.noteType
    case 'date':
      return formatTimestamp(ctx.now)
    default:
      return ''
  }
}

/** 求一個值運算式（變數加 filter 串），例如 `{{published|date:"YYYY"}}` 裡的內容 */
function evalExpression(expr: string, ctx: RenderContext): string {
  const segments = splitPipes(expr)
  const varRef = segments[0] ?? ''
  const filters = segments.slice(1)
  return applyFilters(resolveVariable(varRef, ctx), filters)
}

const MUSTACHE = /\{\{([\s\S]*?)\}\}/g

/** 把一段文字裡所有 {{...}} 代入求值後的字串 */
export function interpolate(text: string, ctx: RenderContext): string {
  return text.replace(MUSTACHE, (_m, expr: string) => evalExpression(expr, ctx))
}

function toLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim())
    .filter((line) => line !== '')
}

const TRUTHY = new Set(['true', 'yes', '1', 'on'])

/** 依 property 型別把渲染後的字串值強制成型別正確的 frontmatter 值 */
function coerceProperty(type: TemplateProperty['type'], rendered: string): FrontmatterValue {
  switch (type) {
    case 'number': {
      const n = Number(rendered.trim())
      return Number.isFinite(n) && rendered.trim() !== '' ? n : rendered
    }
    case 'boolean':
      return TRUTHY.has(rendered.trim().toLowerCase())
    case 'date':
      return formatDate(rendered, 'YYYY-MM-DD')
    case 'datetime':
      return formatDate(rendered, 'YYYY-MM-DD HH:mm:ss')
    case 'list':
    case 'multitext':
      return toLines(rendered)
    case 'text':
    default:
      return rendered
  }
}

/**
 * 渲染整份模板成一則 .md 文字。frontmatter 由 properties 依型別序列化而來，
 * 重用 organize-engine 既有的 serializeFrontmatter / yamlScalar，body 由變數代入。
 */
export function renderTemplate(
  template: Template,
  input: { extracted: ExtractedContent; now: Date },
): string {
  const noteType = template.noteType ?? detectNoteType(input.extracted.url)
  const ctx: RenderContext = { extracted: input.extracted, now: input.now, noteType }

  const fields = template.properties.map(
    (prop) =>
      [prop.name, coerceProperty(prop.type, interpolate(prop.value, ctx))] as const,
  )
  const frontmatter = serializeFrontmatter(fields)

  const body = interpolate(template.body, ctx).replace(/\s+$/, '')
  return body ? `${frontmatter}\n\n${body}\n` : `${frontmatter}\n`
}

/**
 * 掃出模板裡引用到的 CSS selector（{{selector:...}} 與 {{selectorHtml:...}}），
 * 給宿主 adapter 知道擷取時要從 DOM 取哪些值。純字串掃描，不碰 DOM。
 */
export function collectSelectorRefs(templates: Template[]): {
  selectors: string[]
  selectorsHtml: string[]
} {
  const selectors = new Set<string>()
  const selectorsHtml = new Set<string>()
  const scan = (text: string) => {
    for (const m of text.matchAll(MUSTACHE)) {
      const expr = m[1] ?? ''
      const varRef = (splitPipes(expr)[0] ?? '').trim()
      const colon = varRef.indexOf(':')
      if (colon === -1) continue
      const prefix = varRef.slice(0, colon).trim()
      const key = varRef.slice(colon + 1).trim()
      if (prefix === 'selector') selectors.add(key)
      else if (prefix === 'selectorHtml') selectorsHtml.add(key)
    }
  }
  for (const t of templates) {
    scan(t.body)
    for (const p of t.properties) scan(p.value)
  }
  return { selectors: [...selectors], selectorsHtml: [...selectorsHtml] }
}
