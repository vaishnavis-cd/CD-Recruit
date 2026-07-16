import { useTheme } from "@/hooks/useTheme";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg bg-surface text-text-primary border border-border-token hover:bg-opacity-80 transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? (
        <Moon className="w-5 h-5 text-text-secondary hover:text-text-primary" />
      ) : (
        <Sun className="w-5 h-5 text-text-secondary hover:text-text-primary" />
      )}
    </button>
  );
}
