# 爬虫技术选型指南

**最后更新**: 2026-04-01（补充 curl 升级工具链）

---

## 核心判断标准

**内容是否需要 JS 执行才能出现**

```
请求 URL → 服务器返回什么？
          │
          ├─ 直接返回完整 HTML（SSR/静态）→ curl/bash 足够
          │
          └─ 返回空壳 HTML + 靠 JS 渲染内容 → 需要 Playwright
```

---

## 三类网站对应三种方案

| 网站类型 | 特征 | 方案 |
|---------|------|------|
| **纯静态 / SSR** | curl 返回的 HTML 就是完整内容 | `curl` / `wget` |
| **SPA / 动态渲染** | curl 只得到 `<div id="app"></div>` | Playwright |
| **有反爬 / 登录态** | Cloudflare 5s盾、验证码、Cookie | Playwright + 浏览器指纹 |

---

## 工具对比

| | curl/bash | Playwright |
|---|---|---|
| 速度 | 极快（毫秒级）| 慢（秒级，需启动浏览器）|
| 资源消耗 | 极低 | 高（每实例 ~100MB 内存）|
| 稳定性 | 高 | 依赖 DOM/时序，易碎 |
| 并发 | 容易 | 需要池化管理 |
| 适用 | 静态文件、API、SSR | SPA、游戏资源、复杂交互 |

> **原则：能用 curl 就用 curl**

---

## 决策树（完整版）

```
目标数据在哪里？
│
├─ 静态文件 / SSR HTML / JSON API
│   └─ 有反爬吗？
│       ├─ 无 → curl ✅
│       ├─ UA/IP 检测 → curl + 伪装头 + 限速
│       └─ TLS指纹 / CF盾 → curl-impersonate 或 Playwright
│
├─ JS 动态渲染
│   └─ 数据有独立 API 接口吗？
│       ├─ 有（Network 面板可见 XHR/Fetch）→ 直接 curl 接口 ✅
│       └─ 无（JS eval/计算生成）→ Playwright
│
├─ 需要登录 / 交互操作
│   └─ Playwright（维护 Cookie/Session）
│
├─ WebSocket / 实时流数据
│   └─ ws 客户端库 或 Playwright 监听 ws:// 连接
│
└─ 内容在 Canvas / 图像里（图表、验证码）
    └─ Playwright 截图 + OCR（Tesseract / 视觉模型）
```

---

## curl 的升级工具链（静态网站专用）

### 为什么 `<ins>` 广告标签是空的？

curl 拿到的 HTML **已经是服务器能给的全部**，`<ins>` 空着是广告系统的架构决定，不是内容缺失：

```
服务器职责：返回 HTML 骨架 + <ins> 占位符
广告网络职责：浏览器端实时竞价（RTB）→ 动态填充 <ins>
```

广告内容无法服务端预填充，因为：
- 竞价在请求瞬间发生，服务器生成 HTML 时还未开始
- 用户定向数据（Cookie、画像）只在浏览器端
- 可见性追踪必须由浏览器 JS 执行

---

### wget — curl 的直接升级

专为下载设计，天生支持递归爬取，一行命令可镜像整站：

```bash
wget \
  --mirror \                     # 递归镜像整站
  --convert-links \              # 绝对链接转本地相对路径
  --adjust-extension \           # 自动补 .html 扩展名
  --page-requisites \            # 同时下载 CSS/JS/图片
  --no-parent \                  # 不爬上级目录
  --exclude-directories=/game \  # 排除目录（如游戏文件）
  --reject "*.zip,*.exe" \       # 排除文件类型
  --wait=0.5 \                   # 请求间隔 0.5s
  --limit-rate=500k \            # 限速
  https://example.com
```

等价于之前手写的 60 行 bash + curl 脚本。

---

### Scrapy — 工业级可配置爬虫（Python）

适合需要复杂规则、多站点、Pipeline 数据处理的场景：

```python
# settings.py — 全局配置
DOWNLOAD_DELAY = 0.5
CONCURRENT_REQUESTS = 4
DEPTH_LIMIT = 3
ROBOTSTXT_OBEY = False

# spider — 用 Rule 定义爬取规则
class GameSiteSpider(CrawlSpider):
    allowed_domains = ['example.com']
    rules = (
        Rule(
            LinkExtractor(deny=[r'/game/', r'\.zip$']),
            callback='parse_page',
            follow=True
        ),
    )
```

优势：内置去重、断点续爬、Middleware 拦截、Pipeline 后处理。

---

### 配置驱动的 Node.js 爬虫（推荐用于本项目）

每个目标站点一份配置，爬取逻辑完全复用：

```js
// crawl.config.js
export default {
  entry:   'https://hot5games.businessentity.us',
  output:  './games_hot5games',
  exclude: [/\/game\//, /\.zip$/, /\.exe$/],   // 排除规则（正则）
  include: [/\.webp$/, /\.json$/, /\.css$/, /\.js$/],
  depth:   2,       // 爬取深度
  delay:   300,     // ms，请求间隔
  headers: { 'User-Agent': 'Mozilla/5.0 ...' },
}
```

批量爬取时只需维护配置文件，不改爬虫代码。

---

### 工具选型建议

| 场景 | 推荐工具 |
|------|---------|
| 一次性镜像整站 | `wget --mirror` |
| 定制规则、单个文件类型 | `curl` + bash 脚本 |
| 批量多站点、规则复杂 | Scrapy |
| 项目内复用、JS 生态 | 自定义 Node.js + 配置文件 |
| 需要执行 JS 渲染 | Playwright（另一个层级） |

> **原则**：静态站点能用 `wget` 就用 `wget`，需要精细控制时再写脚本，不要过早引入 Playwright。

---

## 反爬对抗层详解

### 常见手段与对策

| 反爬手段 | 表现 | 对策 |
|---------|------|------|
| **Cloudflare 5s盾** | 返回 JS challenge 页面 | Playwright + stealth 插件 |
| **UA 检测** | 识别 `curl/8.x` 返回假数据 | 伪造 User-Agent |
| **IP 频率限制** | 短时间多次请求被封 | 代理池 / 请求限速 |
| **Cookie/Token 验证** | 无 Cookie 返回空内容 | 先登录获取 Session |
| **TLS 指纹识别** | curl 的握手特征被识别 | curl-impersonate |
| **动态签名 Token** | Authorization 头由 JS 运行时计算 | Playwright 拦截请求提取 |

### curl-impersonate

专门对抗 TLS 指纹检测，模拟 Chrome/Firefox 的完整 TLS 握手特征：

```bash
curl_chrome110 https://example.com   # 伪装成 Chrome 110
curl_ff109     https://example.com   # 伪装成 Firefox 109
```

---

## 特殊场景

### 数据在第三方请求里
```
页面 → 触发对 api.third-party.com 的请求 → 带动态 Authorization 头
```
- Token 由 JS 运行时计算签名，无法预先获取
- 用 Playwright 的 `page.route()` 拦截请求，提取 Token 后再 curl

### WebSocket / SSE 实时数据
- 价格行情、聊天记录、直播弹幕
- 数据从不出现在 HTTP 响应里
- Playwright 持久监听 `ws://` 连接，或直接用 ws 客户端库

### Canvas / WebGL 渲染内容
- 图表、地图、滑块验证码
- 内容不在 DOM 里，在像素里
- Playwright 截图 → OCR / 图像识别模型

---

## 难度排序

```
Canvas+OCR验证码
      > 动态签名 Token
            > TLS 指纹反爬
                  > 登录态维护
                        > JS 动态渲染
                              > 静态文件（最简单）
```

---

## 实战快速判断方法

```bash
# 第一步：curl 看返回
curl -s "https://target.com/page" | grep "关键词"

# 有内容 → 直接用 curl
# 没内容 → 第二步

# 第二步：打开 DevTools → Network → 过滤 XHR/Fetch
# 找到数据接口 → curl 那个接口
# 找不到 → 第三步：上 Playwright
```

---

## 本项目实例

| 爬取目标 | 技术选型 | 原因 |
|---------|---------|------|
| `hot5games` 门户页/图标 | **curl** | 全部静态文件，直接可取 |
| `mappsitenew.top` 游戏本体 | **Playwright** | Scirra Construct 运行时动态加载 `data.json`、字体、媒体资源，需浏览器执行并拦截网络请求 |

> 90% 的普通网站用此决策树可覆盖，剩余 10% 是专门做了对抗的平台（头部电商、票务、金融），需要更复杂的对抗手段。
