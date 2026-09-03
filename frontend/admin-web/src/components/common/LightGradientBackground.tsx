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
      className={`fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-[#f7f7f9] bg-cover bg-center bg-no-repeat bg-fixed ${className}`}
      style={{ backgroundImage: "url('/light-gradient-14.svg')" }}
      aria-hidden="true"
    />
  );
}
