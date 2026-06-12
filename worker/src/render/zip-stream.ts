import { Zip, ZipDeflate } from 'fflate'

export interface ZipFileSource {
  path: string
  data: Uint8Array
}

// 流式生成 zip 字节块：逐文件 ZipDeflate(level 1)，1MiB 切片喂入，按产出顺序吐块。
// 任意时刻内存里只有当前文件 + 未排空的输出块，避免 900MB 级产物撑爆 128MB。
export async function* zipChunks(files: AsyncIterable<ZipFileSource>): AsyncGenerator<Uint8Array> {
  const pending: Uint8Array[] = []
  // 用对象字段而非裸 let，避免 TS 对闭包赋值的窄化误判
  const state = { error: null as Error | null, ended: false }
  const zip = new Zip((err, chunk, final) => {
    if (err) { state.error = err; return }
    if (chunk) pending.push(chunk)
    if (final) state.ended = true
  })

  function* drain() {
    while (pending.length > 0) yield pending.shift()!
  }

  const SLICE = 1024 * 1024
  for await (const file of files) {
    if (state.error) throw state.error
    const entry = new ZipDeflate(file.path, { level: 1 })
    zip.add(entry)
    if (file.data.byteLength === 0) {
      // 零长文件也必须 push 一次 final，否则 zip 永不收尾
      entry.push(new Uint8Array(0), true)
    } else {
      for (let off = 0; off < file.data.byteLength; off += SLICE) {
        const end = Math.min(off + SLICE, file.data.byteLength)
        entry.push(file.data.subarray(off, end), end === file.data.byteLength)
        yield* drain()
      }
    }
    yield* drain()
  }
  zip.end()
  if (state.error) throw state.error
  yield* drain()
  if (!state.ended) throw new Error('zip stream did not finalize')
}

export interface MultipartTarget {
  uploadPart(partNumber: number, data: Uint8Array): Promise<{ partNumber: number; etag: string }>
  complete(parts: { partNumber: number; etag: string }[]): Promise<void>
  abort(): Promise<void>
}

// R2 multipart 要求除最后一片外所有分片等长 → 精确攒满 partSize 字节再上传。
// 返回上传总字节数。任何分片失败 → abort 后原样抛出。
export async function uploadChunked(
  target: MultipartTarget,
  chunks: AsyncIterable<Uint8Array>,
  partSize = 8 * 1024 * 1024,
): Promise<number> {
  const parts: { partNumber: number; etag: string }[] = []
  let partNumber = 1
  let totalBytes = 0
  let buf = new Uint8Array(partSize)
  let fill = 0

  try {
    for await (const chunk of chunks) {
      let off = 0
      while (off < chunk.byteLength) {
        const take = Math.min(partSize - fill, chunk.byteLength - off)
        buf.set(chunk.subarray(off, off + take), fill)
        fill += take
        off += take
        if (fill === partSize) {
          parts.push(await target.uploadPart(partNumber++, buf))
          totalBytes += partSize
          buf = new Uint8Array(partSize) // 上传后换新缓冲，避免复用可能被持有的内存
          fill = 0
        }
      }
    }
    // 最后一片；全空内容时也要至少传一片才能 complete
    if (fill > 0 || parts.length === 0) {
      parts.push(await target.uploadPart(partNumber++, buf.subarray(0, fill)))
      totalBytes += fill
    }
    await target.complete(parts)
    return totalBytes
  } catch (e) {
    try { await target.abort() } catch { /* 保留原始错误 */ }
    throw e
  }
}
