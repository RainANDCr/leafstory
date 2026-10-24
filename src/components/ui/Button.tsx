import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-bark text-paper hover:bg-bark-deep active:bg-bark-deep',
  secondary: 'bg-leaf-gold-soft/60 text-bark-deep hover:bg-leaf-gold-soft',
  ghost: 'bg-transparent text-bark-soft hover:bg-paper-edge/60 hover:text-bark',
}

/** 基础按钮：统一的圆角、焦点环与禁用态 */
export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    />
  )
}
