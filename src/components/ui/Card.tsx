import type { HTMLAttributes } from 'react'

/** 纸感卡片：圆角、细边、柔和阴影 */
export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={`rounded-card border border-paper-edge bg-card p-4 shadow-soft sm:p-5 ${className}`}
      {...rest}
    />
  )
}
