'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'solid' | 'ghost';
};

export function GlassButton({ children, variant = 'solid', className = '', type = 'button', ...rest }: Props) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--wl-primary)]';
  const styles =
    variant === 'solid'
      ? 'bg-[color:color-mix(in_oklab,var(--wl-primary)_22%,#020617)] text-white shadow-[0_0_40px_-12px_var(--wl-primary)] hover:translate-y-[-1px] active:translate-y-0'
      : 'border border-white/10 bg-white/5 text-zinc-100 backdrop-blur-md hover:bg-white/10';
  return (
    <button type={type} className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}
