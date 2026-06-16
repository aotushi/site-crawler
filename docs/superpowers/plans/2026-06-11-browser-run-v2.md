# Browser Run V2 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 V1 的 "GitHub Actions JS 爬取" 替换为 Cloudflare Browser Run + Workflows 的异步全站渲染爬取，单入口自动分流（静态站走 V1 链路，SPA 走渲染链路）。

**Architecture:** `/api/crawl` 入口探测 `isJsRendered` 后分流：JS 站创建 `render_tasks` 记录并启动 `RenderCrawlWorkflow`（发现页面 → 批量渲染并截获静态资源暂存 R2 → 补抓缺失资源 → 流式打包 multipart 上传 → 收尾清理），前端通过 SSE 拿到 `taskId` 后轮询 `/api/crawl/render/:taskId`。月度浏览器时长硬熔断 + 页数/字节上限保护成本。

**Tech Stack:** Cloudflare Workers + Browser Run（`@cloudflare/puppeteer`）+ Workflows + D1 + R2（multipart）+ fflate 流式 Zip；前端 React 19 + TanStack Router；测试 vitest。

**Spec:** `docs/superpowers/specs/2026-06-11-browser-run-v2-design.md`（本计划的需求与决策依据）

---

## 全局约定（每个任务开工前必读）

- 仓库根目录：`E:/code/github/resume/site-crawler`。下文相对路径均相对仓库根；`npx wrangler` / `npm` 命令注明在 `worker/` 或 `app/` 下执行。
- ⚠️ **git 索引里预暂存了用户自己的 `.gitignore` 和 `readme.md`（repo 根），严禁提交它们**。所有提交一律用路径限定形式：
  ```bash
  git add <文件...>
  git commit -m "<msg>" -- <文件...>
  ```
- worker 测试命令：`npm test`（Task 1 配置，vitest run）。类型检查：`npx tsc --noEmit`（只覆盖 `src/`，测试文件不在 tsconfig include 内，属预期）。
- 本地 D1/R2 状态由 wrangler 存于 `worker/.wrangler/state`，`--local` 命令与 `wrangler dev` 共享同一份。
- **数据安全**：用户已对本项目预授权直接操作（含远程 D1），但仍须先本地验证再动远程；Task 15 执行远程命令时在输出里知会一声即可，不必等确认。其他项目不适用此授权。
- Workflows 纪律（贯穿 Task 10）：**replay 会从头重跑 `run()`，步骤外代码会重复执行——所有副作用（D1 写、R2 写）必须放在 `step.do` 闭包内**；步骤返回值须可序列化且 ≤1MiB；单步子请求 ~1000 条（fetch/R2/D1 都计数）。

## 文件结构总览

| 动作 | 路径 | 职责 |
|------|------|------|
| 新增 | `worker/vitest.config.ts` | 测试配置 |
| 新增 | `worker/test/helpers.ts` | FakeBucket（内存版 R2，含 multipart） |
| 新增 | `worker/test/{shared,config,staging,quota,zip-stream,steps}.test.ts` | 单元/集成测试 |
| 新增 | `worker/src/crawl/shared.ts` | V1/V2 共用纯函数（URL→路径、重写、sha16、fetchUrl、sitemap） |
| 新增 | `worker/src/db/migrations/004_add_render_tasks.sql` | render_tasks + render_usage 表 |
| 新增 | `worker/src/render/config.ts` | RENDER_* 环境变量解析 + RENDER_MAX_OBJECTS |
| 新增 | `worker/src/render/staging.ts` | R2 暂存读写删 + isStaticAssetResponse |
| 新增 | `worker/src/render/quota.ts` | monthKey / 预算熔断判定 |
| 新增 | `worker/src/render/zip-stream.ts` | 流式 zip 生成 + 定长分片 multipart 上传 |
| 新增 | `worker/src/render/browser.ts` | 单批顺序渲染 + 响应截获暂存 |
| 新增 | `worker/src/render/steps.ts` | discoverPages / collectMissingAssets / fetchAssetBatch / zipStaging |
| 新增 | `worker/src/render/workflow.ts` | RenderCrawlWorkflow 编排 |
| 新增 | `worker/src/render/handler.ts` | GET /api/crawl/render/:taskId |
| 修改 | `worker/src/crawl/engine.ts` | 删除已抽取函数，改为从 shared 导入 |
| 修改 | `worker/src/crawl/parser.ts` | decodeEntities 改从 shared 导入 |
| 修改 | `worker/src/crawl/handler.ts` | sha16 复用；入口探测分流到渲染链路 |
| 修改 | `worker/src/db/queries.ts` | RenderTask CRUD + render_usage + ip_usage 'render' 类型 |
| 修改 | `worker/src/index.ts` | Env 增绑定；渲染状态路由；删 js 路由；导出 Workflow 类 |
| 修改 | `worker/wrangler.toml` | compat 日期、[browser]、[[workflows]]、RENDER_* vars（env.dev 镜像） |
| 修改 | `worker/package.json` | +@cloudflare/puppeteer、+vitest、test 脚本 |
| 删除 | `worker/src/crawl/js-handler.ts`、`worker/src/crawl/github.ts` | GHA 链路下线 |
| 修改 | `app/src/lib/api.ts` | getRenderStatus + RenderStatus |
| 修改 | `app/src/lib/crawl-state.ts` | mode / renderTaskId 字段 |
| 修改 | `app/src/lib/i18n.ts` | 删 crawl_js_*（保留 crawl_js_warning），增 crawl_render_* |
| 修改 | `app/src/routes/crawl.tsx` | SSE 增 render_task/notice 事件；渲染任务轮询与恢复 |
| 修改 | `app/src/components/CrawlProgress.tsx` | JS 爬取卡片 → 渲染车道卡片 |
| 修改 | `README.md` | 架构/功能/部署说明换为 Browser Run + Workflows |

---

# Phase A 基础设施

### Task 1: Worker 测试脚手架

**Files:**
- Modify: `worker/package.json`
- Create: `worker/vitest.config.ts`

- [ ] **Step 1: 安装 vitest**

```bash
cd worker
npm install -D vitest@^4.1.5
```

Expected: `package.json` devDependencies 出现 `"vitest": "^4.1.5"`。

- [ ] **Step 2: 创建 vitest 配置**

创建 `worker/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    passWithNoTests: true,
  },
})
```

- [ ] **Step 3: 替换 package.json 的 test 脚本**

把 `worker/package.json` 的 scripts 改为：

```json
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 4: 验证空跑通过**

```bash
cd worker
npm test
```

Expected: 退出码 0，输出包含 `No test files found, exiting with code 0`。

- [ ] **Step 5: 提交**

```bash
git add worker/package.json worker/package-lock.json worker/vitest.config.ts
git commit -m "test(worker): vitest 测试脚手架" -- worker/package.json worker/package-lock.json worker/vitest.config.ts
```

---

### Task 2: 抽取共用纯函数 shared.ts（TDD）

V1 `engine.ts` 内嵌的 URL→zip 路径、链接重写、fetch、sitemap 函数是 V2 打包/补抓的依赖。原样搬出（不改行为），新增 `sha16` 与 `normalizeLinks`。

**Files:**
- Test: `worker/test/shared.test.ts`
- Create: `worker/src/crawl/shared.ts`
- Modify: `worker/src/crawl/engine.ts`（整文件替换）
- Modify: `worker/src/crawl/parser.ts:8-16`（decodeEntities 改导入）
- Modify: `worker/src/crawl/handler.ts:10-14`（hashStaticUrl 改用 sha16）

- [ ] **Step 1: 写失败测试**

创建 `worker/test/shared.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  sha16, urlToZipPath, relPath, decodeEntities, tryResolve,
  rewriteHtml, rewriteCss, normalizeLinks,
} from '../src/crawl/shared'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (d: Uint8Array) => new TextDecoder().decode(d)

describe('sha16', () => {
  it('返回 sha256 hex 前 16 位', async () => {
    const expected = createHash('sha256').update('static:https://example.com').digest('hex').slice(0, 16)
    expect(await sha16('static:https://example.com')).toBe(expected)
  })
})

describe('urlToZipPath', () => {
  const origin = 'https://a.com'
  it('根路径与无扩展名路径落为 index.html', () => {
    expect(urlToZipPath('https://a.com/', origin)).toBe('index.html')
    expect(urlToZipPath('https://a.com/about', origin)).toBe('about/index.html')
    expect(urlToZipPath('https://a.com/blog/', origin)).toBe('blog/index.html')
  })
  it('静态扩展名保留原路径', () => {
    expect(urlToZipPath('https://a.com/css/main.css', origin)).toBe('css/main.css')
  })
  it('跨域资源置于 _external/<host>/ 下', () => {
    expect(urlToZipPath('https://cdn.b.com/img.png', origin)).toBe('_external/cdn.b.com/img.png')
  })
})

describe('relPath', () => {
  it('同级与子目录', () => {
    expect(relPath('index.html', 'css/main.css')).toBe('css/main.css')
    expect(relPath('index.html', 'index.html')).toBe('index.html')
  })
  it('需要向上回溯', () => {
    expect(relPath('blog/index.html', 'css/main.css')).toBe('../css/main.css')
    expect(relPath('a/b/c.html', 'a/d.png')).toBe('../d.png')
  })
})

describe('decodeEntities / tryResolve', () => {
  it('解码常见实体', () => {
    expect(decodeEntities('&quot;x&quot;&amp;&apos;y&apos;')).toBe('"x"&\'y\'')
  })
  it('tryResolve 过滤非 http 与无效 URL，去 hash', () => {
    const base = new URL('https://a.com/page/')
    expect(tryResolve('../x.png#frag', base)).toBe('https://a.com/x.png')
    expect(tryResolve('data:image/png;base64,xx', base)).toBeNull()
    expect(tryResolve('javascript:void(0)', base)).toBeNull()
  })
})

describe('normalizeLinks', () => {
  it('仅保留同源，去 hash 去重', () => {
    expect(normalizeLinks([
      'https://a.com/about#top',
      'https://a.com/about',
      'https://b.com/x',
      'not a url',
    ], 'https://a.com')).toEqual(['https://a.com/about'])
  })
})

describe('rewriteHtml / rewriteCss', () => {
  const urlToPath = new Map([
    ['https://a.com/', 'index.html'],
    ['https://a.com/css/main.css', 'css/main.css'],
    ['https://a.com/img/bg.png', 'img/bg.png'],
    ['https://a.com/about/', 'about/index.html'],
  ])
  it('重写 href 与内联 url() 为相对路径', () => {
    const html = '<link href="/css/main.css"><a href="https://a.com/about/">x</a><div style="background:url(&quot;/img/bg.png&quot;)"></div>'
    const out = dec(rewriteHtml(enc(html), 'https://a.com/', urlToPath))
    expect(out).toContain('href="css/main.css"')
    expect(out).toContain('href="about/index.html"')
    expect(out).toContain('url(&quot;img/bg.png&quot;)')
  })
  it('CSS url() 相对自身路径重写', () => {
    const css = 'body{background:url(/img/bg.png)}'
    const out = dec(rewriteCss(enc(css), 'https://a.com/css/main.css', urlToPath))
    expect(out).toContain('url(../img/bg.png)')
  })
  it('未下载的 URL 保持原样', () => {
    const html = '<img src="https://other.com/x.png">'
    const out = dec(rewriteHtml(enc(html), 'https://a.com/', urlToPath))
    expect(out).toContain('https://other.com/x.png')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd worker
npm test
```

Expected: FAIL，报错 `Cannot find module '../src/crawl/shared'`（或等价 resolve 错误）。

- [ ] **Step 3: 创建 shared.ts（实现）**

创建 `worker/src/crawl/shared.ts`（urlToZipPath/relPath/decodeEntities/tryResolve/rewriteHtml/rewriteCss/fetchUrl/collectSitemapUrls 均从 engine.ts 原样搬出，不改逻辑）：

```ts
// V1 静态链路与 V2 渲染链路共用的纯函数（自 engine.ts/parser.ts 抽取）

export const STATIC_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.json', '.map',
  '.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.webm', '.ogg', '.pdf', '.zip',
])

// sha256 hex 前 16 位，统一的缓存键/暂存键哈希
export async function sha16(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

// URL → zip 内相对路径，无扩展名页面存为 path/index.html
// 跨域资源放到 _external/<host>/ 下，避免与同源资源路径碰撞
export function urlToZipPath(url: string, startOrigin: string): string {
  const parsed = new URL(url)
  let path = parsed.pathname.replace(/^\//, '') || 'index.html'
  if (path.endsWith('/')) {
    path += 'index.html'
  } else {
    const lastSeg = path.split('/').pop() ?? ''
    const dotIdx = lastSeg.lastIndexOf('.')
    const ext = dotIdx >= 0 ? lastSeg.slice(dotIdx).toLowerCase() : ''
    if (!STATIC_EXTENSIONS.has(ext)) {
      path = path.replace(/\/$/, '') + '/index.html'
    }
  }
  if (parsed.origin !== startOrigin) {
    path = `_external/${parsed.hostname}/${path}`
  }
  return path
}

// 计算从 fromPath 到 toPath 的相对路径
export function relPath(fromPath: string, toPath: string): string {
  const fromParts = fromPath.split('/').slice(0, -1) // 去掉文件名，只保留目录
  const toParts = toPath.split('/')
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++
  }
  const ups = fromParts.length - common
  const rel = [...Array(ups).fill('..'), ...toParts.slice(common)].join('/')
  return rel || './' + toParts[toParts.length - 1]
}

// 解码 HTML 实体（内联 style 中的 &quot; 等），供 url() 解析/重写使用
export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0*34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/g, '&')
}

// 重写阶段不限同源：只要该 URL 已被下载（在 urlToPath 中）即重写为本地相对路径
export function tryResolve(rawUrl: string, base: URL): string | null {
  if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('javascript:')) return null
  try {
    const resolved = new URL(rawUrl, base)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    resolved.hash = ''
    return resolved.href
  } catch {
    return null
  }
}

// 页面链接规范化：仅保留同源 http(s)，去 hash 去重（渲染链路 BFS 用）
export function normalizeLinks(rawLinks: string[], startOrigin: string): string[] {
  const out = new Set<string>()
  for (const raw of rawLinks) {
    try {
      const u = new URL(raw)
      if (u.origin !== startOrigin) continue
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      u.hash = ''
      out.add(u.href)
    } catch { /* 忽略无效链接 */ }
  }
  return [...out]
}

// 重写 HTML 中的绝对 URL 为相对路径
export function rewriteHtml(data: Uint8Array, pageUrl: string, urlToPath: Map<string, string>): Uint8Array {
  let html = new TextDecoder().decode(data)
  const pageZipPath = urlToPath.get(pageUrl)!
  const base = new URL(pageUrl)

  // 替换 href/src/srcset/poster/data 属性中的同源 URL
  html = html.replace(
    /((?:href|src|poster|data|action)=["'])([^"']+)(["'])/g,
    (match, prefix, rawUrl, suffix) => {
      const resolved = tryResolve(rawUrl, base)
      if (!resolved) return match
      const targetPath = urlToPath.get(resolved)
      if (!targetPath) return match
      return prefix + relPath(pageZipPath, targetPath) + suffix
    }
  )

  // srcset
  html = html.replace(
    /(srcset=["'])([^"']+)(["'])/g,
    (match, prefix, srcset, suffix) => {
      const rewritten = srcset.split(',').map((part: string) => {
        const trimmed = part.trim()
        const spaceIdx = trimmed.search(/\s/)
        const rawUrl = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed
        const descriptor = spaceIdx >= 0 ? trimmed.slice(spaceIdx) : ''
        const resolved = tryResolve(rawUrl, base)
        if (!resolved) return part
        const targetPath = urlToPath.get(resolved)
        if (!targetPath) return part
        return relPath(pageZipPath, targetPath) + descriptor
      }).join(', ')
      return prefix + rewritten + suffix
    }
  )

  // 内联 style 属性与 <style> 块中的 url(...)（含 &quot; 实体），重写为本地相对路径
  html = html.replace(
    /url\(\s*(&quot;|&#0*34;|["'])?([^)]*?)\1?\s*\)/gi,
    (match, quote, rawUrl) => {
      const cleaned = decodeEntities((rawUrl ?? '').trim())
      if (!cleaned) return match
      const resolved = tryResolve(cleaned, base)
      if (!resolved) return match
      const targetPath = urlToPath.get(resolved)
      if (!targetPath) return match
      const q = quote ?? ''
      return `url(${q}${relPath(pageZipPath, targetPath)}${q})`
    }
  )

  return new TextEncoder().encode(html)
}

// 重写 CSS 中 url() 的已下载 URL 为相对路径
export function rewriteCss(data: Uint8Array, cssUrl: string, urlToPath: Map<string, string>): Uint8Array {
  let css = new TextDecoder().decode(data)
  const cssZipPath = urlToPath.get(cssUrl)!
  const base = new URL(cssUrl)

  css = css.replace(
    /url\(\s*(['"]?)([^)'"]+)\1\s*\)/g,
    (match, quote, rawUrl) => {
      const resolved = tryResolve(rawUrl.trim(), base)
      if (!resolved) return match
      const targetPath = urlToPath.get(resolved)
      if (!targetPath) return match
      return `url(${quote}${relPath(cssZipPath, targetPath)}${quote})`
    }
  )

  return new TextEncoder().encode(css)
}

// 带浏览器请求头抓取单个 URL；非 2xx/网络错误返回 null
export async function fetchUrl(url: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      // 使用真实浏览器请求头，避免 SiteCrawlerBot 之类自曝身份被 WAF 直接拦截
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const data = new Uint8Array(buf)
    const contentType = res.headers.get('Content-Type') ?? ''
    return { data, contentType }
  } catch {
    return null
  }
}

// 拉取站点 sitemap，返回同源页面 URL 列表（支持 sitemapindex 两层）
export async function collectSitemapUrls(origin: string): Promise<string[]> {
  const decode = (d: Uint8Array) => new TextDecoder().decode(d)
  const sameOrigin = (raw: string): string | null => {
    try {
      const parsed = new URL(raw.replace(/&amp;/g, '&'))
      if (parsed.origin !== origin) return null
      parsed.hash = ''
      return parsed.href
    } catch {
      return null
    }
  }
  const extractLocs = (xml: string): string[] => {
    const out: string[] = []
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) out.push(m[1])
    return out
  }

  let rootXml: string | null = null
  for (const p of ['/sitemap_index.xml', '/sitemap.xml', '/wp-sitemap.xml']) {
    const r = await fetchUrl(new URL(p, origin).href)
    if (r) {
      const xml = decode(r.data)
      if (xml.includes('<loc')) { rootXml = xml; break }
    }
  }
  if (!rootXml) return []

  const pages = new Set<string>()
  if (/<sitemapindex[\s>]/i.test(rootXml)) {
    // sitemap 索引：逐个抓子 sitemap
    for (const sm of extractLocs(rootXml)) {
      const smUrl = sameOrigin(sm)
      if (!smUrl) continue
      const r = await fetchUrl(smUrl)
      if (!r) continue
      for (const loc of extractLocs(decode(r.data))) {
        const u = sameOrigin(loc)
        if (u) pages.add(u)
      }
    }
  } else {
    for (const loc of extractLocs(rootXml)) {
      const u = sameOrigin(loc)
      if (u) pages.add(u)
    }
  }
  return [...pages]
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd worker
npm test
```

Expected: PASS（shared.test.ts 全绿）。

- [ ] **Step 5: 改写 engine.ts 为导入版**

用以下内容**整体替换** `worker/src/crawl/engine.ts`（crawlSite 主体逻辑与 V1 完全一致，仅删除被抽走的函数定义并改为导入）：

```ts
import { isJsRendered } from './detector'
import { parseAssets, parseCssUrls } from './parser'
import { buildZip, ZipEntry } from './zipper'
import { urlToZipPath, rewriteHtml, rewriteCss, fetchUrl, collectSitemapUrls } from './shared'

export interface CrawlResult {
  zip: Uint8Array
  fileCount: number
  totalBytes: number
  jsWarning: boolean
}

export interface CrawlProgress {
  downloaded: number  // 已下载文件数
  queued: number      // 已发现待下载数（含已下载）
  bytes: number       // 已下载字节数
}

export type ProgressCallback = (p: CrawlProgress) => void

// 上限贴近 Cloudflare Workers 物理天花板：子请求 1000/请求、内存 128MB、CPU 时间
// 文件数留余量给页面抓取；字节与内存权衡；深度提一级以发现更多页面内资源
const MAX_FILES = 900
const MAX_BYTES = 100 * 1024 * 1024  // 100 MB
const MAX_DEPTH = 5
const POOL_CONCURRENCY = 6  // 并发工作池大小，控制子请求突发与内存峰值

export async function crawlSite(startUrl: string, onProgress?: ProgressCallback): Promise<CrawlResult> {
  const startOrigin = new URL(startUrl).origin
  const fileMap = new Map<string, { zipPath: string; data: Uint8Array; contentType: string }>()
  const visited = new Set<string>()
  let totalBytes = 0
  let jsWarning = false

  type Task = { url: string; kind: 'page'; depth: number } | { url: string; kind: 'asset' }
  const enqueued = new Set<string>()
  const pageQueue: Task[] = []   // 页面优先：先抓完所有页面，资源用剩余额度
  const assetQueue: Task[] = []

  function reportProgress() {
    onProgress?.({ downloaded: fileMap.size, queued: enqueued.size, bytes: totalBytes })
  }

  function limitReached(): boolean {
    return fileMap.size >= MAX_FILES || totalBytes >= MAX_BYTES
  }

  function enqueue(task: Task) {
    if (enqueued.has(task.url) || visited.has(task.url)) return
    enqueued.add(task.url)
    if (task.kind === 'page') pageQueue.push(task)
    else assetQueue.push(task)
  }

  function queueSize(): number {
    return pageQueue.length + assetQueue.length
  }

  async function processTask(task: Task): Promise<void> {
    if (visited.has(task.url) || fileMap.has(task.url)) return
    if (limitReached()) return
    visited.add(task.url)

    const result = await fetchUrl(task.url)
    if (!result) return

    // 字节硬限额：超限则丢弃该文件，不计入
    if (totalBytes + result.data.byteLength > MAX_BYTES) return
    totalBytes += result.data.byteLength

    const zipPath = urlToZipPath(task.url, startOrigin)
    fileMap.set(task.url, { zipPath, data: result.data, contentType: result.contentType })
    reportProgress()

    if (limitReached()) return

    if (task.kind === 'asset') {
      // CSS 内部 url() 引用的资源动态扩队
      if (result.contentType.includes('text/css')) {
        const css = new TextDecoder().decode(result.data)
        for (const u of parseCssUrls(css, task.url)) enqueue({ url: u, kind: 'asset' })
      }
      return
    }

    // page（兼容 application/xhtml+xml）
    if (!result.contentType.includes('text/html') && !result.contentType.includes('application/xhtml')) return
    const html = new TextDecoder().decode(result.data)
    if (task.depth === 0 && isJsRendered(html)) jsWarning = true
    if (task.depth >= MAX_DEPTH) return

    const { links, assets } = parseAssets(html, task.url)
    for (const a of assets) enqueue({ url: a, kind: 'asset' })
    for (const l of links) enqueue({ url: l, kind: 'page', depth: task.depth + 1 })
  }

  // 固定大小并发工作池：取任务前检查限额，硬截断
  function runPool(concurrency: number): Promise<void> {
    let active = 0
    return new Promise<void>((resolve) => {
      const pump = () => {
        if (limitReached()) { pageQueue.length = 0; assetQueue.length = 0 }
        while (active < concurrency && queueSize() > 0 && !limitReached()) {
          // 页面优先：pageQueue 排空后才处理资源，避免资源把页面挤出额度
          const task = (pageQueue.length > 0 ? pageQueue.shift() : assetQueue.shift())!
          active++
          processTask(task).catch(() => {}).finally(() => {
            active--
            pump()
          })
        }
        if (active === 0 && (queueSize() === 0 || limitReached())) resolve()
      }
      pump()
    })
  }

  enqueue({ url: startUrl, kind: 'page', depth: 0 })
  // 接入 sitemap：把站点声明的全部页面 URL 直接入队，根治"靠内链爬行发现不全"
  for (const pageUrl of await collectSitemapUrls(startOrigin)) {
    enqueue({ url: pageUrl, kind: 'page', depth: 0 })
  }
  reportProgress()
  await runPool(POOL_CONCURRENCY)

  // 构建 url → zipPath 映射，用于链接重写
  const urlToPath = new Map<string, string>()
  for (const [url, entry] of fileMap) {
    urlToPath.set(url, entry.zipPath)
  }

  // 重写 HTML/CSS 中的链接
  const entries: ZipEntry[] = []
  for (const [url, entry] of fileMap) {
    let data = entry.data

    if (entry.contentType.includes('text/html')) {
      data = rewriteHtml(data, url, urlToPath)
    } else if (entry.contentType.includes('text/css')) {
      data = rewriteCss(data, url, urlToPath)
    }

    entries.push({ path: entry.zipPath, data })
  }

  const zip = await buildZip(entries)
  return { zip, fileCount: entries.length, totalBytes, jsWarning }
}
```

- [ ] **Step 6: parser.ts 的 decodeEntities 改为导入**

在 `worker/src/crawl/parser.ts`：

1. 第 1 行后新增：`import { decodeEntities } from './shared'`
2. 删除本地的 `function decodeEntities(...)` 定义（原第 8-16 行，含上方注释）。

- [ ] **Step 7: crawl/handler.ts 的 hashStaticUrl 改用 sha16**

在 `worker/src/crawl/handler.ts`：

1. 新增导入：`import { sha16 } from './shared'`
2. 删除本地 `hashStaticUrl` 函数（原第 10-14 行，含注释）。
3. 把 `const urlHash = await hashStaticUrl(url)` 改为：

```ts
      // 静态链路缓存键：用 static: 前缀与渲染链路区分
      const urlHash = await sha16('static:' + url)
```

- [ ] **Step 8: 类型检查与测试**

```bash
cd worker
npx tsc --noEmit
npm test
```

Expected: tsc 无输出；测试 PASS。

- [ ] **Step 9: 提交**

```bash
git add worker/src/crawl/shared.ts worker/src/crawl/engine.ts worker/src/crawl/parser.ts worker/src/crawl/handler.ts worker/test/shared.test.ts
git commit -m "refactor(worker): 抽取 V1/V2 共用纯函数到 crawl/shared.ts" -- worker/src/crawl/shared.ts worker/src/crawl/engine.ts worker/src/crawl/parser.ts worker/src/crawl/handler.ts worker/test/shared.test.ts
```

---

### Task 3: 迁移 004 与渲染任务查询

**Files:**
- Create: `worker/src/db/migrations/004_add_render_tasks.sql`
- Modify: `worker/src/db/queries.ts`

- [ ] **Step 1: 写迁移 SQL**

创建 `worker/src/db/migrations/004_add_render_tasks.sql`：

```sql
-- 004: V2 渲染链路 — 渲染任务表与月度浏览器用量表
CREATE TABLE IF NOT EXISTS render_tasks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | partial | failed
  phase TEXT,                              -- discovering | rendering | assets | zipping
  pages_total INTEGER,
  pages_done INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT,
  error TEXT,
  failed_pages TEXT,                       -- JSON 数组字符串
  ip TEXT,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS render_usage (
  month TEXT PRIMARY KEY,                  -- 'YYYY-MM'（UTC）
  browser_seconds REAL NOT NULL DEFAULT 0
);
```

- [ ] **Step 2: 本地应用并验证**

```bash
cd worker
npx wrangler d1 execute site-crawler-db --local --file=./src/db/migrations/004_add_render_tasks.sql
npx wrangler d1 execute site-crawler-db --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Expected: 第一条执行成功（2 commands）；第二条结果含 `render_tasks` 与 `render_usage`。
（仅 `--local`。远程迁移在 Task 15 统一执行。）

- [ ] **Step 3: queries.ts 增加渲染查询**

在 `worker/src/db/queries.ts`：

1. `CrawlRecord` 接口的 `crawl_type` 联合加 `'render'`：

```ts
  crawl_type?: 'static' | 'js' | 'render'
```

2. `checkAndIncrementIpUsage` 的参数类型加 `'render'`：

```ts
  crawlType: 'static' | 'js' | 'render',
```

3. 文件末尾追加：

```ts
export interface RenderTask {
  id: string
  url: string
  status: 'queued' | 'running' | 'done' | 'partial' | 'failed'
  phase: 'discovering' | 'rendering' | 'assets' | 'zipping' | null
  pages_total: number | null
  pages_done: number
  bytes: number
  r2_key: string | null
  error: string | null
  failed_pages: string | null  // JSON 数组字符串
  ip: string | null
  user_id: string | null
  created_at: number
  updated_at: number
}

export async function createRenderTask(
  db: D1Database,
  task: { id: string; url: string; ip: string | null; user_id: string | null; created_at: number },
): Promise<void> {
  await db.prepare(
    "INSERT INTO render_tasks (id, url, status, pages_done, bytes, ip, user_id, created_at, updated_at) VALUES (?, ?, 'queued', 0, 0, ?, ?, ?, ?)"
  ).bind(task.id, task.url, task.ip, task.user_id, task.created_at, task.created_at).run()
}

export async function getRenderTask(db: D1Database, id: string): Promise<RenderTask | null> {
  const row = await db.prepare('SELECT * FROM render_tasks WHERE id = ?').bind(id).first<RenderTask>()
  return row ?? null
}

// 动态 SET 限定在白名单字段内，updated_at 总是刷新
const RENDER_TASK_FIELDS = ['status', 'phase', 'pages_total', 'pages_done', 'bytes', 'r2_key', 'error', 'failed_pages'] as const
export type RenderTaskUpdate = Partial<Pick<RenderTask, (typeof RENDER_TASK_FIELDS)[number]>>

export async function updateRenderTask(db: D1Database, id: string, update: RenderTaskUpdate): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []
  for (const field of RENDER_TASK_FIELDS) {
    if (field in update) {
      sets.push(`${field} = ?`)
      values.push(update[field] ?? null)
    }
  }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  values.push(Date.now())
  await db.prepare(`UPDATE render_tasks SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id).run()
}

export async function getRenderUsageSeconds(db: D1Database, month: string): Promise<number> {
  const row = await db.prepare('SELECT browser_seconds FROM render_usage WHERE month = ?')
    .bind(month).first<{ browser_seconds: number }>()
  return row?.browser_seconds ?? 0
}

export async function addRenderUsageSeconds(db: D1Database, month: string, seconds: number): Promise<void> {
  await db.prepare(
    'INSERT INTO render_usage (month, browser_seconds) VALUES (?, ?) ON CONFLICT(month) DO UPDATE SET browser_seconds = browser_seconds + excluded.browser_seconds'
  ).bind(month, seconds).run()
}
```

- [ ] **Step 4: 类型检查**

```bash
cd worker
npx tsc --noEmit
```

Expected: 无输出。

- [ ] **Step 5: 提交**

```bash
git add worker/src/db/migrations/004_add_render_tasks.sql worker/src/db/queries.ts
git commit -m "feat(worker): 渲染任务表迁移与 D1 查询" -- worker/src/db/migrations/004_add_render_tasks.sql worker/src/db/queries.ts
```

---

### Task 4: Browser Run / Workflows 绑定与渲染配置（TDD）

**Files:**
- Modify: `worker/wrangler.toml`（整文件替换）
- Modify: `worker/package.json`（+@cloudflare/puppeteer）
- Modify: `worker/src/index.ts:7-14`（Env 接口）
- Test: `worker/test/config.test.ts`
- Create: `worker/src/render/config.ts`

> 版本兼容提示：若后续步骤 tsc 报 `Cannot find name 'Workflow'`，执行 `npm install -D @cloudflare/workers-types@latest`；若 wrangler 不识别 `[browser]` 配置或拒绝新 compatibility_date，执行 `npm install -D wrangler@latest` 后重试。

- [ ] **Step 1: 安装 puppeteer**

```bash
cd worker
npm install @cloudflare/puppeteer
```

Expected: dependencies 出现 `@cloudflare/puppeteer`。

- [ ] **Step 2: 替换 wrangler.toml**

用以下内容**整体替换** `worker/wrangler.toml`：

```toml
name = "site-crawler-worker"
main = "src/index.ts"
compatibility_date = "2026-06-01"

# 账户ID
account_id = "eff602d8715ddb9bcf1b4ba8b2ca0788"

[[routes]]
# nginx 在 api.9shi.cc/crawler/* 反代回源到橙云占位域名 origin-api.9shi.cc，
# 故 worker route 绑在 origin-api 上（保留 /crawler 前缀，匹配 worker 内部路由）
pattern = "origin-api.9shi.cc/crawler/*"
zone_name = "9shi.cc"

[browser]
binding = "BROWSER"

[[d1_databases]]
binding = "DB"
database_name = "site-crawler-db"
database_id = "d79e138c-b877-456f-9389-e68afb2f7bcb"

[[r2_buckets]]
binding = "CRAWL_BUCKET"
bucket_name = "site-crawler-results"

[vars]
FRONTEND_ORIGIN = "https://crawler.9shi.cc"
# 在 Cloudflare 控制台开启 R2 Public Access 后，将 pub-xxxx.r2.dev 替换为实际地址
R2_PUBLIC_BASE = "https://pub-44d5bd19addb426db33a386e05369737.r2.dev"
# 渲染链路配置（TOML vars 只能是字符串，config.ts 里 Number() 解析）
RENDER_MONTHLY_BUDGET_S = "32400"
RENDER_MAX_PAGES = "500"
RENDER_MAX_BYTES = "943718400"
RENDER_PAGE_TIMEOUT_MS = "15000"
RENDER_BATCH_SIZE = "10"
RENDER_DAILY_LIMIT_ANON = "1"

# ⚠️ [env.dev] 不继承顶层 bindings/vars，必须逐项镜像
[env.dev]
port = 8787

[env.dev.browser]
binding = "BROWSER"

[env.dev.vars]
FRONTEND_ORIGIN = "http://localhost:5173"
R2_PUBLIC_BASE = "https://pub-44d5bd19addb426db33a386e05369737.r2.dev"
RENDER_MONTHLY_BUDGET_S = "32400"
RENDER_MAX_PAGES = "500"
RENDER_MAX_BYTES = "943718400"
RENDER_PAGE_TIMEOUT_MS = "15000"
RENDER_BATCH_SIZE = "10"
RENDER_DAILY_LIMIT_ANON = "1"

[[env.dev.d1_databases]]
binding = "DB"
database_name = "site-crawler-db"
database_id = "d79e138c-b877-456f-9389-e68afb2f7bcb"

[[env.dev.r2_buckets]]
binding = "CRAWL_BUCKET"
bucket_name = "site-crawler-results"

# [[workflows]] 在 Task 10 添加（class_name 必须先存在，否则 wrangler dev 启动失败）

# Secrets (set via wrangler secret put):
# JWT_SECRET
```

- [ ] **Step 3: 扩展 Env 接口**

把 `worker/src/index.ts` 第 7-14 行的 `Env` 接口替换为：

```ts
export interface Env {
  DB: D1Database
  JWT_SECRET: string
  FRONTEND_ORIGIN: string
  GITHUB_TOKEN: string  // GHA 链路遗留，Task 11 移除
  CRAWL_BUCKET: R2Bucket
  R2_PUBLIC_BASE: string
  BROWSER: Fetcher
  RENDER_WORKFLOW: Workflow
  RENDER_MONTHLY_BUDGET_S?: string
  RENDER_MAX_PAGES?: string
  RENDER_MAX_BYTES?: string
  RENDER_PAGE_TIMEOUT_MS?: string
  RENDER_BATCH_SIZE?: string
  RENDER_DAILY_LIMIT_ANON?: string
}
```

- [ ] **Step 4: 写失败测试**

创建 `worker/test/config.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { renderConfig, RENDER_MAX_OBJECTS } from '../src/render/config'

describe('renderConfig', () => {
  it('解析环境变量字符串为数字', () => {
    const cfg = renderConfig({
      RENDER_MONTHLY_BUDGET_S: '32400',
      RENDER_MAX_PAGES: '500',
      RENDER_MAX_BYTES: '943718400',
      RENDER_PAGE_TIMEOUT_MS: '15000',
      RENDER_BATCH_SIZE: '10',
      RENDER_DAILY_LIMIT_ANON: '1',
    })
    expect(cfg).toEqual({
      monthlyBudgetSeconds: 32400,
      maxPages: 500,
      maxBytes: 943718400,
      pageTimeoutMs: 15000,
      batchSize: 10,
      dailyLimitAnon: 1,
    })
  })
  it('缺失或非法值回退默认', () => {
    const cfg = renderConfig({ RENDER_MAX_PAGES: 'abc', RENDER_MAX_BYTES: '-1' })
    expect(cfg.maxPages).toBe(500)
    expect(cfg.maxBytes).toBe(943718400)
    expect(cfg.monthlyBudgetSeconds).toBe(32400)
    expect(cfg.pageTimeoutMs).toBe(15000)
    expect(cfg.batchSize).toBe(10)
    expect(cfg.dailyLimitAnon).toBe(1)
  })
  it('RENDER_MAX_OBJECTS 是内部常量 850', () => {
    expect(RENDER_MAX_OBJECTS).toBe(850)
  })
})
```

```bash
cd worker
npm test
```

Expected: FAIL，`Cannot find module '../src/render/config'`。

- [ ] **Step 5: 实现 config.ts**

创建 `worker/src/render/config.ts`：

```ts
// 渲染链路环境变量（wrangler vars 均为字符串）
export interface RenderEnvVars {
  RENDER_MONTHLY_BUDGET_S?: string
  RENDER_MAX_PAGES?: string
  RENDER_MAX_BYTES?: string
  RENDER_PAGE_TIMEOUT_MS?: string
  RENDER_BATCH_SIZE?: string
  RENDER_DAILY_LIMIT_ANON?: string
}

export interface RenderConfig {
  monthlyBudgetSeconds: number
  maxPages: number
  maxBytes: number
  pageTimeoutMs: number
  batchSize: number
  dailyLimitAnon: number
}

// 全任务累计暂存对象数上限：Workflows 单步 ~1000 子请求的安全余量（内部常量，不暴露为 env）
export const RENDER_MAX_OBJECTS = 850

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function renderConfig(env: RenderEnvVars): RenderConfig {
  return {
    monthlyBudgetSeconds: num(env.RENDER_MONTHLY_BUDGET_S, 32400), // 9 小时 = 月度 10 浏览器小时的 90%
    maxPages: num(env.RENDER_MAX_PAGES, 500),
    maxBytes: num(env.RENDER_MAX_BYTES, 943718400), // 900 MB
    pageTimeoutMs: num(env.RENDER_PAGE_TIMEOUT_MS, 15000),
    batchSize: num(env.RENDER_BATCH_SIZE, 10),
    dailyLimitAnon: num(env.RENDER_DAILY_LIMIT_ANON, 1),
  }
}
```

- [ ] **Step 6: 测试与类型检查**

```bash
cd worker
npm test
npx tsc --noEmit
```

Expected: 测试 PASS；tsc 无输出（若报 `Cannot find name 'Workflow'`，按本任务开头的版本兼容提示处理）。

- [ ] **Step 7: dev 启动冒烟**

```bash
cd worker
npx wrangler dev --env dev
# 看到 Ready on http://localhost:8787 后 Ctrl+C 退出
```

Expected: 无配置报错。首次启用 Browser Rendering 本地模拟时 wrangler 会下载 Chromium（可能数分钟），属正常。

- [ ] **Step 8: 提交**

```bash
git add worker/wrangler.toml worker/package.json worker/package-lock.json worker/src/index.ts worker/src/render/config.ts worker/test/config.test.ts
git commit -m "feat(worker): Browser Run 绑定与渲染配置" -- worker/wrangler.toml worker/package.json worker/package-lock.json worker/src/index.ts worker/src/render/config.ts worker/test/config.test.ts
```

---

### Task 5: R2 暂存层 staging.ts（TDD）

渲染时截获的资源先平铺暂存到 `render/{taskId}/raw/{sha16(url)}`（URL 存 customMetadata），打包步骤再统一读出。同时实现"该响应是否为静态资源"的判定。

**Files:**
- Create: `worker/test/helpers.ts`（FakeBucket 测试替身）
- Test: `worker/test/staging.test.ts`
- Create: `worker/src/render/staging.ts`

- [ ] **Step 1: 创建 FakeBucket 测试替身**

创建 `worker/test/helpers.ts`：

```ts
// 内存版 R2Bucket 测试替身：覆盖本项目用到的 put/get/list/delete/createMultipartUpload
export class FakeBucket {
  store = new Map<string, { data: Uint8Array; customMetadata?: Record<string, string> }>()

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

  async createMultipartUpload(key: string) {
    const parts = new Map<number, Uint8Array>()
    const store = this.store
    return {
      key,
      uploadId: 'fake-upload',
      async uploadPart(partNumber: number, value: ArrayBuffer | Uint8Array) {
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
```

- [ ] **Step 2: 写失败测试**

创建 `worker/test/staging.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { FakeBucket, asBucket } from './helpers'
import { stagingPrefix, stageObject, listStaging, deleteStaging, isStaticAssetResponse } from '../src/render/staging'

describe('isStaticAssetResponse', () => {
  it('按 Content-Type 接受静态资源', () => {
    expect(isStaticAssetResponse('https://a.com/x', 'text/css')).toBe(true)
    expect(isStaticAssetResponse('https://a.com/x', 'application/javascript; charset=utf-8')).toBe(true)
    expect(isStaticAssetResponse('https://a.com/x', 'image/png')).toBe(true)
    expect(isStaticAssetResponse('https://a.com/x', 'font/woff2')).toBe(true)
  })
  it('拒绝 HTML 与 JSON（XHR 数据不截获）', () => {
    expect(isStaticAssetResponse('https://a.com/x', 'text/html; charset=utf-8')).toBe(false)
    expect(isStaticAssetResponse('https://a.com/x', 'application/json')).toBe(false)
    expect(isStaticAssetResponse('https://a.com/api', 'application/ld+json')).toBe(false)
  })
  it('Content-Type 不明时按扩展名兜底', () => {
    expect(isStaticAssetResponse('https://a.com/img/logo.png', 'application/octet-stream')).toBe(true)
    expect(isStaticAssetResponse('https://a.com/data.json', 'application/octet-stream')).toBe(false)
    expect(isStaticAssetResponse('https://a.com/page.html', '')).toBe(false)
    expect(isStaticAssetResponse('https://a.com/page', '')).toBe(false)
  })
})

describe('staging 读写删', () => {
  it('stageObject 以 sha16(url) 为键写入并带元数据', async () => {
    const bucket = new FakeBucket()
    await stageObject(asBucket(bucket), 't1', 'https://a.com/css/main.css', new TextEncoder().encode('body{}'), 'text/css')
    const list = await listStaging(asBucket(bucket), 't1')
    expect(list).toHaveLength(1)
    expect(list[0].key.startsWith(stagingPrefix('t1'))).toBe(true)
    expect(list[0].url).toBe('https://a.com/css/main.css')
    expect(list[0].contentType).toBe('text/css')
  })
  it('同一 URL 重复暂存幂等（同键覆盖）', async () => {
    const bucket = new FakeBucket()
    await stageObject(asBucket(bucket), 't1', 'https://a.com/x.js', new Uint8Array([1]), 'text/javascript')
    await stageObject(asBucket(bucket), 't1', 'https://a.com/x.js', new Uint8Array([2]), 'text/javascript')
    expect(await listStaging(asBucket(bucket), 't1')).toHaveLength(1)
  })
  it('deleteStaging 只清自己任务的前缀', async () => {
    const bucket = new FakeBucket()
    await stageObject(asBucket(bucket), 't1', 'https://a.com/a.js', new Uint8Array([1]), 'text/javascript')
    await stageObject(asBucket(bucket), 't2', 'https://a.com/b.js', new Uint8Array([2]), 'text/javascript')
    await deleteStaging(asBucket(bucket), 't1')
    expect(await listStaging(asBucket(bucket), 't1')).toHaveLength(0)
    expect(await listStaging(asBucket(bucket), 't2')).toHaveLength(1)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd worker
npm test
```

Expected: FAIL，`Cannot find module '../src/render/staging'`。

- [ ] **Step 4: 实现 staging.ts**

创建 `worker/src/render/staging.ts`：

```ts
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
    const res = await bucket.list({ prefix: stagingPrefix(taskId), cursor, include: ['customMetadata'] })
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
```

- [ ] **Step 5: 测试与类型检查**

```bash
cd worker
npm test
npx tsc --noEmit
```

Expected: 全部 PASS；tsc 无输出。

- [ ] **Step 6: 提交**

```bash
git add worker/test/helpers.ts worker/test/staging.test.ts worker/src/render/staging.ts
git commit -m "feat(worker): R2 渲染暂存层与静态资源判定" -- worker/test/helpers.ts worker/test/staging.test.ts worker/src/render/staging.ts
```

---

# Phase B 渲染核心

### Task 6: 月度预算熔断 quota.ts（TDD）

**Files:**
- Test: `worker/test/quota.test.ts`
- Create: `worker/src/render/quota.ts`

- [ ] **Step 1: 写失败测试**

创建 `worker/test/quota.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { monthKey, isWithinBudget } from '../src/render/quota'

describe('monthKey', () => {
  it('返回 UTC YYYY-MM', () => {
    expect(monthKey(new Date('2026-06-11T23:59:59Z'))).toBe('2026-06')
    expect(monthKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })
})

describe('isWithinBudget', () => {
  it('已用小于预算才放行（硬熔断）', () => {
    expect(isWithinBudget(0, 32400)).toBe(true)
    expect(isWithinBudget(32399.5, 32400)).toBe(true)
    expect(isWithinBudget(32400, 32400)).toBe(false)
    expect(isWithinBudget(40000, 32400)).toBe(false)
  })
})
```

```bash
cd worker
npm test
```

Expected: FAIL，`Cannot find module '../src/render/quota'`。

- [ ] **Step 2: 实现 quota.ts**

创建 `worker/src/render/quota.ts`：

```ts
import { getRenderUsageSeconds } from '../db/queries'

// UTC 月份键 'YYYY-MM'，与 render_usage.month 对应
export function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7)
}

// 硬熔断判定：已用 >= 预算即拒绝
export function isWithinBudget(usedSeconds: number, budgetSeconds: number): boolean {
  return usedSeconds < budgetSeconds
}

// 查询当月用量并判定（薄封装，本地 E2E 覆盖，不写单测）
export async function checkBudget(
  db: D1Database,
  budgetSeconds: number,
): Promise<{ used: number; allowed: boolean }> {
  const used = await getRenderUsageSeconds(db, monthKey(new Date()))
  return { used, allowed: isWithinBudget(used, budgetSeconds) }
}
```

- [ ] **Step 3: 测试与类型检查**

```bash
cd worker
npm test
npx tsc --noEmit
```

Expected: PASS；tsc 无输出。

- [ ] **Step 4: 提交**

```bash
git add worker/test/quota.test.ts worker/src/render/quota.ts
git commit -m "feat(worker): 月度浏览器时长预算熔断" -- worker/test/quota.test.ts worker/src/render/quota.ts
```

---

### Task 7: 流式 Zip 与 multipart 上传 zip-stream.ts（TDD）

900MB 级产物不能在 128MB 内存里 `zipSync`。方案：fflate `Zip` 流式产出字节块 → 精确攒成 8MiB 定长分片（R2 multipart 要求除最后一片外等长）→ `uploadPart` 逐片上传。V1 的 `zipper.ts buildZip` 保留给静态链路，不动。

**Files:**
- Test: `worker/test/zip-stream.test.ts`
- Create: `worker/src/render/zip-stream.ts`

- [ ] **Step 1: 写失败测试**

创建 `worker/test/zip-stream.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { unzipSync } from 'fflate'
import { zipChunks, uploadChunked, MultipartTarget, ZipFileSource } from '../src/render/zip-stream'

async function* toAsync(files: ZipFileSource[]) {
  for (const f of files) yield f
}

// 伪噪声数据：deflate 压不动，保证 zip 体积 ≈ 原始体积（全零会被压成几 KB，测不出分片）
function noise(len: number): Uint8Array {
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) out[i] = (i * 31 + ((i >> 8) * 17) + ((i >> 16) * 7)) & 0xff
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd worker
npm test
```

Expected: FAIL，`Cannot find module '../src/render/zip-stream'`。

- [ ] **Step 3: 实现 zip-stream.ts**

创建 `worker/src/render/zip-stream.ts`：

```ts
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
```

- [ ] **Step 4: 测试与类型检查**

```bash
cd worker
npm test
npx tsc --noEmit
```

Expected: 全部 PASS；tsc 无输出。

- [ ] **Step 5: 提交**

```bash
git add worker/test/zip-stream.test.ts worker/src/render/zip-stream.ts
git commit -m "feat(worker): 流式 zip 与 R2 multipart 定长分片上传" -- worker/test/zip-stream.test.ts worker/src/render/zip-stream.ts
```

---

### Task 8: 浏览器批渲染 browser.ts

单批顺序渲染（并发 1 个浏览器、逐页处理），`page.on('response')` 截获静态资源直接暂存 R2。**本模块无法单测（依赖真实浏览器绑定），类型检查 + Task 14 本地 E2E 覆盖。**

**Files:**
- Create: `worker/src/render/browser.ts`

- [ ] **Step 1: 实现 browser.ts**

创建 `worker/src/render/browser.ts`：

```ts
import puppeteer, { BrowserWorker } from '@cloudflare/puppeteer'
import type { Env } from '../index'
import { renderConfig } from './config'
import { stageObject, isStaticAssetResponse } from './staging'
import { normalizeLinks } from '../crawl/shared'

export interface RenderBatchInput {
  urls: string[]
  startOrigin: string
  byteBudgetLeft: number    // 本批可新增字节数（全任务剩余）
  objectBudgetLeft: number  // 本批可新增暂存对象数（全任务剩余）
}

export interface PageRenderResult {
  url: string
  ok: boolean
  links: string[]  // 渲染后 DOM 中的同源链接（已规范化）
}

export interface RenderBatchResult {
  pages: PageRenderResult[]
  bytesAdded: number
  objectsAdded: number
  secondsUsed: number       // 浏览器墙钟秒数，计入月度预算
  budgetExhausted: boolean  // 字节/对象额度耗尽，外层应停止扩张
}

// 渲染一批页面：每页 goto → 截获响应暂存 → 取渲染后 DOM 与链接 → 暂存 DOM
export async function renderBatch(env: Env, taskId: string, input: RenderBatchInput): Promise<RenderBatchResult> {
  const cfg = renderConfig(env)
  const browser = await puppeteer.launch(env.BROWSER as unknown as BrowserWorker)
  const t0 = Date.now()
  const pages: PageRenderResult[] = []
  let bytesAdded = 0
  let objectsAdded = 0
  let budgetExhausted = false
  const stagedUrls = new Set<string>() // 批内去重；跨批靠 sha16 同键覆盖天然幂等

  try {
    for (const url of input.urls) {
      const page = await browser.newPage()
      const capturePromises: Promise<void>[] = []

      page.on('response', (res) => {
        capturePromises.push((async () => {
          try {
            const status = res.status()
            if (status < 200 || status >= 300) return
            const resUrl = res.url()
            const ct = ((res.headers()['content-type'] ?? '').split(';')[0] ?? '').trim()
            if (!isStaticAssetResponse(resUrl, ct)) return
            if (stagedUrls.has(resUrl)) return
            const body = await res.buffer()
            // check 与累加之间无 await，单线程下原子，不会超额
            if (bytesAdded + body.byteLength > input.byteBudgetLeft || objectsAdded + 1 > input.objectBudgetLeft) {
              budgetExhausted = true
              return
            }
            stagedUrls.add(resUrl)
            bytesAdded += body.byteLength
            objectsAdded += 1
            await stageObject(env.CRAWL_BUCKET, taskId, resUrl, new Uint8Array(body), ct)
          } catch { /* 单个资源截获失败不影响页面 */ }
        })())
      })

      let ok = true
      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: cfg.pageTimeoutMs })
      } catch {
        ok = false // 超时等：仍尝试打捞已渲染的部分 DOM
      }

      let links: string[] = []
      let html = ''
      try {
        html = await page.content()
        // 字符串形式 evaluate，绕过 worker tsconfig 无 DOM lib 的类型限制
        const rawLinks = (await page.evaluate(
          `Array.from(document.querySelectorAll('a[href]')).map(a => a.href)`,
        )) as string[]
        // 截断到 maxPages：超出部分对 BFS 无意义，且控制 Workflow step 返回值体积（≤1MiB）
        links = normalizeLinks(rawLinks, input.startOrigin).slice(0, cfg.maxPages)
        if (!ok && html.length > 0) ok = true // 超时但已有内容 → 降级收录
      } catch {
        ok = false
      }

      if (html.length > 0) {
        const htmlBytes = new TextEncoder().encode(html)
        if (bytesAdded + htmlBytes.byteLength > input.byteBudgetLeft || objectsAdded + 1 > input.objectBudgetLeft) {
          budgetExhausted = true
        } else {
          bytesAdded += htmlBytes.byteLength
          objectsAdded += 1
          await stageObject(env.CRAWL_BUCKET, taskId, url, htmlBytes, 'text/html')
        }
      } else {
        ok = false
      }

      await Promise.allSettled(capturePromises)
      await page.close()
      pages.push({ url, ok, links })
      if (budgetExhausted) break
    }
  } finally {
    await browser.close()
  }

  return { pages, bytesAdded, objectsAdded, secondsUsed: (Date.now() - t0) / 1000, budgetExhausted }
}
```

- [ ] **Step 2: 类型检查与既有测试回归**

```bash
cd worker
npx tsc --noEmit
npm test
```

Expected: tsc 无输出；既有测试 PASS。

- [ ] **Step 3: 提交**

```bash
git add worker/src/render/browser.ts
git commit -m "feat(worker): Browser Run 批渲染与响应截获暂存" -- worker/src/render/browser.ts
```

---

### Task 9: 工作流步骤函数 steps.ts（TDD）

Workflow 各步骤的可测逻辑：页面发现、缺失资源扫描、直连补抓、暂存打包。

**Files:**
- Test: `worker/test/steps.test.ts`
- Create: `worker/src/render/steps.ts`

- [ ] **Step 1: 写失败测试**

创建 `worker/test/steps.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { unzipSync } from 'fflate'
import { FakeBucket, asBucket } from './helpers'
import { discoverPages, collectMissingAssets, fetchAssetBatch, zipStaging } from '../src/render/steps'
import { stageObject } from '../src/render/staging'

afterEach(() => { vi.unstubAllGlobals() })

// 按 URL 精确匹配的 fetch 替身，未命中返回 404
function stubFetch(routes: Record<string, { body: string | Uint8Array; ct: string }>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const hit = routes[url]
    if (!hit) return new Response('not found', { status: 404 })
    return new Response(hit.body as BodyInit, { status: 200, headers: { 'Content-Type': hit.ct } })
  }))
}

describe('discoverPages', () => {
  it('入口 + sitemap 合并去重，过滤跨域', async () => {
    const sitemap = `<?xml version="1.0"?><urlset>
      <url><loc>https://a.com/</loc></url>
      <url><loc>https://a.com/about</loc></url>
      <url><loc>https://b.com/external</loc></url>
    </urlset>`
    stubFetch({ 'https://a.com/sitemap.xml': { body: sitemap, ct: 'application/xml' } })
    const pages = await discoverPages('https://a.com/#top', 10)
    expect(pages).toContain('https://a.com/')
    expect(pages).toContain('https://a.com/about')
    expect(pages.every(p => p.startsWith('https://a.com'))).toBe(true)
    expect(pages).toHaveLength(2)
  })
  it('maxPages 截断；无 sitemap 时只有入口', async () => {
    stubFetch({})
    expect(await discoverPages('https://a.com/', 1)).toEqual(['https://a.com/'])
  })
})

describe('collectMissingAssets', () => {
  async function seed(bucket: FakeBucket) {
    const b = asBucket(bucket)
    await stageObject(b, 't1', 'https://a.com/', new TextEncoder().encode(
      '<script src="/app.js"></script><img src="/missing.png"><link rel="stylesheet" href="/s.css">',
    ), 'text/html')
    await stageObject(b, 't1', 'https://a.com/app.js', new TextEncoder().encode('1'), 'text/javascript')
    await stageObject(b, 't1', 'https://a.com/s.css', new TextEncoder().encode(
      'body{background:url(/img/bg.png)}',
    ), 'text/css')
  }
  it('找出 HTML/CSS 引用但未暂存的资源', async () => {
    const bucket = new FakeBucket()
    await seed(bucket)
    const missing = await collectMissingAssets(asBucket(bucket), 't1', 100)
    expect(missing.sort()).toEqual(['https://a.com/img/bg.png', 'https://a.com/missing.png'])
  })
  it('cap 限制数量', async () => {
    const bucket = new FakeBucket()
    await seed(bucket)
    expect(await collectMissingAssets(asBucket(bucket), 't1', 1)).toHaveLength(1)
    expect(await collectMissingAssets(asBucket(bucket), 't1', 0)).toHaveLength(0)
  })
})

describe('fetchAssetBatch', () => {
  it('补抓静态资源，按响应 Content-Type 过滤，404 跳过', async () => {
    stubFetch({
      'https://a.com/img/bg.png': { body: new Uint8Array([1, 2, 3]), ct: 'image/png' },
      'https://a.com/api/data': { body: '{}', ct: 'application/json' },
    })
    const bucket = new FakeBucket()
    const r = await fetchAssetBatch(asBucket(bucket), 't1', [
      'https://a.com/img/bg.png',
      'https://a.com/api/data',
      'https://a.com/gone.css',
    ], 1024, 10)
    expect(r.objectsAdded).toBe(1)
    expect(r.bytesAdded).toBe(3)
    expect(r.budgetExhausted).toBe(false)
    expect((await bucket.list({ prefix: 'render/t1/raw/' })).objects).toHaveLength(1)
  })
  it('字节预算耗尽时置位且不写入', async () => {
    stubFetch({ 'https://a.com/big.png': { body: new Uint8Array(100), ct: 'image/png' } })
    const r = await fetchAssetBatch(asBucket(new FakeBucket()), 't1', ['https://a.com/big.png'], 50, 10)
    expect(r.objectsAdded).toBe(0)
    expect(r.budgetExhausted).toBe(true)
  })
})

describe('zipStaging', () => {
  it('重写链接并流式打包，跨域进 _external', async () => {
    const bucket = new FakeBucket()
    const b = asBucket(bucket)
    await stageObject(b, 't1', 'https://a.com/', new TextEncoder().encode(
      '<link href="https://a.com/css/main.css"><script src="https://cdn.b.com/lib.js"></script>',
    ), 'text/html')
    await stageObject(b, 't1', 'https://a.com/css/main.css', new TextEncoder().encode(
      'body{background:url(/img/bg.png)}',
    ), 'text/css')
    await stageObject(b, 't1', 'https://a.com/img/bg.png', new Uint8Array([9]), 'image/png')
    await stageObject(b, 't1', 'https://cdn.b.com/lib.js', new TextEncoder().encode('x'), 'text/javascript')

    const r = await zipStaging(b, 't1', 'https://a.com/', 'crawls/render-abc.zip')
    expect(r.files).toBe(4)
    const zipObj = bucket.store.get('crawls/render-abc.zip')!
    expect(r.zipBytes).toBe(zipObj.data.byteLength)
    const out = unzipSync(zipObj.data)
    expect(Object.keys(out).sort()).toEqual(['_external/cdn.b.com/lib.js', 'css/main.css', 'img/bg.png', 'index.html'])
    const html = new TextDecoder().decode(out['index.html'])
    expect(html).toContain('href="css/main.css"')
    expect(html).toContain('src="_external/cdn.b.com/lib.js"')
    const css = new TextDecoder().decode(out['css/main.css'])
    expect(css).toContain('url(../img/bg.png)')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd worker
npm test
```

Expected: FAIL，`Cannot find module '../src/render/steps'`。

- [ ] **Step 3: 实现 steps.ts**

创建 `worker/src/render/steps.ts`：

```ts
import { sha16, urlToZipPath, rewriteHtml, rewriteCss, fetchUrl, collectSitemapUrls, normalizeLinks } from '../crawl/shared'
import { parseAssets, parseCssUrls } from '../crawl/parser'
import { listStaging, stageObject, isStaticAssetResponse } from './staging'
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
      const res = await fetchUrl(url)
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
      if (!body) continue
      let data = new Uint8Array(await body.arrayBuffer())
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
```

- [ ] **Step 4: 测试与类型检查**

```bash
cd worker
npm test
npx tsc --noEmit
```

Expected: 全部 PASS；tsc 无输出。

- [ ] **Step 5: 提交**

```bash
git add worker/test/steps.test.ts worker/src/render/steps.ts
git commit -m "feat(worker): 渲染工作流步骤函数（发现/补抓/打包）" -- worker/test/steps.test.ts worker/src/render/steps.ts
```

---

### Task 10: RenderCrawlWorkflow 编排

把 Task 6-9 的件组装成 Workflows 类。**replay 纪律：`run()` 顶层只做纯计算与状态重建，所有 D1/R2 副作用都在 `step.do` 闭包内**；累计量（pagesDone/bytes/objects）由各步骤的缓存返回值在 replay 时重建。无单测（依赖 Workflows 运行时），类型检查 + dev 启动 + Task 14 E2E 覆盖。

子请求算术备忘：zip 步骤 ≈ list(1) + get(≤850) + uploadPart(900MB/8MiB≈113) + create/complete(2) ≈ 966 < 1000，`RENDER_MAX_OBJECTS = 850` 就是为此留的余量。

**Files:**
- Create: `worker/src/render/workflow.ts`
- Modify: `worker/src/index.ts`（追加一行 re-export）
- Modify: `worker/wrangler.toml`（追加 [[workflows]] 两段）

- [ ] **Step 1: 实现 workflow.ts**

创建 `worker/src/render/workflow.ts`：

```ts
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import type { Env } from '../index'
import { renderConfig, RENDER_MAX_OBJECTS } from './config'
import { checkBudget, monthKey } from './quota'
import { renderBatch } from './browser'
import { discoverPages, collectMissingAssets, fetchAssetBatch, zipStaging } from './steps'
import { deleteStaging } from './staging'
import { updateRenderTask, addRenderUsageSeconds, createCrawlRecord, setCrawlCache } from '../db/queries'
import { sha16 } from '../crawl/shared'

export interface RenderParams {
  taskId: string
  url: string
  userId: string | null
}

export class RenderCrawlWorkflow extends WorkflowEntrypoint<Env, RenderParams> {
  async run(event: WorkflowEvent<RenderParams>, step: WorkflowStep) {
    const { taskId, url, userId } = event.payload
    const cfg = renderConfig(this.env)
    const startOrigin = new URL(url).origin

    try {
      // ---- 步骤 1：页面发现 ----
      const discovered = await step.do('discover', async () => {
        await updateRenderTask(this.env.DB, taskId, { status: 'running', phase: 'discovering' })
        const pages = await discoverPages(url, cfg.maxPages)
        await updateRenderTask(this.env.DB, taskId, { pages_total: pages.length })
        return pages
      })

      // ---- 步骤 2：BFS 批渲染 ----
      const seen = new Set<string>(discovered)
      let queue = [...discovered]
      let pagesDone = 0
      let bytes = 0
      let objects = 0
      let budgetBreached = false // 月度浏览器时长熔断
      let capHit = false         // 字节/对象上限触顶
      const failedPages: string[] = []
      let batchIndex = 0

      while (queue.length > 0 && pagesDone < cfg.maxPages && !budgetBreached && !capHit) {
        const batch = queue.slice(0, Math.min(cfg.batchSize, cfg.maxPages - pagesDone))
        queue = queue.slice(batch.length)
        // 闭包捕获本轮快照值（replay 时闭包不执行，直接用缓存返回值，外层状态照常重建）
        const knownTotal = Math.min(seen.size, cfg.maxPages)
        const doneBefore = pagesDone
        const bytesBefore = bytes
        const objectsBefore = objects

        const result = await step.do(
          `render-batch-${batchIndex++}`,
          { retries: { limit: 2, delay: '10 seconds', backoff: 'constant' } },
          async () => {
            // 每批前查熔断：跑批过程中预算耗尽则后续批被拒
            const budget = await checkBudget(this.env.DB, cfg.monthlyBudgetSeconds)
            if (!budget.allowed) {
              return { skipped: true as const, pages: [], bytesAdded: 0, objectsAdded: 0, budgetExhausted: false }
            }
            const r = await renderBatch(this.env, taskId, {
              urls: batch,
              startOrigin,
              byteBudgetLeft: cfg.maxBytes - bytesBefore,
              objectBudgetLeft: RENDER_MAX_OBJECTS - objectsBefore,
            })
            await addRenderUsageSeconds(this.env.DB, monthKey(new Date()), r.secondsUsed)
            await updateRenderTask(this.env.DB, taskId, {
              phase: 'rendering',
              pages_total: knownTotal,
              pages_done: doneBefore + r.pages.length,
              bytes: bytesBefore + r.bytesAdded,
            })
            return {
              skipped: false as const,
              pages: r.pages,
              bytesAdded: r.bytesAdded,
              objectsAdded: r.objectsAdded,
              budgetExhausted: r.budgetExhausted,
            }
          },
        )

        if (result.skipped) { budgetBreached = true; break }
        pagesDone += result.pages.length
        bytes += result.bytesAdded
        objects += result.objectsAdded
        if (result.budgetExhausted) capHit = true
        for (const p of result.pages) {
          if (!p.ok) failedPages.push(p.url)
          for (const link of p.links) {
            if (!seen.has(link) && seen.size < cfg.maxPages) {
              seen.add(link)
              queue.push(link)
            }
          }
        }
      }

      // ---- 一页未成 → 标记失败并清理 ----
      if (pagesDone === 0) {
        await step.do('mark-failed-empty', async () => {
          await updateRenderTask(this.env.DB, taskId, {
            status: 'failed',
            phase: null,
            error: budgetBreached ? 'monthly render budget exhausted' : 'no pages rendered',
            failed_pages: JSON.stringify(failedPages),
          })
          await deleteStaging(this.env.CRAWL_BUCKET, taskId)
        })
        return
      }

      // ---- 步骤 3：补抓缺失资源（额度已尽时跳过）----
      if (!budgetBreached && !capHit) {
        const missing = await step.do('collect-missing-assets', async () => {
          await updateRenderTask(this.env.DB, taskId, { phase: 'assets' })
          return collectMissingAssets(this.env.CRAWL_BUCKET, taskId, RENDER_MAX_OBJECTS - objects)
        })
        let assetIndex = 0
        for (let i = 0; i < missing.length && !capHit; i += 100) {
          const slice = missing.slice(i, i + 100)
          const bytesBefore = bytes
          const objectsBefore = objects
          const r = await step.do(`fetch-assets-${assetIndex++}`, async () =>
            fetchAssetBatch(
              this.env.CRAWL_BUCKET, taskId, slice,
              cfg.maxBytes - bytesBefore,
              RENDER_MAX_OBJECTS - objectsBefore,
            ),
          )
          bytes += r.bytesAdded
          objects += r.objectsAdded
          if (r.budgetExhausted) capHit = true
        }
      }

      // ---- 步骤 4：打包上传 ----
      const zipped = await step.do('zip', async () => {
        await updateRenderTask(this.env.DB, taskId, { phase: 'zipping' })
        const zipKey = `crawls/render-${await sha16('render:' + url)}.zip`
        const r = await zipStaging(this.env.CRAWL_BUCKET, taskId, url, zipKey)
        return { ...r, zipKey }
      })

      // ---- 步骤 5：收尾（缓存、历史、状态、清暂存）----
      await step.do('finalize', async () => {
        const status = budgetBreached || capHit || failedPages.length > 0 ? 'partial' : 'done'
        await setCrawlCache(this.env.DB, {
          url_hash: await sha16('render:' + url),
          url,
          r2_key: zipped.zipKey,
          file_count: zipped.files,
          zip_size: zipped.zipBytes,
          created_at: Date.now(),
        })
        if (userId) {
          await createCrawlRecord(this.env.DB, {
            id: crypto.randomUUID(),
            user_id: userId,
            url,
            status: 'done',
            file_count: zipped.files,
            zip_size: zipped.zipBytes,
            created_at: Date.now(),
            completed_at: Date.now(),
            crawl_type: 'render',
          })
        }
        await updateRenderTask(this.env.DB, taskId, {
          status,
          phase: null,
          r2_key: zipped.zipKey,
          bytes: zipped.zipBytes,
          failed_pages: JSON.stringify(failedPages),
          error: budgetBreached ? 'monthly render budget exhausted' : null,
        })
        await deleteStaging(this.env.CRAWL_BUCKET, taskId)
      })
    } catch (e) {
      // 步骤重试耗尽后落到这里：标记失败并清理暂存
      await step.do('mark-failed', async () => {
        await updateRenderTask(this.env.DB, taskId, {
          status: 'failed',
          phase: null,
          error: e instanceof Error ? e.message : 'render workflow failed',
        })
        await deleteStaging(this.env.CRAWL_BUCKET, taskId)
      })
      throw e
    }
  }
}
```

- [ ] **Step 2: index.ts 导出 Workflow 类**

在 `worker/src/index.ts` 的 import 区块之后（`export interface Env` 之前）加一行：

```ts
export { RenderCrawlWorkflow } from './render/workflow'
```

- [ ] **Step 3: wrangler.toml 注册 workflows**

把 `worker/wrangler.toml` 中注释行 `# [[workflows]] 在 Task 10 添加（class_name 必须先存在，否则 wrangler dev 启动失败）` 替换为：

```toml
[[workflows]]
name = "render-crawl"
binding = "RENDER_WORKFLOW"
class_name = "RenderCrawlWorkflow"

[[env.dev.workflows]]
name = "render-crawl"
binding = "RENDER_WORKFLOW"
class_name = "RenderCrawlWorkflow"
```

- [ ] **Step 4: 类型检查与测试回归**

```bash
cd worker
npx tsc --noEmit
npm test
```

Expected: tsc 无输出；测试 PASS。

- [ ] **Step 5: dev 启动冒烟**

```bash
cd worker
npx wrangler dev --env dev
# 看到 Ready 后 Ctrl+C
```

Expected: 启动无报错，日志可见 workflows 绑定（RENDER_WORKFLOW）。

- [ ] **Step 6: 提交**

```bash
git add worker/src/render/workflow.ts worker/src/index.ts worker/wrangler.toml
git commit -m "feat(worker): RenderCrawlWorkflow 异步全站渲染编排" -- worker/src/render/workflow.ts worker/src/index.ts worker/wrangler.toml
```

---

# Phase C 入口分流与前端

### Task 11: 入口分流、状态路由、GHA 链路下线

`/api/crawl` 在静态缓存未命中后探测入口 HTML：SPA → 渲染缓存/熔断/配额三连检 → 创建任务 + 启动 Workflow + SSE 推 `render_task`；不可用则推 `notice` 降级静态。同时新增 GET `/api/crawl/render/:taskId`，删除 GHA 旧链路。无新单测（handler 是 IO 编排，Task 14 E2E 覆盖；既有测试回归）。

**Files:**
- Create: `worker/src/render/handler.ts`
- Modify: `worker/src/crawl/handler.ts`（整文件替换）
- Modify: `worker/src/index.ts`（整文件替换）
- Delete: `worker/src/crawl/js-handler.ts`、`worker/src/crawl/github.ts`

- [ ] **Step 1: 实现渲染状态查询 handler**

创建 `worker/src/render/handler.ts`：

```ts
import type { Env } from '../index'
import { getRenderTask } from '../db/queries'

// GET /api/crawl/render/:taskId — 渲染任务状态轮询
export async function handleRenderStatus(
  env: Env,
  corsHeaders: Record<string, string>,
  taskId: string,
): Promise<Response> {
  const task = await getRenderTask(env.DB, taskId)
  if (!task) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const downloadable = (task.status === 'done' || task.status === 'partial') && task.r2_key
  return new Response(JSON.stringify({
    status: task.status,
    phase: task.phase,
    pagesDone: task.pages_done,
    pagesTotal: task.pages_total,
    bytes: task.bytes,
    downloadUrl: downloadable ? `${env.R2_PUBLIC_BASE}/${task.r2_key}` : undefined,
    error: task.error ?? undefined,
    failedPages: task.failed_pages ? JSON.parse(task.failed_pages) : [],
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
```

- [ ] **Step 2: 重写 crawl/handler.ts（分流）**

用以下内容**整体替换** `worker/src/crawl/handler.ts`：

```ts
import type { Env } from '../index'
import { verifyToken, extractBearer } from '../auth/jwt'
import { crawlSite } from './engine'
import { isJsRendered } from './detector'
import { fetchUrl, sha16 } from './shared'
import { renderConfig } from '../render/config'
import { checkBudget } from '../render/quota'
import {
  createCrawlRecord, updateCrawlRecord, checkAndIncrementIpUsage,
  getCrawlCache, setCrawlCache, createRenderTask,
} from '../db/queries'

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function handleCrawl(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const token = extractBearer(request)
  const user = token ? await verifyToken(token, env.JWT_SECRET) : null
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { url } = body
  if (!url || !/^https?:\/\/.+/.test(url)) {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 未登录用户：每 IP 每天限 3 次静态爬取（渲染链路另有 render 配额，在分流处检查）
  if (!user) {
    const allowed = await checkAndIncrementIpUsage(env.DB, ip, 'static', 3)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again tomorrow.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const sseHeaders = {
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc = new TextEncoder()

  // 在后台执行爬取，通过流推送进度
  ;(async () => {
    // 提升到 try 外：catch 里要用它标记失败（仅静态链路会赋值）
    let recordId: string | null = null
    try {
      const urlHash = await sha16('static:' + url)

      // 静态缓存命中：直接返回 R2 下载链接
      const cached = await getCrawlCache(env.DB, urlHash)
      if (cached) {
        await writer.write(enc.encode(sseEvent('done', {
          fileCount: cached.file_count,
          totalBytes: cached.zip_size,
          jsWarning: false,
          downloadUrl: `${env.R2_PUBLIC_BASE}/${cached.r2_key}`,
        })))
        return
      }

      // ---- V2 分流：入口 HTML 探测 SPA ----
      const entry = await fetchUrl(url)
      const entryCt = entry?.contentType ?? ''
      const entryHtml = entry && (entryCt.includes('text/html') || entryCt.includes('application/xhtml'))
        ? new TextDecoder().decode(entry.data)
        : null

      if (entryHtml && isJsRendered(entryHtml)) {
        const cfg = renderConfig(env)

        // 渲染缓存命中：直接 done
        const renderCached = await getCrawlCache(env.DB, await sha16('render:' + url))
        if (renderCached) {
          await writer.write(enc.encode(sseEvent('done', {
            fileCount: renderCached.file_count,
            totalBytes: renderCached.zip_size,
            jsWarning: false,
            downloadUrl: `${env.R2_PUBLIC_BASE}/${renderCached.r2_key}`,
          })))
          return
        }

        // 熔断检查在配额消耗之前：预算已死时不浪费匿名每日渲染额度
        const budget = await checkBudget(env.DB, cfg.monthlyBudgetSeconds)
        const renderAllowed = budget.allowed
          && (user ? true : await checkAndIncrementIpUsage(env.DB, ip, 'render', cfg.dailyLimitAnon))

        if (renderAllowed) {
          const taskId = crypto.randomUUID()
          await createRenderTask(env.DB, {
            id: taskId,
            url,
            ip: user ? null : ip,
            user_id: user?.sub ?? null,
            created_at: Date.now(),
          })
          await env.RENDER_WORKFLOW.create({ id: taskId, params: { taskId, url, userId: user?.sub ?? null } })
          await writer.write(enc.encode(sseEvent('render_task', { taskId })))
          return
        }

        // 渲染不可用 → 推送原因，降级走静态链路
        await writer.write(enc.encode(sseEvent('notice', {
          reason: budget.allowed ? 'render_quota' : 'render_budget',
        })))
      }

      // ---- 静态链路（V1 原逻辑）。历史记录在确定走静态后才建，
      // 渲染任务的历史由 workflow finalize 自己写（crawl_type 'render'）----
      if (user) {
        recordId = crypto.randomUUID()
        await createCrawlRecord(env.DB, {
          id: recordId,
          user_id: user.sub,
          url,
          status: 'running',
          file_count: null,
          zip_size: null,
          created_at: Date.now(),
          completed_at: null,
        })
      }

      const result = await crawlSite(url, (progress) => {
        writer.write(enc.encode(sseEvent('progress', progress)))
      })

      // 上传 ZIP 到 R2（不走 base64+SSE，规避内存峰值）
      const r2Key = `crawls/static-${urlHash}.zip`
      await env.CRAWL_BUCKET.put(r2Key, result.zip, {
        httpMetadata: { contentType: 'application/zip' },
      })
      await setCrawlCache(env.DB, {
        url_hash: urlHash,
        url,
        r2_key: r2Key,
        file_count: result.fileCount,
        zip_size: result.totalBytes,
        created_at: Date.now(),
      })

      if (user && recordId) {
        await updateCrawlRecord(env.DB, recordId, {
          status: 'done',
          file_count: result.fileCount,
          zip_size: result.totalBytes,
          completed_at: Date.now(),
        })
      }

      await writer.write(enc.encode(sseEvent('done', {
        fileCount: result.fileCount,
        totalBytes: result.totalBytes,
        jsWarning: result.jsWarning,
        downloadUrl: `${env.R2_PUBLIC_BASE}/${r2Key}`,
      })))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Crawl failed'
      if (user && recordId) {
        await updateCrawlRecord(env.DB, recordId, { status: 'failed', completed_at: Date.now() })
      }
      await writer.write(enc.encode(sseEvent('error', { error: msg })))
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, { headers: sseHeaders })
}
```

- [ ] **Step 3: 重写 index.ts（路由 + Env 清理）**

用以下内容**整体替换** `worker/src/index.ts`：

```ts
import { handleRegister, handleLogin } from './auth/handlers'
import { verifyToken, extractBearer } from './auth/jwt'
import { getCrawlHistory } from './db/queries'
import { handleCrawl } from './crawl/handler'
import { handleRenderStatus } from './render/handler'

export { RenderCrawlWorkflow } from './render/workflow'

export interface Env {
  DB: D1Database
  JWT_SECRET: string
  FRONTEND_ORIGIN: string
  CRAWL_BUCKET: R2Bucket
  R2_PUBLIC_BASE: string
  BROWSER: Fetcher
  RENDER_WORKFLOW: Workflow
  RENDER_MONTHLY_BUDGET_S?: string
  RENDER_MAX_PAGES?: string
  RENDER_MAX_BYTES?: string
  RENDER_PAGE_TIMEOUT_MS?: string
  RENDER_BATCH_SIZE?: string
  RENDER_DAILY_LIMIT_ANON?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.FRONTEND_ORIGIN

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    let { pathname } = new URL(request.url)
    // 生产环境通过路由绑定 api.9shi.cc/crawler/* 访问，pathname 带 /crawler 前缀
    // 本地 wrangler dev 直接访问 localhost:8787，pathname 不带前缀
    if (pathname.startsWith('/crawler/')) pathname = pathname.slice('/crawler'.length)

    if (pathname === '/api/auth/register' && request.method === 'POST') {
      return handleRegister(request, env)
    }
    if (pathname === '/api/auth/login' && request.method === 'POST') {
      return handleLogin(request, env)
    }
    const renderStatusMatch = pathname.match(/^\/api\/crawl\/render\/([0-9a-f-]{36})$/)
    if (renderStatusMatch && request.method === 'GET') {
      return handleRenderStatus(env, corsHeaders, renderStatusMatch[1])
    }
    if (pathname === '/api/crawl' && request.method === 'POST') {
      return handleCrawl(request, env, corsHeaders)
    }
    if (pathname === '/api/history' && request.method === 'GET') {
      const token = extractBearer(request)
      const user = token ? await verifyToken(token, env.JWT_SECRET) : null
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const rows = await getCrawlHistory(env.DB, user.sub)
      return new Response(JSON.stringify(rows), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  },
}
```

- [ ] **Step 4: 删除 GHA 链路文件**

```bash
cd worker
git rm src/crawl/js-handler.ts src/crawl/github.ts
grep -rn "js-handler\|from './github'\|GITHUB_TOKEN" src/ || echo "clean"
```

Expected: grep 输出 `clean`（无残留引用）。

- [ ] **Step 5: 类型检查、测试、dev 冒烟**

```bash
cd worker
npx tsc --noEmit
npm test
npx wrangler dev --env dev
# Ready 后 Ctrl+C
```

Expected: 全部通过，启动无报错。

- [ ] **Step 6: 提交**

```bash
git add worker/src/render/handler.ts worker/src/crawl/handler.ts worker/src/index.ts
git commit -m "feat(worker): 入口自动分流渲染链路，GHA 链路下线" -- worker/src/render/handler.ts worker/src/crawl/handler.ts worker/src/index.ts worker/src/crawl/js-handler.ts worker/src/crawl/github.ts
```

（`git rm` 已暂存删除，commit 的 pathspec 里带上两个被删文件即可一起入库。）

---

### Task 12: 前端数据层（api / crawl-state / i18n 增量）

只做**增量添加**，不动组件 —— 本任务结束时旧 UI 仍引用旧键，构建保持绿。旧键删除在 Task 13 组件替换之后。

**Files:**
- Modify: `app/src/lib/api.ts`（末尾追加）
- Modify: `app/src/lib/crawl-state.ts`（接口加 2 字段）
- Modify: `app/src/lib/i18n.ts`（zh/en 各追加 15 个 crawl_render_* 键）

- [ ] **Step 1: api.ts 追加渲染状态查询**

在 `app/src/lib/api.ts` 末尾追加：

```ts
// 渲染任务状态（GET /api/crawl/render/:taskId 响应）
export interface RenderStatus {
  status: 'queued' | 'running' | 'done' | 'partial' | 'failed'
  phase: 'discovering' | 'rendering' | 'assets' | 'zipping' | null
  pagesDone: number
  pagesTotal: number | null
  bytes: number
  downloadUrl?: string
  error?: string
  failedPages: string[]
}

export async function getRenderStatus(taskId: string): Promise<RenderStatus | null> {
  try {
    const res = await fetchWorker(`/api/crawl/render/${taskId}`)
    if (!res.ok) return null
    return await res.json() as RenderStatus
  } catch {
    return null // 网络抖动等：调用方保持轮询
  }
}
```

- [ ] **Step 2: crawl-state.ts 增加渲染任务字段**

把 `app/src/lib/crawl-state.ts` 的 `CrawlState` 接口替换为：

```ts
export interface CrawlState {
  url: string
  status: CrawlStatus
  fileCount?: number
  totalBytes?: number
  jsWarning?: boolean
  mode?: 'static' | 'render'  // 缺省视为 static（兼容旧存量数据）
  renderTaskId?: string
}
```

- [ ] **Step 3: i18n.ts 追加渲染键**

在 `app/src/lib/i18n.ts` **zh 区块**的 `crawl_js_cached: "已有缓存，直接下载",`（第 54 行附近）之后插入：

```ts
    crawl_render_queued: "渲染任务排队中",
    crawl_render_running: "云端渲染进行中",
    crawl_render_phase_discovering: "发现页面中",
    crawl_render_phase_rendering: "渲染页面中",
    crawl_render_phase_assets: "补抓资源中",
    crawl_render_phase_zipping: "打包上传中",
    crawl_render_done: "渲染归档完成",
    crawl_render_partial: "渲染完成（部分内容缺失）",
    crawl_render_failed: "渲染任务失败",
    crawl_render_download: "下载渲染 ZIP",
    crawl_render_pages: "页面进度",
    crawl_render_bytes: "已捕获体积",
    crawl_render_failed_pages: "渲染失败页面",
    crawl_render_notice_quota: "今日渲染额度已用完，已降级为静态爬取",
    crawl_render_notice_budget: "本月渲染时长预算已用完，已降级为静态爬取",
```

在 **en 区块**的 `crawl_js_cached: "Cached result available",`（第 216 行附近）之后插入：

```ts
    crawl_render_queued: "Render task queued",
    crawl_render_running: "Cloud rendering in progress",
    crawl_render_phase_discovering: "Discovering pages",
    crawl_render_phase_rendering: "Rendering pages",
    crawl_render_phase_assets: "Fetching assets",
    crawl_render_phase_zipping: "Packaging archive",
    crawl_render_done: "Render archive complete",
    crawl_render_partial: "Render complete (some content missing)",
    crawl_render_failed: "Render task failed",
    crawl_render_download: "Download render ZIP",
    crawl_render_pages: "Pages",
    crawl_render_bytes: "Captured size",
    crawl_render_failed_pages: "Failed pages",
    crawl_render_notice_quota: "Daily render quota reached; fell back to static crawl",
    crawl_render_notice_budget: "Monthly render budget exhausted; fell back to static crawl",
```

- [ ] **Step 4: 构建验证**

```bash
cd app
npm run build
```

Expected: 构建成功，无类型错误。

- [ ] **Step 5: 提交**

```bash
git add app/src/lib/api.ts app/src/lib/crawl-state.ts app/src/lib/i18n.ts
git commit -m "feat(app): 渲染任务数据层（状态查询/本地态/文案键）" -- app/src/lib/api.ts app/src/lib/crawl-state.ts app/src/lib/i18n.ts
```

---

### Task 13: 前端渲染车道 UI（组件与页面重写）

GHA 轮询 UI 全部换成渲染任务车道：SSE 收到 `render_task` 后切 3 秒轮询；`notice` 显示降级原因横幅；刷新/重开页面可从 localStorage 恢复轮询。最后删除不再被引用的 crawl_js_* 旧键（保留 `crawl_js_warning`，静态降级仍在用）。

**Files:**
- Modify: `app/src/components/CrawlProgress.tsx`（整文件替换）
- Modify: `app/src/routes/crawl.tsx`（整文件替换）
- Modify: `app/src/lib/i18n.ts`（删 7 个旧键 ×2 语言）

- [ ] **Step 1: 重写 CrawlProgress.tsx**

用以下内容**整体替换** `app/src/components/CrawlProgress.tsx`：

```tsx
import { useLang } from '../lib/i18n'
import type { MessageKey } from '../lib/i18n'
import type { RenderStatus } from '../lib/api'
import { MaterialIcon } from './home/MaterialIcon'

interface ProgressState {
  downloaded: number
  queued: number
  bytes: number
}

interface Props {
  status: 'running' | 'done' | 'failed'
  progress?: ProgressState
  fileCount?: number
  totalBytes?: number
  jsWarning?: boolean
  onDownload?: () => void
  renderStatus?: RenderStatus | null
  renderNotice?: 'render_quota' | 'render_budget' | null
  onDownloadRender?: () => void
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function CrawlProgress({ status, progress, fileCount, totalBytes, jsWarning, onDownload, renderStatus, renderNotice, onDownloadRender }: Props) {
  const { lang, t } = useLang()

  const pct = progress && progress.queued > 0
    ? Math.min(99, Math.round((progress.downloaded / progress.queued) * 100))
    : null
  const renderPct = renderStatus && renderStatus.pagesTotal
    ? Math.min(99, Math.round((renderStatus.pagesDone / renderStatus.pagesTotal) * 100))
    : null
  const copy = {
    zh: {
      panel: 'crawl telemetry',
      staticLane: '静态链路',
      renderLane: '渲染链路',
      failedHint: '任务没有完成。可以检查 URL、目标站点可访问性或稍后重试。',
      packageSummary: '打包结果',
      liveQueue: '实时队列',
      downloaded: '已下载',
      queued: '队列总数',
      bytes: '当前体积',
      renderDesc: '检测到 SPA，已转入云端浏览器异步渲染。任务在后台运行，可关闭页面稍后回来查看。',
    },
    en: {
      panel: 'crawl telemetry',
      staticLane: 'Static lane',
      renderLane: 'Render lane',
      failedHint: 'The job did not finish. Check the URL, target availability, or retry later.',
      packageSummary: 'Package summary',
      liveQueue: 'Live queue',
      downloaded: 'Downloaded',
      queued: 'Queued',
      bytes: 'Current size',
      renderDesc: 'SPA detected — escalated to async cloud-browser rendering. The job runs in the background; you can close this page and come back.',
    },
  }[lang]

  const renderActive = renderStatus != null
  const renderRunning = renderActive && (renderStatus.status === 'queued' || renderStatus.status === 'running')
  const renderDownloadable = renderActive
    && (renderStatus.status === 'done' || renderStatus.status === 'partial')
    && !!renderStatus.downloadUrl

  const headerText = renderActive
    ? renderStatus.status === 'queued' ? t('crawl_render_queued')
      : renderStatus.status === 'running' ? t('crawl_render_running')
      : renderStatus.status === 'partial' ? t('crawl_render_partial')
      : renderStatus.status === 'failed' ? t('crawl_render_failed')
      : t('crawl_render_done')
    : status === 'running' ? t('crawl_running') : status === 'done' ? t('crawl_done') : t('crawl_failed')

  const headerOk = renderActive
    ? renderStatus.status === 'done' || renderStatus.status === 'partial'
    : status === 'done'
  const headerFailed = renderActive ? renderStatus.status === 'failed' : status === 'failed'

  return (
    <div className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--sc-border)] px-5 py-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[2.52px] text-[var(--sc-subtle)]">{copy.panel}</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--sc-strong)]">
            {renderActive ? copy.renderLane : copy.staticLane}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {(renderActive ? renderRunning : status === 'running') && (
            <div className="size-4 rounded-full border-2 border-[var(--sc-accent)] border-t-transparent animate-spin" />
          )}
          {headerOk && <MaterialIcon name="check_circle" className="text-[var(--sc-accent)]" />}
          {headerFailed && <MaterialIcon name="error" className="text-red-500" />}
          <span className="font-medium text-[var(--sc-text)]">{headerText}</span>
          {renderActive && renderRunning && renderPct !== null && (
            <span className="font-mono text-sm text-[var(--sc-accent)]">{renderPct}%</span>
          )}
          {!renderActive && status === 'running' && pct !== null && (
            <span className="font-mono text-sm text-[var(--sc-accent)]">{pct}%</span>
          )}
        </div>
      </div>

      <div className="p-5">
      {renderNotice && (
        <div className="mb-5 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <MaterialIcon name="info" className="shrink-0 text-amber-600" />
          <span>{renderNotice === 'render_quota' ? t('crawl_render_notice_quota') : t('crawl_render_notice_budget')}</span>
        </div>
      )}

      {renderActive ? (
        <>
          <p className="mb-5 text-sm leading-6 text-[var(--sc-muted)]">{copy.renderDesc}</p>

          {renderRunning && (
            <div className="mb-5">
              <div className="mb-2 flex justify-between text-sm text-[var(--sc-muted)]">
                <span>
                  {renderStatus.phase
                    ? t(`crawl_render_phase_${renderStatus.phase}` as MessageKey)
                    : t('crawl_render_queued')}
                </span>
                <span className="font-mono">{renderStatus.pagesDone} / {renderStatus.pagesTotal ?? '?'}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--sc-soft)]">
                <div
                  className="h-2 rounded-full bg-[var(--sc-accent)] transition-all duration-300"
                  style={{ width: `${renderPct ?? 5}%` }}
                />
              </div>
            </div>
          )}

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
              <p className="text-xs text-[var(--sc-subtle)]">{t('crawl_render_pages')}</p>
              <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">
                {renderStatus.pagesDone}{renderStatus.pagesTotal != null ? ` / ${renderStatus.pagesTotal}` : ''}
              </p>
            </div>
            <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
              <p className="text-xs text-[var(--sc-subtle)]">{t('crawl_render_bytes')}</p>
              <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">{formatBytes(renderStatus.bytes)}</p>
            </div>
            <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
              <p className="text-xs text-[var(--sc-subtle)]">{t('crawl_render_failed_pages')}</p>
              <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">{renderStatus.failedPages.length}</p>
            </div>
          </div>

          {renderStatus.status === 'failed' && (
            <p className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
              {renderStatus.error ?? copy.failedHint}
            </p>
          )}

          {renderDownloadable && onDownloadRender && (
            <button
              onClick={onDownloadRender}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--sc-accent)] px-5 py-2 font-semibold text-[var(--sc-on-accent)] transition-opacity hover:opacity-90"
            >
              <MaterialIcon name="download" className="text-[20px]" />
              {t('crawl_render_download')}
            </button>
          )}
        </>
      ) : (
        <>
          {jsWarning && (
            <div className="mb-5 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <MaterialIcon name="warning" className="shrink-0 text-amber-600" />
              <span>{t('crawl_js_warning')}</span>
            </div>
          )}

          {status === 'running' && progress && (
            <>
              <p className="mb-3 text-sm font-semibold text-[var(--sc-strong)]">{copy.liveQueue}</p>
              <div className="mb-4 h-2 w-full rounded-full bg-[var(--sc-soft)]">
                <div
                  className="h-2 rounded-full bg-[var(--sc-accent)] transition-all duration-300"
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                  <p className="text-xs text-[var(--sc-subtle)]">{copy.downloaded}</p>
                  <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">{progress.downloaded}</p>
                </div>
                <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                  <p className="text-xs text-[var(--sc-subtle)]">{copy.queued}</p>
                  <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">{progress.queued}</p>
                </div>
                <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                  <p className="text-xs text-[var(--sc-subtle)]">{copy.bytes}</p>
                  <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">{formatBytes(progress.bytes)}</p>
                </div>
              </div>
            </>
          )}

          {status === 'done' && (fileCount !== undefined || totalBytes !== undefined) && (
            <div className="mb-5">
              <p className="mb-3 text-sm font-semibold text-[var(--sc-strong)]">{copy.packageSummary}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {fileCount !== undefined && (
                  <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                    <p className="text-xs text-[var(--sc-subtle)]">{t('crawl_files')}</p>
                    <p className="mt-1 font-mono text-xl text-[var(--sc-strong)]">{fileCount}</p>
                  </div>
                )}
                {totalBytes !== undefined && (
                  <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                    <p className="text-xs text-[var(--sc-subtle)]">{t('crawl_size')}</p>
                    <p className="mt-1 font-mono text-xl text-[var(--sc-strong)]">{formatBytes(totalBytes)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {status === 'failed' && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">{copy.failedHint}</p>
          )}

          {status === 'done' && onDownload && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={onDownload}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--sc-accent)] px-5 py-2 font-semibold text-[var(--sc-on-accent)] transition-opacity hover:opacity-90"
              >
                <MaterialIcon name="download" className="text-[20px]" />
                {t('crawl_download')}
              </button>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 重写 crawl.tsx**

用以下内容**整体替换** `app/src/routes/crawl.tsx`：

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { z } from 'zod'
import { useLang } from '../lib/i18n'
import { fetchWorker, getRenderStatus } from '../lib/api'
import type { RenderStatus } from '../lib/api'
import { saveCrawlState, loadCrawlState, clearCrawlState } from '../lib/crawl-state'
import { CrawlProgress } from '../components/CrawlProgress'
import { MaterialIcon } from '../components/home/MaterialIcon'

const searchSchema = z.object({ url: z.string().optional() })

type Status = 'idle' | 'running' | 'done' | 'failed'

interface ProgressState {
  downloaded: number
  queued: number
  bytes: number
}

function CrawlPage() {
  const { url } = Route.useSearch()
  const { lang, t } = useLang()
  const [inputUrl, setInputUrl] = useState(url ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState<ProgressState>({ downloaded: 0, queued: 0, bytes: 0 })
  const [fileCount, setFileCount] = useState<number>()
  const [totalBytes, setTotalBytes] = useState<number>()
  const [jsWarning, setJsWarning] = useState(false)
  const zipRef = useRef<Blob | null>(null)
  const staticDownloadUrlRef = useRef<string | null>(null)
  const zipNameRef = useRef('site.zip')
  const [renderStatus, setRenderStatus] = useState<RenderStatus | null>(null)
  const [renderNotice, setRenderNotice] = useState<'render_quota' | 'render_budget' | null>(null)
  const renderTaskIdRef = useRef<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const copy = {
    zh: {
      eyebrow: 'CRAWL CONSOLE',
      title: '启动一次可观测的网站归档任务',
      subtitle: '输入目标 URL 后自动识别站点类型：静态站实时返回资源队列与打包体积；检测到 SPA 则转入云端浏览器异步渲染整站。',
      inputLabel: '目标站点 URL',
      staticLane: '静态边缘链路',
      staticLaneDesc: '适合静态站、SSR 页面、资源可直接发现的网站。',
      jsLane: '渲染链路',
      jsLaneDesc: '检测到 SPA 时自动启用：云端浏览器渲染 + 异步全站爬取。',
      deliverable: '交付物',
      deliverableDesc: '输出 ZIP,保留目录结构和可离线检查的资源。',
      queueTitle: '任务边界',
      queueItems: ['静态最大 900 文件 / 100MB', '渲染最大 500 页 / 900MB，匿名每日 1 次', '渲染任务异步执行，可关闭页面后回来查看'],
      targetHint: '建议输入完整 URL,例如 https://example.com',
      statusIdle: '等待输入',
      statusRunning: '任务运行中',
      statusDone: '归档已完成',
      statusFailed: '任务失败,请检查 URL 或稍后重试',
    },
    en: {
      eyebrow: 'CRAWL CONSOLE',
      title: 'Start an observable website archive job',
      subtitle: 'Enter a target URL and the site type is detected automatically: static sites stream queue and package size in real time; SPAs escalate to async cloud-browser rendering of the whole site.',
      inputLabel: 'Target site URL',
      staticLane: 'Static edge lane',
      staticLaneDesc: 'Best for static sites, SSR pages, and directly discoverable assets.',
      jsLane: 'Render lane',
      jsLaneDesc: 'Auto-enabled for SPAs: cloud-browser rendering plus an async full-site crawl.',
      deliverable: 'Deliverable',
      deliverableDesc: 'Outputs a ZIP with folder structure and offline-reviewable assets.',
      queueTitle: 'Job boundaries',
      queueItems: ['Static limit: 900 files / 100MB', 'Render limit: 500 pages / 900MB, 1 anonymous run per day', 'Render jobs run async — close the page and come back later'],
      targetHint: 'Use a full URL, for example https://example.com',
      statusIdle: 'Waiting for input',
      statusRunning: 'Job running',
      statusDone: 'Archive complete',
      statusFailed: 'Job failed. Check the URL or retry later.',
    },
  }[lang]

  const statusText = status === 'idle'
    ? copy.statusIdle
    : status === 'running'
      ? copy.statusRunning
      : status === 'done'
        ? copy.statusDone
        : copy.statusFailed

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      // 渲染任务在云端异步执行，离开页面不中断；只拦静态任务
      if (status === 'running' && !renderTaskIdRef.current) {
        e.preventDefault()
        e.returnValue = t('crawl_leave_confirm')
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [status, t])

  function startRenderPolling(taskId: string, targetUrl: string) {
    renderTaskIdRef.current = taskId
    saveCrawlState({ url: targetUrl, status: 'running', mode: 'render', renderTaskId: taskId })
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    pollIntervalRef.current = setInterval(async () => {
      const s = await getRenderStatus(taskId)
      if (!s) return // 网络抖动：继续轮询
      setRenderStatus(s)
      if (s.status === 'done' || s.status === 'partial') {
        clearInterval(pollIntervalRef.current!)
        setStatus('done')
        saveCrawlState({ url: targetUrl, status: 'done', mode: 'render', renderTaskId: taskId })
      } else if (s.status === 'failed') {
        clearInterval(pollIntervalRef.current!)
        setStatus('failed')
        saveCrawlState({ url: targetUrl, status: 'failed', mode: 'render', renderTaskId: taskId })
      }
    }, 3000)
  }

  async function startCrawl(targetUrl: string) {
    setStatus('running')
    setProgress({ downloaded: 0, queued: 0, bytes: 0 })
    saveCrawlState({ url: targetUrl, status: 'running' })

    try {
      const res = await fetchWorker('/api/crawl', {
        method: 'POST',
        body: JSON.stringify({ url: targetUrl }),
      })

      if (!res.ok || !res.body) {
        setStatus('failed')
        saveCrawlState({ url: targetUrl, status: 'failed' })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      function processEvents(chunk: string) {
        buf += chunk
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/)
          const dataMatch = part.match(/^data: (.+)$/m)
          if (!eventMatch || !dataMatch) continue

          const event = eventMatch[1]
          let data: Record<string, unknown>
          try {
            data = JSON.parse(dataMatch[1])
          } catch {
            continue
          }

          if (event === 'progress') {
            setProgress({
              downloaded: data.downloaded as number,
              queued: data.queued as number,
              bytes: data.bytes as number,
            })
          } else if (event === 'render_task') {
            // SPA 分流：worker 已建渲染任务，转入轮询（SSE 流随后由服务端关闭）
            startRenderPolling(data.taskId as string, targetUrl)
          } else if (event === 'notice') {
            // 渲染不可用，降级静态；显示原因横幅
            setRenderNotice(data.reason as 'render_quota' | 'render_budget')
          } else if (event === 'done') {
            const count = data.fileCount as number
            const bytes = data.totalBytes as number
            const jsWarn = data.jsWarning as boolean
            const downloadUrl = data.downloadUrl as string | undefined

            zipNameRef.current = `site-${new URL(targetUrl).hostname}.zip`
            if (downloadUrl) {
              staticDownloadUrlRef.current = downloadUrl
            } else if (data.zip) {
              // 向后兼容：旧版返回 base64
              const binary = atob(data.zip as string)
              const arr = new Uint8Array(binary.length)
              for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
              zipRef.current = new Blob([arr], { type: 'application/zip' })
            }

            setFileCount(count)
            setTotalBytes(bytes)
            setJsWarning(jsWarn)
            setStatus('done')
            saveCrawlState({ url: targetUrl, status: 'done', fileCount: count, totalBytes: bytes })
          } else if (event === 'error') {
            setStatus('failed')
            saveCrawlState({ url: targetUrl, status: 'failed' })
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (value) processEvents(decoder.decode(value, { stream: !done }))
        if (done) {
          // 处理流结束时 buf 里可能残留的最后一个事件
          if (buf.trim()) processEvents('\n\n')
          break
        }
      }
    } catch {
      // 渲染轮询已接管时，SSE 通道的中断不算失败
      if (!renderTaskIdRef.current) {
        setStatus('failed')
        saveCrawlState({ url: targetUrl, status: 'failed' })
      }
    }
  }

  function downloadZip() {
    if (staticDownloadUrlRef.current) {
      const a = document.createElement('a')
      a.href = staticDownloadUrlRef.current
      a.download = zipNameRef.current
      a.click()
      return
    }
    if (!zipRef.current) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(zipRef.current)
    a.download = zipNameRef.current
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function downloadRenderZip() {
    if (!renderStatus?.downloadUrl) return
    const a = document.createElement('a')
    a.href = renderStatus.downloadUrl
    a.download = `site-render-${new URL(inputUrl).hostname}.zip`
    a.click()
  }

  useEffect(() => {
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current) }
  }, [])

  useEffect(() => {
    // 恢复进行中的渲染任务（刷新/重开页面）；否则按 ?url= 自动开跑
    const saved = loadCrawlState()
    if (saved?.mode === 'render' && saved.renderTaskId && saved.status === 'running') {
      setInputUrl(saved.url)
      setStatus('running')
      startRenderPolling(saved.renderTaskId, saved.url)
      return
    }
    if (url && status === 'idle') startCrawl(url)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'running') return
    clearCrawlState()
    zipRef.current = null
    staticDownloadUrlRef.current = null
    setFileCount(undefined)
    setTotalBytes(undefined)
    setJsWarning(false)
    setProgress({ downloaded: 0, queued: 0, bytes: 0 })
    setRenderStatus(null)
    setRenderNotice(null)
    renderTaskIdRef.current = null
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    startCrawl(inputUrl)
  }

  return (
    <div className="min-h-screen bg-[var(--sc-bg)] pt-16 text-[var(--sc-text)]">
      <section className="relative overflow-hidden border-b border-[var(--sc-border)] px-6 py-16">
        <div className="absolute inset-0 -z-0 bg-[linear-gradient(var(--sc-bg-grid)_1px,transparent_1px),linear-gradient(90deg,var(--sc-bg-grid)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="relative z-10 mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">{copy.eyebrow}</p>
            <h1 className="max-w-3xl text-4xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-[var(--sc-muted)] md:text-lg">
              {copy.subtitle}
            </p>

            <form onSubmit={handleSubmit} className="mt-10 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-2">
              <label className="mb-2 block px-2 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-subtle)]">
                {copy.inputLabel}
              </label>
              <div className="flex flex-col gap-2 md:flex-row">
                <div className="flex min-h-12 flex-1 items-center rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] px-4">
                  <MaterialIcon name="link" className="text-[var(--sc-subtle)]" />
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={e => setInputUrl(e.target.value)}
                    placeholder={t('hero_placeholder')}
                    disabled={status === 'running'}
                    className="h-12 w-full border-none bg-transparent text-base text-[var(--sc-strong)] outline-none placeholder:text-[var(--sc-subtle)] disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={status === 'running' || !inputUrl}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--sc-accent)] px-6 py-3 font-semibold text-[var(--sc-on-accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <MaterialIcon name={status === 'running' ? 'progress_activity' : 'travel_explore'} className={`text-[20px] ${status === 'running' ? 'animate-spin' : ''}`} />
                  {status === 'running' ? t('crawl_running') : t('crawl_start')}
                </button>
              </div>
              <p className="px-2 pt-3 text-sm text-[var(--sc-subtle)]">{copy.targetHint}</p>
            </form>
          </div>

          <aside className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-5">
            <div className="mb-5 flex items-center justify-between border-b border-[var(--sc-border)] pb-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[2.52px] text-[var(--sc-subtle)]">current state</p>
                <p className="mt-1 font-semibold text-[var(--sc-strong)]">{statusText}</p>
              </div>
              <span className={`size-3 rounded-full ${status === 'failed' ? 'bg-red-500' : status === 'running' ? 'animate-pulse bg-[var(--sc-accent)]' : 'bg-[var(--sc-accent)]'}`} />
            </div>

            <div className="grid gap-3">
              <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                <div className="mb-2 flex items-center gap-2 text-[var(--sc-accent)]">
                  <MaterialIcon name="bolt" className="text-[20px]" />
                  <h2 className="font-semibold text-[var(--sc-strong)]">{copy.staticLane}</h2>
                </div>
                <p className="text-sm leading-6 text-[var(--sc-muted)]">{copy.staticLaneDesc}</p>
              </div>
              <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                <div className="mb-2 flex items-center gap-2 text-[var(--sc-accent)]">
                  <MaterialIcon name="javascript" className="text-[20px]" />
                  <h2 className="font-semibold text-[var(--sc-strong)]">{copy.jsLane}</h2>
                </div>
                <p className="text-sm leading-6 text-[var(--sc-muted)]">{copy.jsLaneDesc}</p>
              </div>
              <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                <div className="mb-2 flex items-center gap-2 text-[var(--sc-accent)]">
                  <MaterialIcon name="folder_zip" className="text-[20px]" />
                  <h2 className="font-semibold text-[var(--sc-strong)]">{copy.deliverable}</h2>
                </div>
                <p className="text-sm leading-6 text-[var(--sc-muted)]">{copy.deliverableDesc}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="px-6 py-10">
        <div className="mx-auto grid max-w-[1200px] gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            {status !== 'idle' ? (
              <CrawlProgress
                status={status as 'running' | 'done' | 'failed'}
                progress={status === 'running' ? progress : undefined}
                fileCount={fileCount}
                totalBytes={totalBytes}
                jsWarning={jsWarning}
                onDownload={downloadZip}
                renderStatus={renderStatus}
                renderNotice={renderNotice}
                onDownloadRender={downloadRenderZip}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--sc-border)] bg-[var(--sc-card)] p-8">
                <MaterialIcon name="input" className="mb-5 block text-4xl text-[var(--sc-accent)]" />
                <h2 className="mb-3 text-2xl font-normal text-[var(--sc-strong)]">{copy.statusIdle}</h2>
                <p className="max-w-2xl text-sm leading-6 text-[var(--sc-muted)]">{copy.targetHint}</p>
              </div>
            )}
          </div>

          <aside className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-5">
            <h2 className="mb-4 font-semibold text-[var(--sc-strong)]">{copy.queueTitle}</h2>
            <ul className="space-y-3">
              {copy.queueItems.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-[var(--sc-muted)]">
                  <MaterialIcon name="check_circle" className="mt-0.5 text-[18px] text-[var(--sc-accent)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </div>
  )
}

export const Route = createFileRoute('/crawl')({
  validateSearch: searchSchema,
  component: CrawlPage,
})
```

- [ ] **Step 3: 删除 i18n 旧键**

在 `app/src/lib/i18n.ts` 删除以下键（**两个语言区块都删**，`crawl_js_warning` 保留——静态降级提示仍在用）：

- `crawl_js_full`
- `crawl_js_running`
- `crawl_js_download`
- `crawl_js_failed`
- `crawl_js_phase_crawl`
- `crawl_js_phase_assets`
- `crawl_js_cached`

zh 区块即原第 48-54 行；en 区块即原第 210-216 行（`crawl_js_warning` 在 en 是跨两行的字符串，注意别误删）。

验证：

```bash
cd app
grep -n "crawl_js_" src/lib/i18n.ts
grep -rn "crawl_js_" src/ --include="*.tsx" --include="*.ts" | grep -v "crawl_js_warning"
```

Expected: 第一条只剩 `crawl_js_warning`（zh/en 各一处）；第二条无输出。

- [ ] **Step 4: 构建验证**

```bash
cd app
npm run build
```

Expected: 构建成功。

- [ ] **Step 5: 提交**

```bash
git add app/src/components/CrawlProgress.tsx app/src/routes/crawl.tsx app/src/lib/i18n.ts
git commit -m "feat(app): 渲染车道 UI 与任务轮询，下线 GHA 轮询界面" -- app/src/components/CrawlProgress.tsx app/src/routes/crawl.tsx app/src/lib/i18n.ts
```

---

### Task 14: 本地端到端验证

不写新代码，跑通本地全链路。Browser Run 本地首跑会下载 Chromium（一次性，几分钟），Workflows 本地由 wrangler 模拟。

**Files:** 无（验证任务）

- [ ] **Step 1: 启动本地 worker**

```bash
cd worker
npx wrangler dev --env dev
```

后台跑（用 run_in_background 或单独终端）。Expected: 启动日志包含 `RENDER_WORKFLOW` 与 `BROWSER` 绑定，监听 `http://localhost:8787`。

首次触发渲染时 wrangler 会下载本地 Chromium，看到 `Downloading Chromium...` 属正常，等它完成。

- [ ] **Step 2: SPA 分流验证（demo.realworld.io）**

```bash
curl -N -X POST http://localhost:8787/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://demo.realworld.io"}'
```

Expected: SSE 流中出现：

```
event: render_task
data: {"taskId":"<uuid>"}
```

记下 taskId。

- [ ] **Step 3: 轮询任务状态直到完成**

```bash
curl http://localhost:8787/api/crawl/render/<taskId>
```

每隔几秒重复。Expected 顺序：`{"status":"queued"...}` → `{"status":"running","phase":"discovering"...}` → `phase":"rendering"` 且 pagesDone 递增 → 最终 `{"status":"done"或"partial","downloadUrl":"..."}`。

若卡在 queued 超过 2 分钟，查看 wrangler dev 终端日志定位（常见：Chromium 还在下载、或 workflow 类未导出）。

- [ ] **Step 4: 检查 ZIP 产物**

```bash
cd worker
npx wrangler r2 object get site-crawler-results/crawls/render-<hash>.zip --local --file=/tmp/render-test.zip
unzip -l /tmp/render-test.zip | head -50
```

（`render-<hash>.zip` 的实际 key 从 Step 3 的 downloadUrl 或 D1 `r2_key` 字段拿：`npx wrangler d1 execute site-crawler-db --local --command "SELECT r2_key, pages_done, bytes FROM render_tasks ORDER BY created_at DESC LIMIT 1"`）

Expected: zip 内含 `index.html`、若干 `*/index.html` 子页面、`assets/` 下静态资源；`index.html` 用编辑器打开能看到渲染后的正文内容（不是空壳 `<div id="root"></div>`）。

- [ ] **Step 5: 静态回归（dripulse.com）**

```bash
curl -N -X POST http://localhost:8787/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://dripulse.com"}'
```

Expected: 走静态链路，SSE 输出 progress 流和最终 `event: done`（含 downloadUrl），**没有** render_task 事件。

- [ ] **Step 6: 匿名配额熔断演练**

对 demo.realworld.io 当天第二次匿名触发（Step 2 已消耗 1 次）：

```bash
curl -N -X POST http://localhost:8787/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://demo.realworld.io"}'
```

Expected: SSE 出现 `event: notice` / `data: {"reason":"render_quota"}`，随后降级走静态链路输出 progress/done。

- [ ] **Step 7: 月度预算熔断演练**

```bash
cd worker
npx wrangler d1 execute site-crawler-db --local --command \
  "INSERT OR REPLACE INTO render_usage (month, browser_seconds) VALUES (strftime('%Y-%m','now'), 99999)"
```

换一个 SPA URL（避开日配额计数，比如 `https://react.dev` 若被判定 SPA；或直接清掉 usage 表里今天的 render 记录后再打 demo.realworld.io）：

```bash
npx wrangler d1 execute site-crawler-db --local --command \
  "DELETE FROM usage_limits WHERE crawl_type = 'render'"
curl -N -X POST http://localhost:8787/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://demo.realworld.io"}'
```

Expected: `event: notice` / `{"reason":"render_budget"}`，降级静态。

清理种子数据：

```bash
npx wrangler d1 execute site-crawler-db --local --command \
  "DELETE FROM render_usage WHERE month = strftime('%Y-%m','now')"
```

- [ ] **Step 8: 前端联调**

```bash
cd app
echo "VITE_WORKER_URL=http://localhost:8787" > .env.local
npm run dev
```

浏览器打开 `http://localhost:5173/crawl`：

1. 输入 `https://demo.realworld.io` 启动 → 界面切到「渲染链路」卡片，phase 文案、页数进度条、字节数随轮询更新；
2. 任务运行中刷新页面 → 自动恢复轮询（localStorage）；
3. 完成后出现下载按钮，点击能下载 zip；
4. 输入 `https://dripulse.com` → 走静态车道实时队列，行为与 V1 一致。

注意：`.env.local` 不要提交（应已在 .gitignore；若没有，不要 `git add` 它）。

Expected: 4 项全部通过。

- [ ] **Step 9: 单测全量回归**

```bash
cd worker
npm test
npx tsc --noEmit
```

Expected: 全部通过。

无代码改动，本任务无提交。

---

### Task 15: 部署上线与 GHA 退役

⚠️ 本任务含远程操作。用户已对本项目预授权（增删改查），但执行每条远程命令前先在回复里知会一声正在做什么。本地验证（Task 14）必须已全部通过。

**Files:** 无（运维任务）

- [ ] **Step 1: 远程 D1 迁移**

```bash
cd worker
npx wrangler d1 execute site-crawler-db --remote --file=migrations/004_add_render_tasks.sql
npx wrangler d1 execute site-crawler-db --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('render_tasks','render_usage')"
```

Expected: 两张表都在。

- [ ] **Step 2: R2 暂存区生命周期规则**

渲染暂存对象（`render/` 前缀）7 天自动过期，兜底清理 deleteStaging 漏掉的残留：

```bash
npx wrangler r2 bucket lifecycle add site-crawler-results --prefix render/ --expire-days 7
npx wrangler r2 bucket lifecycle list site-crawler-results
```

Expected: 列表中出现 prefix=render/、expire 7 days 的规则。

- [ ] **Step 3: 部署 worker**

```bash
cd worker
npx wrangler deploy
```

Expected: 部署成功，输出里包含 workflows 绑定 `render-crawl` 与 browser 绑定。

- [ ] **Step 4: 删除 GITHUB_TOKEN secret**

代码已不再引用（Task 11 删除）：

```bash
npx wrangler secret delete GITHUB_TOKEN
```

Expected: 删除成功（若提示不存在也算通过）。

- [ ] **Step 5: 部署前端**

```bash
cd app
npm run build
npx wrangler pages deploy dist --project-name=site-crawler
```

Expected: 部署成功。

- [ ] **Step 6: 归档 GHA 仓库**

```bash
gh repo archive aotushi/site-crawler-actions --yes
```

Expected: 仓库归档成功（只读，保留历史）。

- [ ] **Step 7: 生产验收**

在生产前端页面（Pages 域名）执行：

1. 爬 `https://demo.realworld.io` → 渲染车道启动、进度推进、最终可下载 zip；
2. 爬 `https://dripulse.com` → 静态车道正常；
3. 检查远程用量已记账：

```bash
cd worker
npx wrangler d1 execute site-crawler-db --remote --command \
  "SELECT * FROM render_usage; SELECT id, url, status, pages_done, bytes FROM render_tasks ORDER BY created_at DESC LIMIT 3"
```

Expected: render_usage 有当月行且 browser_seconds > 0；render_tasks 最新记录 status 为 done/partial。

无代码改动，本任务无提交。

---

### Task 16: README 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 逐处替换 V1 → V2 描述**

对 `README.md` 做以下修改（先 Read 整个文件确认行号，按当前实际内容微调措辞）：

1. **API 路由表**：删除 `/api/crawl/js/trigger`、`/api/crawl/js/status` 两行，新增一行：

```markdown
| GET | `/api/crawl/render/:taskId` | 渲染任务状态查询（轮询） |
```

2. **架构图/流程框**：把 GitHub Actions 相关的框（`GitHub Actions` / `Playwright`）替换为：

```
Cloudflare Browser Run (浏览器渲染)
        ↓
Cloudflare Workflows (异步全站编排)
        ↓
R2 (暂存 render/ → 产物 crawls/*.zip)
```

3. **技术栈表**：JS 渲染一行从 `GitHub Actions + Playwright` 改为 `Cloudflare Browser Run + Workflows`。

4. **爬取流程描述**：改为「单入口自动分流：先按静态抓取入口页，检测到 SPA（JS 渲染壳）时自动创建渲染任务，由 Workflows 在云端浏览器中逐批渲染全站、截获静态资源、打包 ZIP 存 R2；前端通过 SSE 收到任务号后轮询状态」。

5. **V1 GHA 段落**：标注为历史方案（保留一句「V1 曾采用 GitHub Actions + Playwright，V2 已由 Cloudflare Browser Run 替代，仓库 aotushi/site-crawler-actions 已归档」），删除其配置说明。

6. **环境变量/Secrets 章节**：删除 `GITHUB_TOKEN`；新增 RENDER_* 六个 vars 的表格（名称/默认值/含义）：

```markdown
| 变量 | 默认 | 含义 |
|------|------|------|
| RENDER_MONTHLY_BUDGET_S | 32400 | 月度浏览器时长预算（秒），超出后熔断降级静态 |
| RENDER_MAX_PAGES | 500 | 单任务页面上限 |
| RENDER_MAX_BYTES | 943718400 | 单任务字节上限（900MB） |
| RENDER_PAGE_TIMEOUT_MS | 15000 | 单页渲染超时 |
| RENDER_BATCH_SIZE | 10 | 每个 Workflow step 渲染页数 |
| RENDER_DAILY_LIMIT_ANON | 1 | 匿名每日渲染次数 |
```

7. **部署章节**：迁移命令追加 004：

```bash
npx wrangler d1 execute site-crawler-db --remote --file=migrations/004_add_render_tasks.sql
npx wrangler r2 bucket lifecycle add site-crawler-results --prefix render/ --expire-days 7
```

- [ ] **Step 2: 校验无残留**

```bash
grep -n "Actions\|GITHUB_TOKEN\|js/trigger\|js/status" README.md
```

Expected: 仅剩「V1 历史方案」说明那一处提到 Actions，其余无输出。

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: README 更新为 V2 Browser Run 架构" -- README.md
```

---

## 风险与已知限制

| 风险 | 影响 | 缓解 |
|------|------|------|
| Browser Run 本地模拟与生产行为差异（并发、版本） | 本地通过但线上渲染失败 | Task 15 生产验收必须实跑 demo.realworld.io；失败页记入 failed_pages 不阻塞整任务 |
| Workflows step 返回值 >1MiB（链接极多的页面） | step 失败重试 | browser.ts 链接 `.slice(0, maxPages)` 截断；批大小 10 控制单步体积 |
| 单 step 子请求 ~1000 上限 | step 中途被掐 | RENDER_MAX_OBJECTS=850 预留余量，staging 计数含 R2 put |
| 渲染中目标站拉黑 CF IP / 反爬 | 页面超时、空壳 | 15s 超时 + salvage `page.content()`；failed_pages 透出给用户 |
| networkidle0 在长轮询/SSE 站点永不触发 | 每页都吃满 15s | 超时 catch 后仍 salvage DOM，任务能跑完只是慢；必要时调 RENDER_PAGE_TIMEOUT_MS |
| 暂存层残留（workflow 异常死亡，finalize 没跑） | R2 存储费 | render/ 前缀 7 天生命周期兜底过期 |
| 月预算熔断只在任务创建时检查，长任务可能冲破预算 | 当月超支 | 每批 step 前也查 checkBudget，超了标记 partial 提前打包 |
| D1 render_usage 单行热点（每批一次 UPDATE） | 写竞争 | 当前规模（顺序批、单任务并发低）无压力，不优化 |
| 匿名日配额按 IP，NAT 公网出口会互相挤占 | 用户体验 | 已知限制，登录功能（待办）解决 |
| zip 超大（接近 900MB）时浏览器内存下载压力 | 前端下载失败 | downloadUrl 直链 R2，不经前端内存拼装 |

---

## 计划完成后

按 superpowers 流程，使用 subagent-driven-development 或 executing-plans 逐任务执行本计划。
