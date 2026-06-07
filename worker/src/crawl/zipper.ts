import { zipSync } from 'fflate'

export interface ZipEntry {
  path: string     // relative path inside ZIP, e.g. "css/style.css"
  data: Uint8Array
}

export function buildZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  for (const e of entries) {
    files[e.path] = e.data
  }
  return Promise.resolve(zipSync(files, { level: 1 }))
}
