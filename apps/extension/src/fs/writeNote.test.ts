import { describe, expect, it } from 'vitest'
import { writeClippingToVault } from './writeNote'

type MemoryFile = { content: string }

function directory(initialNames: string[]): {
  handle: FileSystemDirectoryHandle
  files: Map<string, MemoryFile>
} {
  const files = new Map(initialNames.map((name) => [name, { content: 'existing' }]))
  const handle = {
    getDirectoryHandle: async () => handle,
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name) && !options?.create) throw new DOMException('missing', 'NotFoundError')
      const file = files.get(name) ?? { content: '' }
      files.set(name, file)
      return {
        createWritable: async () => ({
          write: async (content: string) => {
            file.content = content
          },
          close: async () => undefined,
        }),
      }
    },
  } as unknown as FileSystemDirectoryHandle
  return { handle, files }
}

describe('writeClippingToVault', () => {
  it('檔名後綴已存在時繼續找下一個，不覆寫任何既有檔案', async () => {
    const { handle, files } = directory([
      'A.md',
      'A 20260715-093005.md',
      'A 20260715-093005-1.md',
    ])
    const result = await writeClippingToVault(
      handle,
      { filename: 'A.md', markdown: 'new content' },
      new Date(2026, 6, 15, 9, 30, 5),
    )

    expect(result.filename).toBe('clippings/A 20260715-093005-2.md')
    expect(files.get('A.md')?.content).toBe('existing')
    expect(files.get('A 20260715-093005.md')?.content).toBe('existing')
    expect(files.get('A 20260715-093005-1.md')?.content).toBe('existing')
    expect(files.get('A 20260715-093005-2.md')?.content).toBe('new content')
  })
})
