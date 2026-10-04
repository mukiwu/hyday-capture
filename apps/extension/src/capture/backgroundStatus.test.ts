import { describe, expect, it } from 'vitest'
import { pickBackgroundStatus, type BackgroundCaptureStatus } from './backgroundStatus'

const NOW = 1_000_000

describe('pickBackgroundStatus', () => {
  it('沒有背景擷取紀錄時回 undefined，popup 照常自己擷取', () => {
    expect(pickBackgroundStatus(undefined, NOW)).toBeUndefined()
  })

  it('剛完成的背景擷取結果要拿來顯示', () => {
    const status: BackgroundCaptureStatus = {
      state: 'done',
      at: NOW - 2_000,
      filename: 'clippings/a.md',
      collided: false,
      skippedImages: 0,
    }
    expect(pickBackgroundStatus(status, NOW)).toEqual(status)
  })

  it('剛失敗的背景擷取也要顯示錯誤', () => {
    const status: BackgroundCaptureStatus = { state: 'error', at: NOW - 2_000, message: '壞了' }
    expect(pickBackgroundStatus(status, NOW)).toEqual(status)
  })

  it('舊的完成結果不再顯示，避免之後點工具列只看到上一次的結果而沒有擷取', () => {
    const status: BackgroundCaptureStatus = { state: 'error', at: NOW - 60_000, message: '壞了' }
    expect(pickBackgroundStatus(status, NOW)).toBeUndefined()
  })

  it('進行中的背景擷取在合理時間內都要顯示，不能讓 popup 另外再擷取一次', () => {
    const status: BackgroundCaptureStatus = { state: 'running', at: NOW - 30_000 }
    expect(pickBackgroundStatus(status, NOW)).toEqual(status)
  })

  it('卡太久的進行中狀態（service worker 中途被收掉）視為失效', () => {
    const status: BackgroundCaptureStatus = { state: 'running', at: NOW - 10 * 60_000 }
    expect(pickBackgroundStatus(status, NOW)).toBeUndefined()
  })
})
