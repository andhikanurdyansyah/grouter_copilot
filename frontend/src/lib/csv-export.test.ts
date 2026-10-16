import { describe, expect, it, vi } from 'vitest'
import { buildCsv, downloadCsv, escapeCsvValue } from './csv-export'

describe('csv export', () => {
  it('escapes RFC 4180 fields and preserves raw values', () => {
    expect(escapeCsvValue('Acme, Inc.')).toBe('"Acme, Inc."')
    expect(escapeCsvValue('say "hello"')).toBe('"say ""hello"""')
    expect(escapeCsvValue('line 1\nline 2')).toBe('"line 1\nline 2"')
    expect(buildCsv(['id', 'amount'], [['ord-1', 1200], ['ord-2', null]])).toBe(
      'id,amount\r\nord-1,1200\r\nord-2,\r\n',
    )
  })

  it('downloads the CSV and defers object URL cleanup until after the click', () => {
    vi.useFakeTimers()
    const blob = new Blob(['id\r\n1\r\n'], { type: 'text/csv;charset=utf-8' })
    let blobArgs: unknown[] = []
    const blobSpy = vi.spyOn(globalThis, 'Blob').mockImplementation(
      function (...args: unknown[]) {
        blobArgs = args
        return blob
      } as unknown as typeof Blob,
    )
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-csv')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.fn()
    const anchor = { href: '', download: '', click } as unknown as HTMLAnchorElement
    const createElement = vi.fn().mockReturnValue(anchor)
    vi.stubGlobal('document', { createElement })

    try {
      downloadCsv('report.csv', 'id\r\n1\r\n')

      expect(blobSpy).toHaveBeenCalledOnce()
      expect(blobArgs[0]).toEqual([new Uint8Array([0xef, 0xbb, 0xbf]), 'id\r\n1\r\n'])
      expect(blobArgs[1]).toEqual({ type: 'text/csv;charset=utf-8' })
      expect(createObjectUrl).toHaveBeenCalledWith(blob)
      expect(createElement).toHaveBeenCalledWith('a')
      expect(anchor.href).toBe('blob:test-csv')
      expect(anchor.download).toBe('report.csv')
      expect(click).toHaveBeenCalledOnce()
      expect(revokeObjectUrl).not.toHaveBeenCalled()

      vi.runAllTimers()
      expect(revokeObjectUrl).toHaveBeenCalledOnce()
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test-csv')
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })
})
