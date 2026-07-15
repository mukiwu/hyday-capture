import { describe, it, expect } from 'vitest'
import { validateTemplates, missingRequiredProperties } from './validate'
import type { Template } from '@hyday-capture/organize-engine'

function tpl(propNames: string[]): Template {
  return {
    name: 't',
    properties: propNames.map((name) => ({ name, value: '', type: 'text' })),
    body: '{{content}}',
  }
}

const FULL = ['title', 'type', 'tags', 'createdAt', 'lastModified']

describe('missingRequiredProperties', () => {
  it('齊全時回空陣列', () => {
    expect(missingRequiredProperties(tpl([...FULL, 'sourceUrl']))).toEqual([])
  })
  it('列出缺少的必要欄位', () => {
    expect(missingRequiredProperties(tpl(['title', 'type']))).toEqual([
      'tags',
      'createdAt',
      'lastModified',
    ])
  })
})

describe('validateTemplates', () => {
  it('全部合規回空陣列', () => {
    expect(validateTemplates([tpl(FULL), tpl(FULL)])).toEqual([])
  })
  it('回報有缺欄位的那幾組（任何模板都可能被選中，故逐組把關）', () => {
    const result = validateTemplates([tpl(FULL), tpl(['title'])])
    expect(result).toHaveLength(1)
    expect(result[0]!.missing).toContain('tags')
  })
})
