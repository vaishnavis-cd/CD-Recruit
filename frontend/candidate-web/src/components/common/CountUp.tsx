import { useEffect, useRef } from 'react'
import { useInView, useMotionValue, useSpring } from 'framer-motion'

interface CountUpProps {
  to: number
  from?: number
  direction?: 'up' | 'down'
  delay?: number
  duration?: number
  className?: string
  startWhen?: boolean
  separator?: string
  decimals?: number
}

export function CountUp({
  to,
  from = 0,
  direction = 'up',
  delay = 0,
  duration = 2,
  className = '',
  startWhen = true,
  separator = '',
  decimals = 0,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(direction === 'down' ? to : from)

  const damping = 20 + 40 * (1 / duration)
  const stiffness = 100 * (1 / duration)

  const springValue = useSpring(motionValue, {
    damping,
    stiffness,
  })

  const isInView = useInView(ref, { once: true, margin: '0px' })

  useEffect(() => {
    if (ref.current) {
      ref.current.textContent = String(direction === 'down' ? to : from)
    }
  }, [from, to, direction])

  useEffect(() => {
    if (isInView && startWhen) {
      if (typeof delay === 'number' && delay > 0) {
        const timer = setTimeout(() => {
          motionValue.set(direction === 'down' ? from : to)
        }, delay * 1000)
        return () => clearTimeout(timer)
      }
      motionValue.set(direction === 'down' ? from : to)
    }
  }, [isInView, startWhen, motionValue, direction, from, to, delay])

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      if (ref.current) {
        const hasDecimals = decimals > 0
        const formatted = Intl.NumberFormat('en-US', {
          minimumFractionDigits: hasDecimals ? decimals : 0,
          maximumFractionDigits: hasDecimals ? decimals : 0,
        }).format(Number(latest.toFixed(decimals)))

        ref.current.textContent = separator
          ? formatted.replace(/,/g, separator)
          : formatted
      }
    })

    return () => unsubscribe()
  }, [springValue, decimals, separator])

  return <span className={className} ref={ref} />
}

export default CountUp
