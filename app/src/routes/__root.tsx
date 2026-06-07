import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { LangContext, useLangProvider } from '../lib/i18n'
import { ThemeContext, useThemeProvider } from '../lib/theme'
import { SiteHeader } from '../components/SiteHeader'
import { Footer } from '../components/Footer'

function RootLayout() {
  const langCtx = useLangProvider()
  const themeCtx = useThemeProvider()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isHome = pathname === '/'

  useEffect(() => {
    document.title = `SiteCrawler - ${langCtx.t('site_subtitle')}`
  }, [langCtx.lang])

  return (
    <LangContext.Provider value={langCtx}>
      <ThemeContext.Provider value={themeCtx}>
        <div className={`site-theme-${themeCtx.theme} flex min-h-screen flex-col bg-[var(--sc-bg)] text-[var(--sc-text)]`}>
          <SiteHeader />
          <main className="flex-1">
            <Outlet />
          </main>
          {!isHome && <Footer />}
        </div>
      </ThemeContext.Provider>
    </LangContext.Provider>
  )
}

export const Route = createRootRoute({ component: RootLayout })
