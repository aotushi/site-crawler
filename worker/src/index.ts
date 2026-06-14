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
