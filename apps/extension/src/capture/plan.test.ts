import { describe, it, expect } from 'vitest'
import {
  planFromContextMenu,
  planFromCommand,
  MENU_IDS,
  CAPTURE_PAGE_COMMAND,
} from './plan'

describe('planFromContextMenu', () => {
  it('點連結項時以連結 URL 為來源', () => {
    expect(
      planFromContextMenu({ menuItemId: MENU_IDS.link, linkUrl: 'https://example.com/a' }),
    ).toEqual({ source: 'link', linkUrl: 'https://example.com/a' })
  })

  it('連結項但沒有 linkUrl 時回 null，不亂擷取當前頁', () => {
    expect(planFromContextMenu({ menuItemId: MENU_IDS.link })).toBeNull()
  })

  it('點選取項時只擷取選取內容', () => {
    expect(
      planFromContextMenu({ menuItemId: MENU_IDS.selection, selectionText: '一段話' }),
    ).toEqual({ source: 'active-tab', selectionOnly: true })
  })

  it('點頁面項時擷取整頁', () => {
    expect(planFromContextMenu({ menuItemId: MENU_IDS.page })).toEqual({
      source: 'active-tab',
      selectionOnly: false,
    })
  })

  it('不是我們的選單項回 null', () => {
    expect(planFromContextMenu({ menuItemId: 'someone-elses-menu' })).toBeNull()
  })
})

describe('planFromCommand', () => {
  it('capture-page 指令擷取整頁', () => {
    expect(planFromCommand(CAPTURE_PAGE_COMMAND)).toEqual({
      source: 'active-tab',
      selectionOnly: false,
    })
  })

  it('未知指令回 null', () => {
    expect(planFromCommand('unknown')).toBeNull()
  })
})
