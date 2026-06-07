import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useRouterState } from '@tanstack/react-router'
import { MaterialIcon } from './home/MaterialIcon'
import { useLang, type Lang } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { getToken, clearToken } from '../lib/auth'

export function SiteHeader() {
  const { lang, setLang, t } = useLang()
  const { theme, toggleTheme } = useTheme()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isLoggedIn = !!getToken()
  const isHome = pathname === '/'
  const isMarketing = pathname === '/' || pathname === '/landing' || pathname === '/crawl'
  const [showComingSoon, setShowComingSoon] = useState(false)

  const headerClass = isMarketing
    ? 'fixed top-0 w-full z-50 border-b border-[var(--sc-border)] bg-[var(--sc-card)]/88 text-[var(--sc-text)] backdrop-blur-md font-sans antialiased'
    : 'sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm'
  const innerClass = isMarketing
    ? 'max-w-[1200px] mx-auto flex items-center justify-between px-6 h-16'
    : 'max-w-5xl mx-auto px-4 h-14 flex items-center justify-between'
  const navLinkClass = isMarketing
    ? 'text-[var(--sc-muted)] hover:text-[var(--sc-accent)] transition-colors'
    : 'text-gray-700 hover:text-blue-600'
  const activeHomeLinkClass = isMarketing
    ? 'border-b-2 border-[var(--sc-accent)] pb-1 font-semibold text-[var(--sc-accent)]'
    : 'text-primary font-semibold border-b-2 border-primary pb-1'

  return (
    <header className={headerClass}>
      <div className={innerClass}>
        <Link to="/" className={isMarketing ? 'flex items-center gap-2 text-lg font-semibold text-[var(--sc-strong)]' : 'flex items-center gap-2 font-bold text-lg text-blue-600'}>
          <MaterialIcon name="cloud_download" className={isMarketing ? 'text-[var(--sc-accent)]' : 'text-primary'} />
          <span className={isMarketing ? 'text-xl tracking-normal text-[var(--sc-strong)]' : ''}>SiteCrawler</span>
        </Link>

        <div className={isMarketing ? 'hidden md:flex items-center gap-8 text-sm' : 'flex items-center gap-4 text-sm'}>
          <Link to="/" className={pathname === '/' ? activeHomeLinkClass : navLinkClass}>
            {t('home_nav_home')}
          </Link>
          {isHome && (
            <>
              <a className={navLinkClass} href="#benefits">{t('home_nav_features')}</a>
              <a className={navLinkClass} href="#pricing">{t('home_nav_pricing')}</a>
            </>
          )}
          <Link
            to="/landing"
            className={pathname === '/landing' ? activeHomeLinkClass : navLinkClass}
          >
            {t('nav_landing')}
          </Link>
          <Link to="/crawl" className={pathname === '/crawl' ? (isMarketing ? 'font-semibold text-[var(--sc-accent)]' : 'text-primary font-semibold') : navLinkClass}>
            {t('nav_crawl')}
          </Link>
          {isLoggedIn && (
            <Link to="/history" className={pathname === '/history' ? (isMarketing ? 'font-semibold text-[var(--sc-accent)]' : 'text-primary font-semibold') : navLinkClass}>
              {t('nav_history')}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            aria-label="Language"
            className={isMarketing
              ? 'cursor-pointer rounded-md border border-[var(--sc-border)] bg-[var(--sc-card)] px-2 py-1 text-xs text-[var(--sc-muted)]'
              : 'text-xs border border-gray-300 rounded px-1 py-0.5'}
          >
            <option value="zh">中文</option>
            <option value="en">EN</option>
          </select>
          {isMarketing && (
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? '切换到黑色系' : '切换到白色系'}
              className="grid size-9 place-items-center rounded-md border border-[var(--sc-border)] bg-[var(--sc-card)] text-[var(--sc-muted)] transition-colors hover:text-[var(--sc-accent)]"
              title={theme === 'light' ? '黑色系' : '白色系'}
            >
              <MaterialIcon name={theme === 'light' ? 'dark_mode' : 'light_mode'} className="text-[20px]" />
            </button>
          )}
          {isLoggedIn ? (
            <button
              onClick={() => { clearToken(); window.location.href = '/' }}
              className={isHome
                ? 'text-sm text-slate-600 hover:text-red-500 transition-colors'
                : 'text-gray-500 hover:text-red-500'}
            >
              {t('nav_logout')}
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowComingSoon(true)}
                className={isMarketing
                  ? 'text-sm text-[var(--sc-muted)] transition-colors hover:text-[var(--sc-accent)]'
                  : 'text-gray-700 hover:text-blue-600'}
              >
                {t('nav_login')}
              </button>
              <button
                onClick={() => setShowComingSoon(true)}
                className={isMarketing
                  ? 'rounded-md bg-[var(--sc-accent)] px-4 py-2 text-sm font-semibold text-[var(--sc-on-accent)] transition-all hover:opacity-90 active:scale-[0.98]'
                  : 'bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700'}
              >
                {t('nav_register')}
              </button>
            </>
          )}
        </div>
      </div>

      {showComingSoon && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
          onClick={() => setShowComingSoon(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg px-8 py-6 max-w-xs w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <MaterialIcon name="construction" className="block text-3xl text-blue-600 mb-2" />
            <p className="font-semibold text-gray-800 mb-1">{t('coming_soon_title')}</p>
            <p className="text-sm text-gray-500 mb-4">{t('coming_soon_desc')}</p>
            <button
              onClick={() => setShowComingSoon(false)}
              className="bg-blue-600 text-white px-5 py-1.5 rounded-lg text-sm hover:bg-blue-700"
            >
              {t('coming_soon_ok')}
            </button>
          </div>
        </div>,
        document.body
      )}
    </header>
  )
}
