interface LoadingSpinnerProps {
  /** Size in pixels. Defaults to 24. */
  size?: number;
  /** Accessible label for screen readers. */
  label?: string;
}

/**
 * Minimal CSS-only spinner.
 * Used in button loading states and the full-page resume loader.
 */
export function LoadingSpinner({
  size = 24,
  label = "Loading…",
}: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: "3px solid rgba(0,0,0,0.15)",
        borderTopColor: "currentColor",
        borderRadius: "50%",
        animation: "cd-spin 0.7s linear infinite",
      }}
    >
      <style>{`@keyframes cd-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
