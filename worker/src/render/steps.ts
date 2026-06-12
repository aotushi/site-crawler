import { sha16, urlToZipPath, rewriteHtml, rewriteCss, fetchUrl, collectSitemapUrls, normalizeLinks } from '../crawl/shared'
import { parseAssets, parseCssUrls } from '../crawl/parser'
import { listStaging, stageObject, isStaticAssetResponse, ASSET_MAX_BYTES } from './staging'
import { zipChunks, uploadChunked, ZipFileSource } from './zip-stream'

// 页面发现 = 入口 URL + sitemap（同源、去 hash、去重），截断到 maxPages
export async function discoverPages(entryUrl: string, maxPages: number): Promise<string[]> {
  const origin = new URL(entryUrl).origin
  const seen = new Set<string>(normalizeLinks([entryUrl], origin))
  for (const u of normalizeLinks(await collectSitemapUrls(origin), origin)) seen.add(u)
  return [...seen].slice(0, maxPages)
}

// 扫描暂存的 HTML/CSS，找出被引用但尚未暂存的资源 URL（最多 cap 个）。
// 不按类型预过滤：无扩展名资源交给 fetchAssetBatch 按响应 Content-Type 判定。
export async function collectMissingAssets(bucket: R2Bucket, taskId: string, cap: number): Promise<string[]> {
  if (cap <= 0) return []
  const staged = await listStaging(bucket, taskId)
  const stagedHashes = new Set(staged.map(o => o.key.split('/').pop()!))
  const missing = new Set<string>()

  outer:
  for (const obj of staged) {
    const ct = obj.contentType
    if (!ct.includes('text/html') && !ct.includes('text/css')) continue
    const body = await bucket.get(obj.key)
    if (!body) continue
    const text = await body.text()
    const candidates = ct.includes('text/css')
      ? parseCssUrls(text, obj.url)
      : parseAssets(text, obj.url).assets
    for (const u of candidates) {
      if (missing.size >= cap) break outer
      if (missing.has(u)) continue
      if (stagedHashes.has(await sha16(u))) continue
      missing.add(u)
    }
  }
  return [...missing]
}

export interface FetchAssetsResult {
  bytesAdded: number
  objectsAdded: number
  budgetExhausted: boolean
}

const FETCH_CONCURRENCY = 6

// 直连补抓缺失资源（渲染时未触发加载的图片/字体等），按响应 Content-Type 过滤
export async function fetchAssetBatch(
  bucket: R2Bucket,
  taskId: string,
  urls: string[],
  byteBudgetLeft: number,
  objectBudgetLeft: number,
): Promise<FetchAssetsResult> {
  let bytesAdded = 0
  let objectsAdded = 0
  let budgetExhausted = false

  for (let i = 0; i < urls.length && !budgetExhausted; i += FETCH_CONCURRENCY) {
    const slice = urls.slice(i, i + FETCH_CONCURRENCY)
    await Promise.all(slice.map(async (url) => {
      // 单资源体积上限：超限时 fetchUrl 返回 null，走下方跳过分支
      const res = await fetchUrl(url, { maxBytes: ASSET_MAX_BYTES })
      if (!res) return
      const ct = ((res.contentType || '').split(';')[0] ?? '').trim()
      if (!isStaticAssetResponse(url, ct)) return
      // check 与累加之间无 await，单线程下原子
      if (bytesAdded + res.data.byteLength > byteBudgetLeft || objectsAdded + 1 > objectBudgetLeft) {
        budgetExhausted = true
        return
      }
      bytesAdded += res.data.byteLength
      objectsAdded += 1
      await stageObject(bucket, taskId, url, res.data, ct)
    }))
  }
  return { bytesAdded, objectsAdded, budgetExhausted }
}

// 把暂存对象统一读出 → 重写链接 → 流式打包 multipart 上传到最终 zipKey
export async function zipStaging(
  bucket: R2Bucket,
  taskId: string,
  sourceUrl: string,
  zipKey: string,
): Promise<{ files: number; zipBytes: number }> {
  const startOrigin = new URL(sourceUrl).origin
  const staged = await listStaging(bucket, taskId)

  // url → zip 内路径；不同 URL 撞同一路径时首写者保留
  const urlToPath = new Map<string, string>()
  const usedPaths = new Set<string>()
  const entries: { key: string; url: string; contentType: string; path: string }[] = []
  for (const obj of staged) {
    if (!obj.url) continue
    const path = urlToZipPath(obj.url, startOrigin)
    if (usedPaths.has(path)) continue
    usedPaths.add(path)
    urlToPath.set(obj.url, path)
    entries.push({ key: obj.key, url: obj.url, contentType: obj.contentType, path })
  }

  // 逐文件按需读 R2，避免整站载入内存
  async function* sources(): AsyncGenerator<ZipFileSource> {
    for (const e of entries) {
      const body = await bucket.get(e.key)
      // 暂存对象缺失说明不变量被破坏，抛出让 step 重试而非产出残缺 zip
      if (!body) throw new Error(`staged object missing: ${e.key}`)
      let data: Uint8Array = new Uint8Array((await body.arrayBuffer()) as ArrayBuffer)
      if (e.contentType.includes('text/html')) data = rewriteHtml(data, e.url, urlToPath)
      else if (e.contentType.includes('text/css')) data = rewriteCss(data, e.url, urlToPath)
      yield { path: e.path, data }
    }
  }

  const upload = await bucket.createMultipartUpload(zipKey)
  const target = {
    uploadPart: async (partNumber: number, data: Uint8Array) => {
      const p = await upload.uploadPart(partNumber, data)
      return { partNumber: p.partNumber, etag: p.etag }
    },
    complete: async (parts: { partNumber: number; etag: string }[]) => { await upload.complete(parts) },
    abort: async () => { await upload.abort() },
  }
  const zipBytes = await uploadChunked(target, zipChunks(sources()))
  return { files: entries.length, zipBytes }
}
