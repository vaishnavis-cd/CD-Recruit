/**
 * CD-Recruit / Proctora — Tier 1 Design Tokens
 * 
 * Canonical system-wide primitive tokens shared across all frontends (admin-web, candidate-web).
 * Defined per CD-Recruit Design System specification.
 */

export const brandTokens = {
  accent: {
    light: "#2F65F6",
    dark: "#5B7FFF",
    hover: "#1D4ED8",
    subtle: "#EFF6FF",
    border: "#BFDBFE",
    ink: "#1E40AF",
  },
  critical: {
    light: "#EF4444",
    dark: "#F87171",
    subtle: "#FEF2F2",
    border: "#FECACA",
    hover: "#DC2626",
  },
  warning: {
    light: "#B45309",
    dark: "#F59E0B",
    subtle: "#FFFBEB",
    border: "#FDE68A",
  },
  success: {
    light: "#15803D",
    dark: "#22C55E",
    subtle: "#ECFDF5",
    border: "#A7F3D0",
  },
  ink: {
    primary: "#0F172A",
    secondary: "#475569",
    muted: "#64748B",
    dim: "#94A3B8",
  },
} as const;

export const typographyTokens = {
  fonts: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  scale: {
    "2xs": { size: "10px", lineHeight: "14px" },
    "xs-plus": { size: "11px", lineHeight: "15px" },
    "xs": { size: "12px", lineHeight: "16px" },
    "sm-minus": { size: "13px", lineHeight: "18px" },
    "sm": { size: "14px", lineHeight: "20px" },
    "md": { size: "15px", lineHeight: "22px" },
    "base": { size: "16px", lineHeight: "24px" },
    "lg": { size: "18px", lineHeight: "28px" },
    "xl": { size: "20px", lineHeight: "28px" },
    "2xl": { size: "24px", lineHeight: "32px" },
    "3xl-plus": { size: "28px", lineHeight: "36px" },
    "3xl": { size: "30px", lineHeight: "36px" },
    "4xl": { size: "36px", lineHeight: "40px" },
  },
} as const;

export const radiusTokens = {
  xs: "4px",
  sm: "6px",
  md: "8px",
  lg: "10px",     // 10px — matches admin-web rounded-[10px] standard
  xl: "12px",    // 12px — matches card container standard
  "2xl": "16px",  // 16px — candidate-web feature/gate cards
  full: "9999px",
} as const;

export const motionTokens = {
  duration: {
    fast: "150ms",
    normal: "200ms",
    slow: "300ms",
    deliberate: "500ms",
  },
  easing: {
    standard: "cubic-bezier(0.16, 1, 0.3, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
} as const;
