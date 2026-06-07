// worker/src/crawl/github.ts
// GitHub API helpers for triggering and polling Actions runs

const REPO = 'aotushi/site-crawler-actions'
const API = 'https://api.github.com'

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'site-crawler-worker/1.0',
  }
}

export async function triggerDispatch(token: string, url: string): Promise<void> {
  const res = await fetch(`${API}/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({ event_type: 'crawl', client_payload: { url } }),
  })
  if (res.status !== 204) {
    const text = await res.text()
    throw new Error(`GitHub dispatch failed: ${res.status} ${text}`)
  }
}

// 触发后轮询 runs 列表，找 created_at >= afterMs - 5000 的 run
export async function findRunId(
  token: string,
  afterMs: number,
  maxAttempts = 6,
  delayMs = 2000,
): Promise<number | null> {
  const headers = ghHeaders(token)
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, delayMs))
    const res = await fetch(
      `${API}/repos/${REPO}/actions/runs?event=repository_dispatch&per_page=5`,
      { headers },
    )
    if (!res.ok) continue
    const data = await res.json() as { workflow_runs: Array<{ id: number; created_at: string }> }
    const run = data.workflow_runs.find(
      r => new Date(r.created_at).getTime() >= afterMs - 5000,
    )
    if (run) return run.id
  }
  return null
}

export async function getRunStatus(
  token: string,
  runId: number,
): Promise<{ status: string; conclusion: string | null }> {
  const res = await fetch(`${API}/repos/${REPO}/actions/runs/${runId}`, {
    headers: ghHeaders(token),
  })
  if (!res.ok) throw new Error(`GitHub run status failed: ${res.status}`)
  const data = await res.json() as { status: string; conclusion: string | null }
  return { status: data.status, conclusion: data.conclusion }
}

// GitHub artifact download 返回 302 到签名 S3 URL
// 必须用 redirect: 'manual' 捕获 Location，再不带 auth 头 fetch 签名 URL
export async function downloadArtifactZip(
  token: string,
  runId: number,
): Promise<Uint8Array | null> {
  const headers = ghHeaders(token)

  const listRes = await fetch(
    `${API}/repos/${REPO}/actions/runs/${runId}/artifacts`,
    { headers },
  )
  if (!listRes.ok) return null
  const listData = await listRes.json() as { artifacts: Array<{ id: number; name: string }> }
  const artifact = listData.artifacts.find(a => a.name === 'crawl-result')
  if (!artifact) return null

  const dlRes = await fetch(
    `${API}/repos/${REPO}/actions/artifacts/${artifact.id}/zip`,
    { headers, redirect: 'manual' },
  )
  if (dlRes.status !== 302) return null
  const signedUrl = dlRes.headers.get('location')
  if (!signedUrl) return null

  const zipRes = await fetch(signedUrl) // 签名 URL 自带认证，不需要 auth header
  if (!zipRes.ok) return null
  const buf = await zipRes.arrayBuffer()
  return new Uint8Array(buf)
}

// 获取 run 的第一个 job_id（crawl workflow 只有一个 job）
export async function getRunJobId(token: string, runId: number): Promise<number | null> {
  const res = await fetch(`${API}/repos/${REPO}/actions/runs/${runId}/jobs`, {
    headers: ghHeaders(token),
  })
  if (!res.ok) return null
  const data = await res.json() as { jobs: Array<{ id: number }> }
  return data.jobs[0]?.id ?? null
}

// 拉取 job 日志文本，解析最后一条 [PROGRESS] 行
export async function getJobProgress(
  token: string,
  jobId: number,
): Promise<{ phase: string; downloaded: number; total: number } | null> {
  const res = await fetch(`${API}/repos/${REPO}/actions/jobs/${jobId}/logs`, {
    headers: ghHeaders(token),
    redirect: 'follow',
  })
  if (!res.ok) return null
  const text = await res.text()

  let last: { phase: string; downloaded: number; total: number } | null = null
  for (const line of text.split('\n')) {
    const m = line.match(/\[PROGRESS\]\s+phase=(\S+)\s+downloaded=(\d+)\s+total=(\d+)/)
    if (m) last = { phase: m[1], downloaded: Number(m[2]), total: Number(m[3]) }
  }
  return last
}
