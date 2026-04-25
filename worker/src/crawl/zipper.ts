import { zip } from 'fflate'

export interface ZipEntry {
  path: string     // relative path inside ZIP, e.g. "css/style.css"
  data: Uint8Array
}

export function buildZip(entries: ZipEntry[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const files: Record<string, Uint8Array> = {}
    for (const e of entries) {
      files[e.path] = e.data
    }
    zip(files, { level: 1 }, (err: Error | null, data: Uint8Array) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}
