import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Theme } from './tokens'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('cd-recruit-theme') as Theme | null
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.classList.toggle('dark', stored === 'dark')
      return stored
    }
    return 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('cd-recruit-theme', theme)
  }, [theme])

  const toggle = () => {
    const nextTheme: Theme = theme === 'light' ? 'dark' : 'light'

    // Instant theme change: disable all transitions temporarily so everything flips spot-on together
    const css = document.createElement('style')
    css.appendChild(
      document.createTextNode(
        `*, *::before, *::after {
          -webkit-transition: none !important;
          -moz-transition: none !important;
          -o-transition: none !important;
          -ms-transition: none !important;
          transition: none !important;
        }`
      )
    )
    document.head.appendChild(css)

    // Synchronously toggle class on html tag
    document.documentElement.classList.toggle('dark', nextTheme === 'dark')
    localStorage.setItem('cd-recruit-theme', nextTheme)
    setTheme(nextTheme)

    // Force browser style recalculation
    window.getComputedStyle(document.documentElement).opacity

    // Clean up temporary style override
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (document.head.contains(css)) {
          document.head.removeChild(css)
        }
      })
    })
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
