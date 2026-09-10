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

/**
 * Temporarily disables all CSS transitions across the entire DOM during theme switches.
 * Prevents the jarring, staggered visual glitch where elements with `transition-colors`
 * or `transition-all` slowly morph over 150-300ms while elements without transitions snap in 0ms.
 */
function applyThemeWithoutTransitionLag(theme: Theme) {
  const css = document.createElement('style')
  css.setAttribute('type', 'text/css')
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

  document.documentElement.classList.toggle('dark', theme === 'dark')

  // Force synchronous DOM reflow so browser applies all theme styles immediately
  void document.body.offsetHeight

  // Re-enable transitions after the browser has completed painting the new theme
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (css.parentNode) {
        css.parentNode.removeChild(css)
      }
    })
  })
}

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
    applyThemeWithoutTransitionLag(theme)
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
