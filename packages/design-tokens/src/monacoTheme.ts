export interface MonacoThemeRule {
  token: string;
  foreground?: string;
  background?: string;
  fontStyle?: string;
}

export interface MonacoThemeData {
  base: "vs" | "vs-dark" | "hc-black" | "hc-light";
  inherit: boolean;
  rules: MonacoThemeRule[];
  colors: Record<string, string>;
  encodedTokensColors?: string[];
}

/**
 * CD-Recruit / Proctora — Canonical Monaco Editor Themes
 * Single source of truth for both candidate-web and admin-web.
 */

export const cdRecruitLightTheme: MonacoThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    { token: "", foreground: "111318", background: "FFFFFF" },
    { token: "comment", foreground: "6B7280", fontStyle: "italic" },
    { token: "keyword", foreground: "2F5CFF", fontStyle: "bold" },
    { token: "string", foreground: "12B76A" },
    { token: "number", foreground: "E5484D" },
    { token: "type", foreground: "F59E0B" },
    { token: "function", foreground: "15308F", fontStyle: "bold" },
    { token: "variable", foreground: "111318" },
    { token: "operator", foreground: "5B5B64" },
    { token: "delimiter", foreground: "5B5B64" },
    { token: "identifier", foreground: "111318" },
    { token: "constant", foreground: "E5484D" },
  ],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#111318",
    "editor.lineHighlightBackground": "#F7F7F9",
    "editor.selectionBackground": "#EAF0FF",
    "editorLineNumber.foreground": "#8B8B93",
    "editorLineNumber.activeForeground": "#0B0B0D",
    "editorCursor.foreground": "#2F5CFF",
    "editor.inactiveSelectionBackground": "#EAF0FF88",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#E6E6EA",
    "editorSuggestWidget.background": "#FFFFFF",
    "editorSuggestWidget.border": "#E6E6EA",
    "editorSuggestWidget.selectedBackground": "#EAF0FF",
  },
};

export const cdRecruitDarkTheme: MonacoThemeData = {
  base: "vs-dark",
  inherit: false,
  rules: [
    { token: "", foreground: "F2F3F5", background: "1A1D24" },
    { token: "comment", foreground: "9CA3AF", fontStyle: "italic" },
    { token: "keyword", foreground: "5B7FFF", fontStyle: "bold" },
    { token: "string", foreground: "3ECF8E" },
    { token: "number", foreground: "F0555B" },
    { token: "type", foreground: "FBBF24" },
    { token: "function", foreground: "F2F3F5", fontStyle: "bold" },
    { token: "variable", foreground: "F2F3F5" },
    { token: "operator", foreground: "9CA3AF" },
    { token: "delimiter", foreground: "9CA3AF" },
    { token: "identifier", foreground: "F2F3F5" },
    { token: "constant", foreground: "F0555B" },
  ],
  colors: {
    "editor.background": "#1A1D24",
    "editor.foreground": "#F2F3F5",
    "editor.lineHighlightBackground": "#2A2E3755",
    "editor.selectionBackground": "#5B7FFF33",
    "editorLineNumber.foreground": "#9CA3AF",
    "editorLineNumber.activeForeground": "#F2F3F5",
    "editorCursor.foreground": "#5B7FFF",
    "editor.inactiveSelectionBackground": "#5B7FFF22",
    "editorWidget.background": "#1A1D24",
    "editorWidget.border": "#2A2E37",
    "editorSuggestWidget.background": "#1A1D24",
    "editorSuggestWidget.border": "#2A2E37",
    "editorSuggestWidget.selectedBackground": "#2A2E37",
  },
};
