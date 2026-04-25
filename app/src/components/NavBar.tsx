import { Link } from '@tanstack/react-router'
import { useLang, Lang } from '../lib/i18n'
import { getToken, clearToken } from '../lib/auth'

export function NavBar() {
  const { lang, setLang, t } = useLang()
  const isLoggedIn = !!getToken()

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg text-blue-600">SiteCrawler</Link>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/crawl" className="text-gray-700 hover:text-blue-600">{t('nav_crawl')}</Link>
          {isLoggedIn && (
            <Link to="/history" className="text-gray-700 hover:text-blue-600">{t('nav_history')}</Link>
          )}
          {isLoggedIn ? (
            <button
              onClick={() => { clearToken(); window.location.href = '/' }}
              className="text-gray-500 hover:text-red-500"
            >{t('nav_logout')}</button>
          ) : (
            <>
              <Link to="/auth/login" className="text-gray-700 hover:text-blue-600">{t('nav_login')}</Link>
              <Link to="/auth/register" className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">{t('nav_register')}</Link>
            </>
          )}
          <select
            value={lang}
            onChange={e => setLang(e.target.value as Lang)}
            className="text-xs border border-gray-300 rounded px-1 py-0.5"
          >
            <option value="zh">中文</option>
            <option value="en">EN</option>
          </select>
        </div>
      </div>
    </nav>
  )
}
