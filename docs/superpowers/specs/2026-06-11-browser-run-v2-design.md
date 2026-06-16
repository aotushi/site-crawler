# SiteCrawler V2:Browser Run 渲染爬取 — 设计文档

**日期**:2026-06-11
**状态**:已与用户逐节确认
**前置**:V1 已部署(crawler.9shi.cc),静态爬取 + GitHub Actions JS 爬取双轨

---

## 1. 背景与目标

V1 静态爬取用 Worker `fetch()` 抓页面,不执行 JS,SPA/动态站只能拿到空壳;「JS 完整爬取」走 GitHub Actions + Playwright,但数据中心 IP 被 WAF 拦截、冷启动慢,体验割裂。

V2 目标:用 Cloudflare **Browser Run**(原 Browser Rendering)在 CF 网络内渲染动态页,配合 **Workflows** 异步编排,实现任意规模站点的**完整 copy**(所有可发现路由渲染入 ZIP),全程不离开 Cloudflare。

## 2. 范围

**做**:
- 渲染管线:Browser Run 渲染动态页 + network 截获静态资源
- Workflows 异步全站编排(单实例、顺序批渲染)
- 流式打包(解除 128MB 内存对 ZIP 体积的限制)
- 入口自动分流(静态站走 V1 管线零改动)
- 全局月度硬熔断 + 限额参数 env 化
- GHA「JS 完整爬取」路线退役

**不做**(Backlog):
- 登录/注册完善(用户待办,主线完成后处理;本次登录相关代码零改动)
- 多浏览器并行提速
- XHR/JSON 录制与离线回放
- 剥离 JS 的纯快照选项

## 3. 决策记录(2026-06-11 与用户确认)

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | V2 范围 | 仅 Browser Run 渲染能力,注册/配额另开 |
| 2 | 截获深度 | 渲染后 DOM + network 截获静态资源;XHR JSON 不存 |
| 3 | 流程形态 | 单流程自动混合(入口判定分流),GHA 退役 |
| 4 | 任务架构 | Workflows 异步全站 |
| 5 | 编排方案 | 方案 A:单实例顺序批渲染(1 并发浏览器) |
| 6 | 额度策略 | **硬熔断**,不接受超额计费;月预算 9h |
| 7 | 验收标准 | SPA **完整 copy**(全部可发现路由入 ZIP) |
| 8 | script 处理 | **保留 JS**(完整镜像取向,接受离线交互风险) |
| 9 | 限额 | 单页超时保留 15s;页面上限 500/次、字节软上限 **900MB**,全部 env 可调;匿名渲染 1 次/天 |
| 10 | 操作授权 | 用户预授权本项目内增删改查(含远程 D1),先本地验证、执行前知会 |

平台事实(官方文档,2026-06 查证):Workers Paid 含 Browser Run 10 小时/月 + 10 并发浏览器,超出 $0.09/h;Workflows step 非流式返回值上限 **1 MiB**,单实例默认 10,000 步。

## 4. 总体架构

```
POST /crawler/api/crawl(SSE,接口不变)
  ├─ 静态配额检查(ip_usage,匿名 3 次/天,不变)
  ├─ fetch 入口页 → isJsRendered() 站点级判定
  ├─ 静态站 → V1 同步 SSE 管线(零改动)
  └─ JS 站  → 渲染缓存命中?→ 直接返回下载链接
       ├─ 渲染配额(匿名 1 次/天)+ 月度熔断检查
       ├─ 通过 → 创建 Workflow 实例
       │         SSE 推 {type:'render_task', taskId} 后关流 → 前端转轮询
       └─ 超限 → 降级静态管线 + SSE 提示

Workflow: RenderCrawlWorkflow(site-crawler-render)
  step discover      sitemap(复用)+ 入口页渲染提取内链 → 页面队列
  step render×N      每步 1 个浏览器会话渲染一批(10 页/批):
                     渲染后 DOM 序列化 → R2 暂存;response 截获资源 → R2 暂存;
                     新内链返回 run() 续入队列(小元数据,<1MiB)
                     [每步开始前检查月度熔断,超限停渲转打包,状态 partial]
  step assets×M      parser 扫渲染后 HTML + CSS url() 追链,
                     截获漏掉的资源普通 fetch 分批补抓 → R2 暂存
  step zip           列举暂存区 → 共享 rewrite 函数重写链接 → 流式打包
                     (fflate 流式 → R2 multipart)→ crawls/render-{urlHash}.zip
  step finalize      D1 状态 done、写 crawl_cache;登录用户补 crawl_history;清暂存
```

**硬约束**:Workflows step 返回值 ≤1 MiB(非流式),因此**所有产物每步直写 R2**,step 间只传 URL 清单等小元数据;页面队列在 `run()` 内由 step 返回值重建,天然兼容 Workflows 重放恢复。

**R2 暂存布局**:`render/{taskId}/raw/{sha16(url)}`,每个对象带 customMetadata `{url, contentType}` ——zip 步骤仅靠列举暂存区即可自洽重建 url→zipPath 映射,不依赖内存状态。

## 5. 数据模型(migration 004)

```sql
CREATE TABLE IF NOT EXISTS render_tasks (
  id TEXT PRIMARY KEY,           -- Workflow instance id
  url TEXT NOT NULL,
  status TEXT NOT NULL,          -- queued|running|done|partial|failed
  phase TEXT,                    -- discovering|rendering|assets|zipping
  pages_total INTEGER DEFAULT 0,
  pages_done INTEGER DEFAULT 0,
  bytes INTEGER DEFAULT 0,
  r2_key TEXT,
  error TEXT,
  failed_pages TEXT,             -- JSON 数组,渲染失败页清单
  ip TEXT,
  user_id TEXT,                  -- 可空,匿名任务无
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS render_usage (
  month TEXT PRIMARY KEY,        -- 'YYYY-MM'
  browser_seconds INTEGER NOT NULL DEFAULT 0
);
```

- `ip_usage.crawl_type` 新增取值 `'render'`(原 `'js'` 成为遗留数据,不迁移)。
- 渲染结果缓存沿用 `crawl_cache`,键为 `sha16('render:' + url)`,与静态 `'static:'` 前缀并列。
- `crawl_history`:仅登录用户在 finalize 时写入(`crawl_type='render'`),与 V1 行为一致;`gh_run_id` 列保留不再使用。

## 6. API

| 路由(/crawler 前缀规则照旧) | 变更 |
|------|------|
| `POST /api/crawl` | 不变;新增 SSE 事件 `render_task: {taskId}`、`notice: {reason}`(降级提示) |
| `GET /api/crawl/render/:taskId`(新) | 轮询:`{status, phase, pagesDone, pagesTotal, bytes, downloadUrl?, error?, failedPages?}` |
| `POST /api/crawl/js/trigger`、`GET /api/crawl/js/status/:runId` | **退役删除** |

## 7. 渲染与截获

- 驱动:`@cloudflare/puppeteer`(官方 binding 库;若实施时官方推荐 `@cloudflare/playwright` 则等价替换,封装在 `render/browser.ts` 内不外泄)。
- 每批次 `step.do` 内:`puppeteer.launch(env.BROWSER)` 开 1 个会话 → 逐页 `page.goto(url, {waitUntil:'networkidle0', timeout:RENDER_PAGE_TIMEOUT_MS})` → 序列化 `document` 渲染后 HTML → 关页;批次结束关会话并计量时长。
- `page.on('response')`:同源 + `_external` 跨域静态资源(content-type 或扩展名命中 STATIC_EXTENSIONS 语义)写入暂存;HTML 主文档以序列化 DOM 为准(不存原始响应);XHR/JSON 跳过。
- **保留 `<script>`**:序列化 DOM 不剥离脚本,JS 文件照常入包。
- 页面发现:sitemap(复用 `collectSitemapUrls`)+ 渲染后 DOM 内链 BFS,去重后入队,直至 `RENDER_MAX_PAGES`。
- 已知限制(写入 README):hash 路由(`#/`)SPA 所有路由同一 pathname,只能存为单页;离线打开时 JS 重新启动,hydration 失败或接口 404 属「保留 JS」固有代价。

## 8. 流式打包

`zipper.ts` 现为 `zipSync` 内存打包(V1 静态管线保留不动)。渲染管线新增流式实现:fflate `Zip` 流式输出 → 聚为 ≥5MB 分片 → R2 multipart upload。内存占用恒定在数十 MB,900MB 软上限不再受 128MB 内存约束。重写阶段逐文件流过共享 `rewriteHtml`/`rewriteCss`(url→zipPath 映射来自暂存区列举)。

## 9. 额度与熔断(硬熔断)

- 计量:每渲染批次记录会话「开启→关闭」秒数,累加 `render_usage.browser_seconds`(月键 upsert)。
- 检查点:**任务创建时** + **每个渲染批次 step 开始前**。
- 行为:创建时超限 → 拒绝渲染降级静态 + SSE notice;爬取中超限 → 停止新批次,已渲染部分照常走 assets/zip,状态 `partial`。
- 参数(wrangler.toml [vars],均可调):

| env | 默认 | 说明 |
|-----|------|------|
| `RENDER_MONTHLY_BUDGET_S` | `32400`(9h) | 月度熔断阈值,留 1h 计费口径缓冲 |
| `RENDER_MAX_PAGES` | `500` | 单次渲染页数上限(防单站吃光月额度) |
| `RENDER_MAX_BYTES` | `943718400`(900MB) | 渲染管线字节软上限 |
| `RENDER_PAGE_TIMEOUT_MS` | `15000` | 单页渲染超时(技术必需,防挂死烧额度) |
| `RENDER_BATCH_SIZE` | `10` | 每批渲染页数 |
| `RENDER_DAILY_LIMIT_ANON` | `1` | 匿名渲染爬取次数/天 |

## 10. 错误处理

- 单页超时/崩溃:跳过,记入 `failed_pages`,任务不失败。
- 批次 step 失败:Workflows 自动重试(指数退避 ×3);暂存对象幂等(同 key 覆盖),重试不重复计量已完成页。
- 浏览器启动失败:由 step 重试覆盖;连续失败 → 任务 `failed` + error。
- 整体失败:`status=failed`,暂存区 finalize/fail 时显式删除,R2 lifecycle 规则(前缀 `render/`,7 天)兜底。
- 前端轮询遇 `failed`:错误提示 + 重试引导;`partial`:正常下载 + 提示未渲染完整原因。

## 11. 前端改动(app/)

| 文件 | 改动 |
|------|------|
| `src/lib/api.ts` | 处理 `render_task`/`notice` SSE 事件;新增 render 状态轮询函数 |
| `src/lib/crawl-state.ts` | 状态机增加 render 任务态(taskId、phase、轮询生命周期) |
| `src/components/CrawlProgress.tsx` | 阶段化进度(发现/渲染 x/y/补抓/打包)+ partial/降级提示 |
| `src/routes/crawl.tsx` | 移除 GHA「JS 完整爬取」触发 UI |
| `src/lib/i18n.ts` | 新增 zh/en 文案 |

## 12. GHA 退役

删除 `worker/src/crawl/js-handler.ts`、`worker/src/crawl/github.ts` 及 `index.ts` 对应路由;`Env` 移除 `GITHUB_TOKEN` 并删生产 secret;前端移除触发 UI;`aotushi/site-crawler-actions` 仓库归档(用户操作或经授权用 gh 执行)。代码留 git 历史。

## 13. 配置变更(worker/wrangler.toml)

- 新增 `[browser] binding = "BROWSER"`;`[[workflows]]` name `site-crawler-render`、binding `RENDER_WORKFLOW`、class_name `RenderCrawlWorkflow`(dev 环境同步)。
- `compatibility_date` 升至近期(实施时按 wrangler 4.85 支持范围定);`nodejs_compat` 按官方模板需要时开启。
- `[vars]` 增第 9 节参数表。

## 14. 测试与验收

**单元**(worker 新增 vitest,纯函数为主):
- 从 `engine.ts` 提出的共享模块(`urlToZipPath`/`relPath`/`rewriteHtml`/`rewriteCss`)
- 熔断计数与检查逻辑、流式打包分片逻辑(mock R2)

**本地集成**:`wrangler dev`(Workflows + browser binding 本地用本机 Chromium)爬本地 SPA demo,验证全链路。

**部署后验收**:
1. SPA 完整 copy:默认候选 `https://demo.realworld.io`(Conduit React SPA,用户可换):全部可发现路由入 ZIP、动态内容在 HTML 内、离线首屏正确。
2. 中型动态站 `https://www.dripulse.com`:页面覆盖 ≥ V1,渲染注入内容可见。
3. 静态站回归:走 V1 管线,行为不变。
4. 熔断演练:临时调小 `RENDER_MONTHLY_BUDGET_S`,验证拒绝/降级/partial 三条路径。

## 15. 部署序列(操作已预授权,远程执行前知会)

1. 本地 D1 迁移验证 → 远程迁移(migration 004)
2. R2 lifecycle 规则(`render/` 前缀 7 天过期)
3. worker 部署(新 bindings)
4. 前端构建部署(Pages)
5. GHA 退役清理(secret 删除、仓库归档)
6. README 更新(V2 状态、已知限制、本节参数表)

## 16. 已知限制

- 保留 JS:离线交互可能失败(hydration/接口 404),不视为 bug。
- hash 路由 SPA 仅能存单页。
- XHR/JSON 数据不入包。
- 渲染页质量依赖 `networkidle0` 时机,无限轮询页面以超时兜底。
- Browser Run 免费档(10 分钟/天)无法支撑本设计,账户须为 Workers Paid。
