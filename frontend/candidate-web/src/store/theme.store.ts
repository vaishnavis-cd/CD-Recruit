import { create } from "zustand";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  initializeTheme: () => void;
}

const LOCAL_STORAGE_KEY = "cd-recruit:theme";

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "light",
  setTheme: (theme: Theme) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, theme);
    set({ theme });
    // Apply class to HTML tag
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  },
  toggleTheme: () => {
    const nextTheme = get().theme === "light" ? "dark" : "light";
    get().setTheme(nextTheme);
  },
  initializeTheme: () => {
    const savedTheme = localStorage.getItem(LOCAL_STORAGE_KEY) as Theme | null;
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = savedTheme || (systemPrefersDark ? "dark" : "light");
    
    if (resolvedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    
    set({ theme: resolvedTheme });
  }
}));
