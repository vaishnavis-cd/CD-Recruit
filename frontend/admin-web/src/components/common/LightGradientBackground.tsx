import React from "react";

/**
 * LightGradientBackground
 *
 * Implements the Figma "Light Gradient 13" ambient mesh background with exact
 * vector coordinates, blur filters, matrix transformations, and opacities.
 */
export function LightGradientBackground({ className = "" }: { className?: string }) {
  return (
    <div
      className={`fixed inset-0 pointer-events-none z-0 overflow-hidden select-none bg-white ${className}`}
      style={{
        transform: "translate3d(0, 0, 0)",
        contain: "strict",
      }}
      aria-hidden="true"
    >
      <img
        src="/admin-gradient-bg.svg"
        alt=""
        className="w-full h-full object-cover pointer-events-none select-none"
        draggable={false}
      />
    </div>
  );
}

export const AdminGradientBackground = LightGradientBackground;
