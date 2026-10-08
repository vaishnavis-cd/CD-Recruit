import React from 'react';

/**
 * LightGradientBackground
 *
 * Implements the Proctora Figma "Light Gradient 13" ambient mesh background
 * with exact vector blur filters, matching the tenant admin dashboard.
 */
export function LightGradientBackground({ className = '' }: { className?: string }) {
  return (
    <div
      className={`fixed inset-0 pointer-events-none z-0 overflow-hidden select-none bg-[#f7f7f9] ${className}`}
      style={{
        transform: 'translate3d(0, 0, 0)',
        contain: 'strict',
      }}
      aria-hidden="true"
    >
      <img
        src="/admin-gradient-bg.svg"
        alt=""
        className="w-full h-full object-cover pointer-events-none select-none opacity-90"
        draggable={false}
      />
    </div>
  );
}

export const AdminGradientBackground = LightGradientBackground;
