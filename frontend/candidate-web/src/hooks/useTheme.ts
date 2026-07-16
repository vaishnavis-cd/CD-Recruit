import { useEffect } from "react";
import { useThemeStore } from "@/store/theme.store";

export function useTheme() {
  const { theme, toggleTheme, initializeTheme } = useThemeStore();

  useEffect(() => {
    initializeTheme();

    // Listen to system preference changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      // Only react to system preference if the user hasn't explicitly set a preference
      if (!localStorage.getItem("cd-recruit:theme")) {
        initializeTheme();
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [initializeTheme]);

  return {
    theme,
    isDark: theme === "dark",
    toggleTheme,
  };
}
