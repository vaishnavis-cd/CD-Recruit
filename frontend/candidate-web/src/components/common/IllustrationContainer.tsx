import React, { useState } from 'react'

interface IllustrationContainerProps {
  src: string
  alt: string
  fallbackIcon: React.ComponentType<{ className?: string; size?: number }>
  className?: string
  aspectRatio?: string
  imgClassName?: string
}

export function IllustrationContainer({
  src,
  alt,
  fallbackIcon: FallbackIcon,
  className = '',
  aspectRatio = 'aspect-[16/9]',
  imgClassName = 'object-contain p-6',
}: IllustrationContainerProps) {
  const [hasError, setHasError] = useState(false)

  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-[var(--surface)] border border-[var(--border)] ${aspectRatio} ${className}`}>
      {!hasError ? (
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          className={`w-full h-full transition-opacity duration-300 ${imgClassName}`}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center select-none">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)]">
            <FallbackIcon size={32} />
          </div>
        </div>
      )}
    </div>
  )
}
