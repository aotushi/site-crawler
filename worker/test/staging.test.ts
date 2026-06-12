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
