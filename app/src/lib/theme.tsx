import { createContext, useContext, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'

interface ThemeContextValue {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

const STORAGE_KEY = 'sitecrawler_theme'

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
})

export function useThemeProvider() {
  const [theme, setThemeState] = useState<ThemeMode>('light')

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') {
      setThemeState(saved)
    }
  }, [])

  function setTheme(nextTheme: ThemeMode) {
    setThemeState(nextTheme)
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
  }

  function toggleTheme() {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return { theme, setTheme, toggleTheme }
}

export function useTheme() {
  return useContext(ThemeContext)
}
