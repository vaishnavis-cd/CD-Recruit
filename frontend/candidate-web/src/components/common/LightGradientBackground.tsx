import React from 'react'
import lightGradientPng from '../../assets/light-gradient-14.png'

/**
 * LightGradientBackground
 *
 * Implements the Figma "Light Gradient 14" ambient mesh background
 * with high-fidelity vector glows and soft blur filters.
 */
export function LightGradientBackground({ className = '' }: { className?: string }) {
  return (
    <div
      className={`fixed inset-0 pointer-events-none -z-10 overflow-hidden select-none ${className}`}
      aria-hidden="true"
    >
      <img
        src={lightGradientPng}
        alt=""
        className="w-full h-full object-cover object-center opacity-90"
      />
    </div>
  )
}
