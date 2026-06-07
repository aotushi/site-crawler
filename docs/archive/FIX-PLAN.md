# site-crawler 修复计划

> 审计日期：2026-06-07
> 说明：每个问题包含【现状】【影响】【建议方案】，末尾留【用户意见】区供逐条决策。
> 决策选项：✅采纳 / ❌不修 / 🔁改用其他方案（在意见区注明）
>
> **操作授权（2026-06-07 用户确认）**：git 提交+推送 ✅ / Cloudflare 部署 ✅ / 改外部仓库 aotushi/site-crawler-actions ✅ / **远程 D1 变更 ❌（必须逐次停下征得同意）**

---

## 🔴 致命问题

### #1 击穿 Cloudflare Workers 子请求上限

- **位置**：`worker/src/crawl/engine.ts`（`MAX_FILES = 200`，每文件一次 `fetch`）
- **现状**：静态链路最多 200 次 `fetch`。Workers 免费版每请求仅 **50 个子请求**，付费版 1000。
- **影响**：免费部署下爬到第 50 个资源即抛错中断，静态爬虫基本不可用。
- **建议方案**：
  - A. 升级到 Workers 付费版（1000 子请求），并把 `MAX_FILES` 控制在安全区间（如 ≤300）。
  - B. 静态链路也改走 GitHub Actions（与 JS 链路统一），Worker 只做触发+缓存，绕开子请求限制。
  - C. 降低 `MAX_FILES` 到 ~45，仅做"首页+关键资源"轻量归档。
- **用户意见**：
  当前worker已经是付费版本
- **最终方案**：采纳 A。付费版 1000 子请求够用，`MAX_FILES` 放宽到 300，但**必须配合 #3 并发池**防止突发打满子请求/内存。
- **【已完成】**：`engine.ts` `MAX_FILES` 200→300，新增 `POOL_CONCURRENCY=6`，并发受工作池约束（详见 #3）。tsc 通过。

---

### #2 同源过滤导致离线包资源缺失

- **位置**：`worker/src/crawl/parser.ts:18,55`、`engine.ts:244`（`resolve`/`tryResolve` 过滤 `origin !== base.origin`）
- **现状**：跨域资源（CDN 子域、第三方图片/JS/字体）全部被丢弃。
- **影响**：真实站点产出的 ZIP 离线打开会样式/图片大面积缺失，违背"网站归档"核心卖点。
- **建议方案**：
  - A. 允许下载跨域**静态资源**（CSS/JS/图片/字体），但**页面链接**仍限同源（避免无限扩散）。
  - B. 维护白名单（同源 + 常见 CDN 域），用户可配置。
  - C. 保持现状，仅在文档中明确"只归档同源资源"的限制。
- **用户意见**：
  A方案采纳
- **最终方案**：A。允许下载跨域静态资源（CSS/JS/图片/字体/媒体），页面链接（`<a href>` 递归）仍限同源。
- **【已完成】**：`parser.ts` 拆分 `resolveLink`（同源，用于 `<a href>`）与 `resolveAsset`（允许跨域 http(s)，用于所有静态资源/srcset/懒加载属性）；`parseCssUrls` 改为按协议放行跨域。`engine.ts` `urlToZipPath` 增加 `startOrigin` 参数，跨域资源存入 `_external/<host>/` 防碰撞；重写阶段 `tryResolve` 去掉同源限制，跨域 URL 只要已下载即重写为本地相对路径。tsc 通过。

---

### #3 并发限额是软限制，会被击穿

- **位置**：`worker/src/crawl/engine.ts:112,143`（`Promise.allSettled(...map(downloadAsset))`）
- **现状**：所有并发任务在入口检查 `fileMap.size >= MAX_FILES`，但此刻无一完成，全部通过 → 实际下载远超上限。
- **影响**：文件数/字节数失控，叠加 #1 更易爆。
- **建议方案**：
  - A. 引入带并发上限的队列（如并发 5），逐个出队前检查限额，硬性截断。
  - B. 用计数信号量在 `downloadAsset` 入口原子占位（先 `visited.add` 并预占 size 名额）。
- **用户意见**：
  给出最佳实践,不限于以上两种选项, 并给出理由.
- **最终方案**：固定大小并发工作池（worker pool，并发 6）。共享队列 + 6 个消费协程循环取任务；取任务前检查 `fileMap.size < MAX_FILES && totalBytes < MAX_BYTES`，不满足即停；CSS 中新发现资源动态 push 进同一队列。
  - 理由：同时解决硬性限额（取前判断，不击穿）、并发上限（防子请求突发/内存峰值）、动态扩队（CSS 递归资源）。比信号量预占更易维护，避免"下载失败回滚名额"的复杂度。
- **【已完成】**：`engine.ts` 用统一 `Task`（page/asset）队列 + `enqueue`（按 url 去重）+ `runPool(6)` 工作池重写递归逻辑。`processTask` 取任务前 `limitReached()` 硬截断，字节超限丢弃该文件；CSS 内 `url()` 资源、页面 links/assets 动态 `enqueue`。进度 `queued` 改用 `enqueued.size`。tsc 通过。

---

## 🟠 高危问题

### #4 密码哈希不安全

- **位置**：`worker/src/auth/handlers.ts:16`（无盐 SHA-256）
- **现状**：单轮无盐 SHA-256，属快速哈希。
- **影响**：易被彩虹表/撞库破解，泄库后果严重。
- **建议方案**：
  - A. 改用 PBKDF2（`crypto.subtle.deriveBits`，Workers 原生支持），每用户随机盐 + 高迭代次数。
  - B. 引入 scrypt/bcrypt 库（需确认 Workers 运行时兼容）。
  - 注：已注册用户需迁移策略（如登录时检测旧格式并重哈希）。
- **用户意见**：
  采用最佳实践
- **最终方案**：PBKDF2-HMAC-SHA256（WebCrypto 原生），随机 16 字节盐，迭代 210000，存储格式 `pbkdf2$<iter>$<salt_b64>$<hash_b64>`。迁移：登录时检测到旧 64-hex 格式，验证通过后用新格式重哈希覆盖。
  - 理由：bcrypt/scrypt 在 Workers 上只能纯 JS 实现，慢且增大包体；PBKDF2 原生、有硬件加速、零依赖，是 Workers 环境最优解。

---

### #5 内存 / CPU 超限风险

- **位置**：`engine.ts`（全量数据驻留内存）+ `handler.ts:86-91`（zip 转 base64 经 SSE 传）
- **现状**：≤50MB 文件全驻内存 + `zipSync` 同步打包 + 整 zip 转 ~67MB base64 字符串。Workers 内存上限 128MB。
- **影响**：大站点 OOM 或超 CPU 时间；base64 走 SSE 传输浪费带宽。
- **建议方案**：
  - A. 静态链路 zip 也上传 R2，返回下载链接（与 JS 链路一致），不走 base64。
  - B. 下调 `MAX_BYTES`（如 20MB）并配合 #1 方案。
- **用户意见**：
  采用最佳实践, 给出理由
- **最终方案**：静态链路 zip 也上传 R2，返回下载链接（与 JS 链路统一），不再走 base64+SSE。复用 `crawl_cache`。
  - 理由：base64 膨胀 33% 且需在内存拼出 ~67MB 字符串，叠加原始数据+zip 共三份拷贝极易触顶 128MB；走 R2 后 Worker 仅短暂持有 zip，浏览器直连 R2 下载。
- **【已完成】**：`handler.ts` 爬完将 zip `put` 到 R2（key `crawls/static-<hash>.zip`，hash 用 `static:` 前缀与 JS 链路区分），写 `crawl_cache`，SSE `done` 改返回 `downloadUrl`；入口先查缓存命中即直接返回链接。前端 `crawl.tsx` 新增 `staticDownloadUrlRef`，`done` 优先读 `downloadUrl`（保留 base64 向后兼容），`downloadZip` 优先用 R2 链接。顺带把 handler 内 `writer.write/close` 改为 await（关联 #10 背压）。tsc 通过（worker+app）。

---

### #6 JS 链路 runId 竞态

- **位置**：`worker/src/crawl/github.ts:30-51`（`findRunId` 仅按时间戳匹配）
- **现状**：按 `created_at >= afterMs - 5000` 匹配最近的 `repository_dispatch` run。
- **影响**：多用户/并发触发时会拿到他人的 run，返回错误产物。
- **建议方案**：
  - A. dispatch `client_payload` 带唯一 `jobId`（如 UUID），Actions 把它写进 run name / artifact 名，回查时精确匹配。
  - B. 用 D1 记录 dispatch 时间窗 + url 双重校验缩小误判（弱化方案）。
- **用户意见**：
  采用最佳实践, 给出理由
- **最终方案**：A。dispatch `client_payload` 带 UUID `job_id`；Actions workflow 设 `run-name: crawl-${{ github.event.client_payload.job_id }}`；Worker 查 runs 时按 name 精确匹配。**需同步改 Actions 仓库 workflow**。
  - 理由：时间窗匹配是启发式，无法根治竞态；按唯一 id 关联是 GitHub 官方推荐做法。

---

## 🟡 中等问题

### #7 fetch handler 缺少 ctx

- **位置**：`worker/src/index.ts:17`（`async fetch(request, env)`，无 `ctx`）
- **现状**：无法 `waitUntil`，靠 SSE 流未关闭维持后台任务。
- **影响**：客户端断开即终止，DB 状态更新可能丢失。
- **建议方案**：补全 `ctx: ExecutionContext`，关键收尾（DB 更新、R2 写入）用 `ctx.waitUntil` 包裹。
- **用户意见**：
  用户没有理解问题, 请详细解释
- **详细解释**：Workers 在 `fetch` handler **返回 Response 后默认终止该请求所有未完成的异步任务**。当前后台爬取 IIFE 未 await，靠"返回的 streaming Response 流未关闭、运行时为推流保持 Worker 存活"搭便车续命。风险：① 客户端断开 → 流取消 → Worker 可能被回收 → 最后的 `updateCrawlRecord('done')` 来不及执行，记录卡在 `running`；② `handleJsStatus` 的 R2.put/缓存写入目前在响应前 await 暂安全，但模式脆弱。
- **最终方案**：fetch 签名补 `ctx: ExecutionContext`，必须完成的收尾（DB 更新、R2 写入）用 `ctx.waitUntil()` 包裹，与客户端连接解耦。

---

### #8 ZIP 路径碰撞

- **位置**：`worker/src/crawl/engine.ts:32-46`（`urlToZipPath`）
- **现状**：忽略 query string；`/a` 与 `/a/` 都映射到 `a/index.html`，`buildZip` 以 path 为 key 后者覆盖前者。
- **影响**：`fileCount` 与实际不符，内容丢失。
- **建议方案**：路径冲突时追加去重后缀（如 hash 或序号），或把 query 纳入路径。
- **用户意见**：
  按最佳实践处理, 给出理由
- **最终方案**：维护已用 path 的 Set；生成 path 时若冲突，在扩展名前追加来自完整 URL（含 query）的短 hash。
  - 理由：链接重写的 `urlToPath` 本就按 URL 为 key，只要 path 唯一即可正确重写；不把整个 query 拼进路径——避免非法字符/过长/跨平台文件名问题。

---

### #9 核心逻辑无测试

- **位置**：`worker/package.json`（test 脚本为 `echo Error && exit 1`）
- **现状**：爬取/链接重写/zip 逻辑零覆盖。
- **建议方案**：为 `parser`/`engine`(urlToZipPath/relPath)/`zipper` 补单元测试（vitest）。
- **用户意见**：
  按最佳实践处理
- **最终方案**：用 vitest 为纯函数补单测——`parser`(parseAssets/parseCssUrls)、`engine`(urlToZipPath/relPath/path 去重)、`zipper`(buildZip)。worker `package.json` 加 `test` 脚本。

---

## 🔵 次要 / 配置

### #10 杂项

- **`wrangler.toml:3`** `compatibility_date = "2024-01-01"` 过旧 → 更新到近期日期。
- **`github.ts:4`** 硬编码外部仓库 `aotushi/site-crawler-actions` → 移到配置/env。
- **`handler.ts:73`** `writer.write()` 未 await → 背压下理论乱序（影响小）。
- **CORS** 仅允许单一 `FRONTEND_ORIGIN` → 视需要支持多 origin。
- **`.worktrees/homepage-stitch/`** 完整副本占空间（已在 .gitignore）→ 可清理。
- **用户意见**：
  采用. 解释背压, cors多origin的理由.
- **最终方案**：全部采用。compatibility_date 更新到近期；外部仓库名移到 env；`writer.write()` 改为 await；CORS 改为允许列表按 Origin 回显。
- **背压解释**（纠正之前"乱序"措辞）：`writer.write()` 返回的 Promise 表示下游缓冲区就绪。不 await 顺序其实仍有保证（单写者），真正问题是：① 下游消费慢时数据在内存堆积；② write **reject**（如客户端已断）会变成 unhandledrejection 被吞掉、无法走 `catch` 收尾。await 既让背压又能捕获错误。
- **CORS 多 origin 理由**：现仅放行 `https://crawler.9shi.cc`，本地 `localhost:5173`、Pages 预览域 `*.pages.dev` 会被拦；最佳实践是维护允许列表按请求 `Origin` 回显匹配项——带 `Authorization` 时不能用 `*`。

---

## 修复优先级建议

1. #2 同源过滤（决定产物是否可用）
2. #1 + #3 + #5（子请求/限额/内存，建议合并为一次架构调整）
3. #4 密码哈希
4. #6 runId 竞态
5. #7 / #8 / #9 / #10

> 请在每条【用户意见】填写决策后，我再据此进入具体实现。
