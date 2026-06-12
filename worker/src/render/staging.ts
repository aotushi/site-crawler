import { sha16, STATIC_EXTENSIONS } from '../crawl/shared'

// 暂存对象列表项（url/contentType 来自写入时的 customMetadata）
export interface StagedObject {
  key: string
  url: string
  contentType: string
  size: number
}

export function stagingPrefix(taskId: string): string {
  return `render/${taskId}/raw/`
}

// 以 sha16(url) 为键暂存，同一 URL 天然幂等（重复写覆盖同键）
export async function stageObject(
  bucket: R2Bucket,
  taskId: string,
  url: string,
  data: Uint8Array,
  contentType: string,
): Promise<string> {
  const key = stagingPrefix(taskId) + (await sha16(url))
  await bucket.put(key, data, { customMetadata: { url, contentType } })
  return key
}

export async function listStaging(bucket: R2Bucket, taskId: string): Promise<StagedObject[]> {
  const out: StagedObject[] = []
  let cursor: string | undefined
  do {
    // include: ['customMetadata'] 是实际 R2 API 支持的参数，但旧版 workers-types 定义中缺失
    const res = await bucket.list({ prefix: stagingPrefix(taskId), cursor, include: ['customMetadata'] } as R2ListOptions)
    for (const obj of res.objects) {
      out.push({
        key: obj.key,
        url: obj.customMetadata?.url ?? '',
        contentType: obj.customMetadata?.contentType ?? '',
        size: obj.size,
      })
    }
    cursor = res.truncated ? res.cursor : undefined
  } while (cursor)
  return out
}

// 清空某任务的全部暂存对象（R2 delete 单次上限 1000，按 100 一批稳妥）
export async function deleteStaging(bucket: R2Bucket, taskId: string): Promise<void> {
  const objects = await listStaging(bucket, taskId)
  for (let i = 0; i < objects.length; i += 100) {
    await bucket.delete(objects.slice(i, i + 100).map(o => o.key))
  }
}

// 响应是否为应截获的静态资源：排除 HTML/JSON（XHR 数据），收 css/js/图片/字体/音视频
const ASSET_CT_PREFIXES = [
  'text/css', 'application/javascript', 'text/javascript', 'application/x-javascript',
  'image/', 'font/', 'application/font', 'audio/', 'video/',
]
// 扩展名兜底集合 = 静态扩展名去掉页面/数据类
const ASSET_EXTENSIONS = new Set([...STATIC_EXTENSIONS].filter(e => !['.html', '.htm', '.json'].includes(e)))

export function isStaticAssetResponse(url: string, contentType: string): boolean {
  const ct = (contentType || '').toLowerCase().split(';')[0].trim()
  if (ct.includes('html') || ct === 'application/json' || ct.endsWith('+json')) return false
  if (ASSET_CT_PREFIXES.some(p => ct.startsWith(p))) return true
  // Content-Type 缺失或 octet-stream 时按扩展名兜底
  try {
    const path = new URL(url).pathname
    const lastSeg = path.split('/').pop() ?? ''
    const dotIdx = lastSeg.lastIndexOf('.')
    if (dotIdx < 0) return false
    return ASSET_EXTENSIONS.has(lastSeg.slice(dotIdx).toLowerCase())
  } catch {
    return false
  }
}
