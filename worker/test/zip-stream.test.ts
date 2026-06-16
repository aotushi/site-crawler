import { describe, it, expect } from 'vitest'
import { unzipSync } from 'fflate'
import { zipChunks, uploadChunked, MultipartTarget, ZipFileSource } from '../src/render/zip-stream'

async function* toAsync(files: ZipFileSource[]) {
  for (const f of files) yield f
}

// 真随机数据：deflate 压不动，保证 zip 体积 ≈ 原始体积（计划的线性公式会被 deflate 压至 1% 级，测不出分片）
function noise(len: number): Uint8Array {
  const out = new Uint8Array(len)
  // getRandomValues 单次上限 65536，分批填充
  for (let off = 0; off < len; off += 65536) {
    crypto.getRandomValues(out.subarray(off, Math.min(off + 65536, len)))
  }
  return out
}

// 收集上传分片的测试替身
function makeCollectTarget(opts?: { failAtPart?: number }) {
  const uploaded: { partNumber: number; data: Uint8Array }[] = []
  let completed = false
  let aborted = false
  const target: MultipartTarget = {
    async uploadPart(partNumber, data) {
      if (opts?.failAtPart === partNumber) throw new Error('upload failed')
      uploaded.push({ partNumber, data: new Uint8Array(data) })
      return { partNumber, etag: `e${partNumber}` }
    },
    async complete() { completed = true },
    async abort() { aborted = true },
  }
  return {
    target,
    concat() {
      const ordered = uploaded.slice().sort((a, b) => a.partNumber - b.partNumber)
      const total = ordered.reduce((s, p) => s + p.data.byteLength, 0)
      const out = new Uint8Array(total)
      let off = 0
      for (const p of ordered) { out.set(p.data, off); off += p.data.byteLength }
      return out
    },
    get uploaded() { return uploaded },
    get completed() { return completed },
    get aborted() { return aborted },
  }
}

describe('zipChunks + uploadChunked', () => {
  it('roundtrip：流式打包后可完整解出', async () => {
    const big = noise(3 * 1024 * 1024)
    const files: ZipFileSource[] = [
      { path: 'index.html', data: new TextEncoder().encode('<html>hi</html>') },
      { path: 'css/main.css', data: new TextEncoder().encode('body{}') },
      { path: 'img/big.bin', data: big },
      { path: 'empty.txt', data: new Uint8Array(0) },
    ]
    const t = makeCollectTarget()
    const total = await uploadChunked(t.target, zipChunks(toAsync(files)), 1024 * 1024)
    expect(t.completed).toBe(true)
    const zipBytes = t.concat()
    expect(total).toBe(zipBytes.byteLength)
    const out = unzipSync(zipBytes)
    expect(new TextDecoder().decode(out['index.html'])).toBe('<html>hi</html>')
    expect(new TextDecoder().decode(out['css/main.css'])).toBe('body{}')
    expect(Buffer.compare(Buffer.from(out['img/big.bin']), Buffer.from(big))).toBe(0)
    expect(out['empty.txt'].byteLength).toBe(0)
  })

  it('非最后分片严格等长（R2 multipart 要求）', async () => {
    const t = makeCollectTarget()
    await uploadChunked(t.target, zipChunks(toAsync([{ path: 'a.bin', data: noise(2_621_440) }])), 1024 * 1024)
    expect(t.uploaded.length).toBeGreaterThan(1)
    for (const p of t.uploaded.slice(0, -1)) expect(p.data.byteLength).toBe(1024 * 1024)
  })

  it('上传失败时 abort 并抛出', async () => {
    const t = makeCollectTarget({ failAtPart: 1 })
    await expect(
      uploadChunked(t.target, zipChunks(toAsync([{ path: 'a.bin', data: noise(2 * 1024 * 1024) }])), 1024 * 1024),
    ).rejects.toThrow('upload failed')
    expect(t.aborted).toBe(true)
    expect(t.completed).toBe(false)
  })
})
