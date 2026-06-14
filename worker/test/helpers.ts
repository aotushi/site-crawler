// 内存版 R2Bucket 测试替身：覆盖本项目用到的 put/get/list/delete/createMultipartUpload
export class FakeBucket {
  store = new Map<string, { data: Uint8Array; customMetadata?: Record<string, string> }>()
  multipartOptions = new Map<string, { httpMetadata?: { contentType?: string } }>()

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { customMetadata?: Record<string, string> },
  ) {
    const data = typeof value === 'string' ? new TextEncoder().encode(value)
      : value instanceof Uint8Array ? new Uint8Array(value)
      : new Uint8Array(value)
    this.store.set(key, { data, customMetadata: options?.customMetadata })
    return { key }
  }

  async get(key: string) {
    const entry = this.store.get(key)
    if (!entry) return null
    return {
      key,
      size: entry.data.byteLength,
      customMetadata: entry.customMetadata,
      arrayBuffer: async () =>
        entry.data.buffer.slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength),
      text: async () => new TextDecoder().decode(entry.data),
    }
  }

  async list(options?: { prefix?: string; cursor?: string; include?: string[] }) {
    const prefix = options?.prefix ?? ''
    const objects = [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => ({ key: k, size: v.data.byteLength, customMetadata: v.customMetadata }))
    return { objects, truncated: false as const }
  }

  async delete(keys: string | string[]) {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.store.delete(k)
  }

  async createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }) {
    this.multipartOptions.set(key, options ?? {})
    const parts = new Map<number, Uint8Array>()
    const store = this.store
    return {
      key,
      uploadId: 'fake-upload',
      async uploadPart(partNumber: number, value: ArrayBuffer | Uint8Array) {
        // 注意：真实 R2 要求非末分片 ≥5MiB 且等长，FakeBucket 不强制——上传方（zip-stream）需自行保证定长分片
        const data = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value)
        parts.set(partNumber, data)
        return { partNumber, etag: `etag-${partNumber}` }
      },
      async complete(uploaded: { partNumber: number; etag: string }[]) {
        const ordered = uploaded.slice().sort((a, b) => a.partNumber - b.partNumber)
        let total = 0
        for (const p of ordered) total += parts.get(p.partNumber)!.byteLength
        const merged = new Uint8Array(total)
        let off = 0
        for (const p of ordered) {
          const d = parts.get(p.partNumber)!
          merged.set(d, off)
          off += d.byteLength
        }
        store.set(key, { data: merged })
        return { key }
      },
      async abort() {
        parts.clear()
      },
    }
  }
}

// 测试中把 FakeBucket 断言成 R2Bucket 传入被测函数
export const asBucket = (b: FakeBucket) => b as unknown as R2Bucket
