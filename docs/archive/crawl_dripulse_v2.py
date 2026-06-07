#!/usr/bin/env python3
"""改进版爬虫 - 支持断点续爬 + 文件存在检查
v4 修复:
  - url_to_path: 无扩展名页面存为 path/index.html，兼容所有静态服务器
  - 视频文件改用 urllib 流式写入磁盘，绕过 Playwright 的内存缓冲限制
  - response 拦截器跳过视频，避免拦截 Range 请求拿到的部分内容
  - 滚动触发懒加载图片
  - HTML 解析提取遗漏媒体 URL 并补充下载
"""
import asyncio, json, re, urllib.parse, urllib.request, time
from pathlib import Path
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from datetime import datetime

# BASE_URL = "https://www.dripulse.com"
BASE_URL = "https://okspin.tech/subSuccess.html"
OUTPUT_DIR = Path(".temp/crawl_okspin/okspin_mirror")
STATE_FILE = Path(".temp/crawl_okspin/state.json")
RESULT_FILE = Path(".temp/crawl_okspin/result.json")

# 并发配置
NUM_BROWSERS = 5
PAGES_PER_BROWSER = 2
MAX_RETRIES = 3
RETRYABLE_ERRORS = {"TIMEOUT", "NetworkError", "TimeoutError"}

# 静态资源扩展名（不追加 .html）
STATIC_EXTENSIONS = (
    '.html', '.htm',
    '.css', '.js', '.json', '.map',
    '.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.avif',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.mp4', '.webm', '.ogg', '.m3u8', '.ts',
    '.pdf', '.zip',
)

# 视频扩展名 - 使用流式下载，不经过 response 拦截器
VIDEO_EXTENSIONS = ('.mp4', '.webm', '.ogg')

def is_video_url(url):
    path = urllib.parse.urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in VIDEO_EXTENSIONS)

def sanitize_path(path):
    for char in '<>:"|?*':
        path = path.replace(char, '_')
    return path

def url_to_path(url):
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.lstrip('/')
    if parsed.query:
        qs = urllib.parse.parse_qs(parsed.query)
        for k in sorted(qs.keys()):
            path = path.rstrip('/') + f"_{k}_{qs[k][0]}"
            break
    if not path or path.endswith('/'):
        # 根路径或目录路径
        path = (path or '') + 'index.html'
    elif any(path.lower().endswith(ext) for ext in STATIC_EXTENSIONS):
        # 静态资源保持原扩展名不变
        pass
    else:
        # 无扩展名的 HTML 页面（如 /blog/report）→ blog/report/index.html
        # 兼容所有静态服务器的 clean URL 路由
        path = path.rstrip('/') + '/index.html'
    return sanitize_path(path)

def extract_links(html, base_url):
    links = set()
    try:
        soup = BeautifulSoup(html, 'html.parser')
        for a in soup.find_all('a', href=True):
            href = a['href'].strip()
            if href:
                abs_url = urljoin(base_url, href).split('#')[0]
                if abs_url.startswith(BASE_URL) and not any(re.search(p, abs_url) for p in [r'\.pdf$', r'\.zip$', r'javascript:', r'mailto:']):
                    links.add(abs_url)
    except:
        pass
    return links

def extract_media_urls(html, base_url):
    """从 HTML 提取图片和视频 URL（含懒加载属性），仅返回站内资源"""
    urls = set()
    try:
        soup = BeautifulSoup(html, 'html.parser')
        for img in soup.find_all('img'):
            for attr in ('src', 'data-src', 'data-lazy', 'data-original', 'data-url'):
                val = img.get(attr, '').strip()
                if val and not val.startswith('data:'):
                    urls.add(urljoin(base_url, val))
        for video in soup.find_all('video'):
            for attr in ('src', 'poster'):
                val = video.get(attr, '').strip()
                if val:
                    urls.add(urljoin(base_url, val))
            for source in video.find_all('source'):
                val = source.get('src', '').strip()
                if val:
                    urls.add(urljoin(base_url, val))
        for source in soup.find_all('source'):
            for attr in ('src', 'srcset'):
                val = source.get(attr, '').strip()
                if val:
                    for part in val.split(','):
                        candidate = part.strip().split()[0]
                        if candidate:
                            urls.add(urljoin(base_url, candidate))
    except:
        pass
    return {u for u in urls if u.startswith(BASE_URL)}

def _stream_download_sync(url, dest_path):
    """同步流式下载（在 executor 线程中运行），返回下载字节数"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': BASE_URL + '/',
    }
    req = urllib.request.Request(url, headers=headers)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    with urllib.request.urlopen(req, timeout=120) as resp:
        with open(dest_path, 'wb') as f:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)
                size += len(chunk)
    return size

async def stream_download_video(url, dest_path):
    """异步流式下载视频，返回下载字节数（0 表示失败）"""
    try:
        loop = asyncio.get_event_loop()
        size = await loop.run_in_executor(None, _stream_download_sync, url, dest_path)
        return size
    except Exception as e:
        log_message(f"  视频下载失败 {url}: {str(e)[:60]}")
        if dest_path.exists():
            dest_path.unlink()
        return 0

def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"visited": [], "failed": {}, "downloaded_files": [], "retry_count": {}}

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2))

def log_message(msg):
    timestamp = time.strftime("%H:%M:%S")
    print(f"[{timestamp}] {msg}", flush=True)

class CrawlStats:
    def __init__(self):
        self.start_time = datetime.now()
        self.success = []
        self.failed = []
        self.retried = []
        self.total_files = 0
        self.total_size = 0

    def add_success(self, url, files_saved):
        self.success.append({"url": url, "files_saved": files_saved})

    def add_failed(self, url, reason, retries):
        self.failed.append({"url": url, "reason": reason, "retries": retries})

    def add_retried(self, url, retry_count):
        self.retried.append({"url": url, "retry_count": retry_count})

    def save_result(self):
        elapsed = (datetime.now() - self.start_time).total_seconds()
        result = {
            "start_time": self.start_time.isoformat(),
            "end_time": datetime.now().isoformat(),
            "elapsed_seconds": round(elapsed, 2),
            "summary": {
                "total_urls": len(self.success) + len(self.failed),
                "success": len(self.success),
                "failed": len(self.failed),
                "retried": len(self.retried),
                "total_files": self.total_files,
                "total_size_mb": round(self.total_size / 1024 / 1024, 2)
            },
            "success_urls": self.success,
            "failed_urls": self.failed,
            "retried_urls": self.retried
        }
        RESULT_FILE.parent.mkdir(parents=True, exist_ok=True)
        RESULT_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(f"\n结果已保存: {RESULT_FILE}", flush=True)

async def scroll_page(page):
    """逐步滚动页面以触发懒加载图片"""
    try:
        await page.evaluate("""
            async () => {
                const delay = ms => new Promise(r => setTimeout(r, ms));
                const total = Math.max(document.body.scrollHeight, 2000);
                const step = 600;
                for (let pos = 0; pos < total; pos += step) {
                    window.scrollTo(0, pos);
                    await delay(150);
                }
                window.scrollTo(0, 0);
            }
        """)
        await asyncio.sleep(1)
    except:
        pass

async def trigger_video_load(page):
    """触发 video 元素加载，使浏览器发出完整资源请求"""
    try:
        await page.evaluate("""
            () => {
                document.querySelectorAll('video').forEach(v => {
                    v.preload = 'auto';
                    v.load();
                });
            }
        """)
        await asyncio.sleep(1)
    except:
        pass

async def fetch_missing_media(page, media_urls, resources):
    """对 response 拦截器未捕获的非视频媒体，用 page.request 补充下载"""
    for url in media_urls:
        if is_video_url(url):
            continue  # 视频由 stream_download_video 单独处理
        rel_path = url_to_path(url)
        if rel_path in resources:
            continue
        file_path = OUTPUT_DIR / rel_path
        if file_path.exists():
            continue
        try:
            resp = await page.request.get(url, timeout=20000)
            if resp.ok:
                content = await resp.body()
                resources[rel_path] = content
        except:
            pass

async def download_page(page, url):
    resources = {}
    pre_saved = {}  # 已直接写入磁盘的文件 {rel_path: size}，不再经 worker 写入
    html_content = None

    async def handle_response(response):
        resp_url = response.url
        if not resp_url.startswith(BASE_URL):
            return
        # 视频文件跳过，Range 请求只有部分内容，由流式下载处理
        if is_video_url(resp_url):
            return
        try:
            content = await response.body()
            rel_path = url_to_path(resp_url)
            resources[rel_path] = content
        except:
            pass

    page.on("response", handle_response)
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        await asyncio.sleep(0.5)
        try:
            await page.wait_for_load_state("networkidle", timeout=15000)
        except:
            pass

        # 滚动触发懒加载图片
        await scroll_page(page)

        # 触发视频元素加载（让浏览器发出 video src 请求，但我们跳过 response 拦截）
        await trigger_video_load(page)

        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except:
            pass

        await asyncio.sleep(1)
        html_content = await page.content()

        # 从 HTML 提取所有媒体 URL
        media_urls = extract_media_urls(html_content, url)

        # 非视频媒体：补充下载
        if media_urls:
            await fetch_missing_media(page, media_urls, resources)

        # 视频：流式写入磁盘
        for media_url in media_urls:
            if not is_video_url(media_url):
                continue
            rel_path = url_to_path(media_url)
            file_path = OUTPUT_DIR / rel_path
            if file_path.exists():
                continue
            log_message(f"  下载视频: {media_url}")
            size = await stream_download_video(media_url, file_path)
            if size > 0:
                pre_saved[rel_path] = size
                log_message(f"  视频完成: {rel_path} ({size // 1024 // 1024}MB)")

        return resources, pre_saved, html_content, "SUCCESS", None
    except asyncio.TimeoutError:
        return resources, pre_saved, html_content, "TIMEOUT", "Timeout"
    except Exception as e:
        return resources, pre_saved, html_content, type(e).__name__, str(e)[:50]
    finally:
        page.remove_listener("response", handle_response)

async def worker(page, url, visited, failed, to_visit, url_queue, lock, downloaded_files, retry_count, stats):
    log_message(f"爬取: {url}")

    try:
        resources, pre_saved, html_content, status, error = await download_page(page, url)

        saved_count = 0
        skipped_count = 0

        # 处理流式下载的视频（已在磁盘，只更新统计）
        for rel_path, size in pre_saved.items():
            saved_count += 1
            stats.total_size += size
            async with lock:
                if rel_path not in downloaded_files:
                    downloaded_files.append(rel_path)
                    stats.total_files += 1

        # 处理 response 拦截器捕获的资源
        for rel_path, content in resources.items():
            file_path = OUTPUT_DIR / rel_path

            if file_path.exists():
                skipped_count += 1
                continue

            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(content)
            saved_count += 1
            stats.total_size += len(content)

            async with lock:
                if rel_path not in downloaded_files:
                    downloaded_files.append(rel_path)
                    stats.total_files += 1

        if status == "SUCCESS":
            log_message(f"  ✓ {url} 保存: {saved_count}, 跳过: {skipped_count}")
            stats.add_success(url, saved_count)

            if html_content:
                new_links = extract_links(html_content, url)
                async with lock:
                    for link in new_links:
                        if link not in visited and link not in to_visit:
                            to_visit.add(link)
                            await url_queue.put(link)

            async with lock:
                visited.add(url)
                failed.pop(url, None)
                retry_count.pop(url, None)
        else:
            async with lock:
                current_retry = retry_count.get(url, 0)

                if status in RETRYABLE_ERRORS and current_retry < MAX_RETRIES:
                    log_message(f"  ⟳ {status}，重试 {current_retry + 1}/{MAX_RETRIES}")
                    stats.add_retried(url, current_retry + 1)
                    retry_count[url] = current_retry + 1
                    await url_queue.put(url)
                else:
                    log_message(f"  ✗ {status}: {error}")
                    stats.add_failed(url, status, current_retry)
                    failed[url] = f"{status} (重试 {current_retry}/{MAX_RETRIES})"
    except Exception as e:
        async with lock:
            current_retry = retry_count.get(url, 0)
            error_type = type(e).__name__

            if error_type in RETRYABLE_ERRORS and current_retry < MAX_RETRIES:
                log_message(f"  ⟳ {error_type}，重试 {current_retry + 1}/{MAX_RETRIES}")
                stats.add_retried(url, current_retry + 1)
                retry_count[url] = current_retry + 1
                await url_queue.put(url)
            else:
                log_message(f"  ✗ {error_type}: {str(e)[:50]}")
                stats.add_failed(url, error_type, current_retry)
                failed[url] = f"{error_type} (重试 {current_retry}/{MAX_RETRIES})"

async def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    state = load_state()
    visited = set(state["visited"])
    failed = dict(state["failed"])
    downloaded_files = state.get("downloaded_files", [])
    retry_count = dict(state.get("retry_count", {}))
    stats = CrawlStats()

    work_in_progress = 0

    to_visit = {BASE_URL + "/"} - visited

    log_message(f"\n爬虫启动 - {BASE_URL}")
    log_message(f"已访问: {len(visited)}, 待访问: {len(to_visit)}, 已下载文件: {len(downloaded_files)}")
    log_message(f"并发: {NUM_BROWSERS} 浏览器 × {PAGES_PER_BROWSER} 标签页 = {NUM_BROWSERS * PAGES_PER_BROWSER} 并发\n")

    url_queue = asyncio.Queue()
    for url in to_visit:
        await url_queue.put(url)

    lock = asyncio.Lock()

    async with async_playwright() as p:
        browsers = []
        all_pages = []
        for _ in range(NUM_BROWSERS):
            browser = await p.chromium.launch(headless=True)
            browsers.append(browser)
            for _ in range(PAGES_PER_BROWSER):
                page = await browser.new_page()
                all_pages.append(page)

        async def page_task(page):
            nonlocal work_in_progress
            while True:
                try:
                    url = await asyncio.wait_for(url_queue.get(), timeout=3)
                except asyncio.TimeoutError:
                    if work_in_progress == 0 and url_queue.empty():
                        break
                    continue

                work_in_progress += 1
                try:
                    await worker(page, url, visited, failed, to_visit, url_queue, lock, downloaded_files, retry_count, stats)
                finally:
                    work_in_progress -= 1

        try:
            await asyncio.gather(*[page_task(page) for page in all_pages])
        except (KeyboardInterrupt, asyncio.CancelledError):
            log_message("\n收到中断信号，正在保存状态...")
        finally:
            for browser in browsers:
                try:
                    await browser.close()
                except:
                    pass

    save_state({"visited": sorted(visited), "failed": failed, "downloaded_files": downloaded_files, "retry_count": retry_count})
    stats.save_result()
    log_message(f"完成! 访问: {len(visited)}, 失败: {len(failed)}, 文件: {len(downloaded_files)}")

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
