import { createRootRoute, Outlet } from '@tanstack/react-router'
import { LangContext, useLangProvider } from '../lib/i18n'
import { NavBar } from '../components/NavBar'
import { Footer } from '../components/Footer'

function RootLayout() {
  const langCtx = useLangProvider()
  return (
    <LangContext.Provider value={langCtx}>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </LangContext.Provider>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
