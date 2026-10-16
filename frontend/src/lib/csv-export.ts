export type CsvValue = string | number | boolean | null | undefined

/** Escape one RFC 4180 CSV field without changing the source value. */
export function escapeCsvValue(value: CsvValue): string {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\r\n') + '\r\n'
}

/** Download a UTF-8 CSV with BOM, then release the temporary object URL. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
