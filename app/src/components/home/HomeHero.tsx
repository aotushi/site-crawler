import { FormEvent, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MaterialIcon } from './MaterialIcon'

export function HomeHero() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid')
      setError('')
      navigate({ to: '/crawl', search: { url } })
    } catch {
      setError('Please enter a valid URL starting with http:// or https://')
    }
  }

  return (
    <section className="relative overflow-hidden py-24 px-6">
      <div className="absolute inset-0 hero-pattern -z-10" />
      <div className="max-w-[1200px] mx-auto text-center">
        <span className="inline-block py-1 px-3 bg-surface-container-high text-primary rounded-full text-xs font-semibold mb-6">v2.0 NOW LIVE</span>
        <h1 className="text-5xl font-extrabold text-on-background mb-6 max-w-3xl mx-auto leading-tight">One-Click Static Website Downloader</h1>
        <p className="text-lg text-secondary max-w-2xl mx-auto mb-10">
          Archive any website in seconds. Our high-performance crawler packages all assets—HTML, CSS, JS, and images—into a perfectly structured ZIP file.
        </p>

        <form onSubmit={onSubmit} className="max-w-xl mx-auto bg-surface-container-lowest p-2 rounded-xl shadow-lg border border-outline-variant flex flex-col md:flex-row gap-2">
          <div className="flex-grow flex items-center px-4 bg-white rounded-lg border border-slate-100">
            <MaterialIcon name="link" className="text-outline" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full border-none focus:ring-0 text-base bg-transparent h-12 outline-none"
              placeholder="https://example.com"
              type="text"
            />
          </div>
          <button type="submit" className="bg-primary text-on-primary px-8 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-95">
            Start Crawling
            <MaterialIcon name="rocket_launch" />
          </button>
        </form>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

        <div className="mt-6 flex items-center justify-center gap-6 text-xs text-secondary">
          <div className="flex items-center gap-1"><MaterialIcon name="check_circle" className="text-primary text-[18px]" /> No install</div>
          <div className="flex items-center gap-1"><MaterialIcon name="check_circle" className="text-primary text-[18px]" /> ZIP format</div>
          <div className="flex items-center gap-1"><MaterialIcon name="check_circle" className="text-primary text-[18px]" /> Edge-powered</div>
        </div>
      </div>
    </section>
  )
}
