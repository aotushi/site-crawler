export interface Env {
  DB: D1Database
  JWT_SECRET: string
  FRONTEND_ORIGIN: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.FRONTEND_ORIGIN

    // CORS preflight
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

    // Placeholder routing — expanded in later tasks
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  },
}
