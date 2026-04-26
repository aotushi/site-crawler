import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { LangContext, useLangProvider } from '../lib/i18n'
import { NavBar } from '../components/NavBar'
import { Footer } from '../components/Footer'

function RootLayout() {
  const langCtx = useLangProvider()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isHome = pathname === '/'

  return (
    <LangContext.Provider value={langCtx}>
      <div className="min-h-screen flex flex-col">
        {!isHome && <NavBar />}
        <main className="flex-1">
          <Outlet />
        </main>
        {!isHome && <Footer />}
      </div>
    </LangContext.Provider>
  )
}

export const Route = createRootRoute({ component: RootLayout })
