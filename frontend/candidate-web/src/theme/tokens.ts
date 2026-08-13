// Design tokens matching the exact spec values
export const lightTokens = {
  bg: '#FFFFFF',
  surface: '#F5F6F8',
  border: '#E4E6EB',
  textPrimary: '#111318',
  textSecondary: '#6B7280',
  accent: '#2F5CFF',
  warning: '#F59E0B',
  critical: '#E5484D',
  success: '#12B76A',
} as const

export const darkTokens = {
  bg: '#0F1115',
  surface: '#1A1D24',
  border: '#2A2E37',
  textPrimary: '#F2F3F5',
  textSecondary: '#9CA3AF',
  accent: '#5B7FFF',
  warning: '#FBBF24',
  critical: '#F0555B',
  success: '#3ECF8E',
} as const

export type Theme = 'light' | 'dark'
export type TokenKey = keyof typeof lightTokens

export function getTokens(theme: Theme) {
  return theme === 'dark' ? darkTokens : lightTokens
}
