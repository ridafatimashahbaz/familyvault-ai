import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

/**
 * One button shape used everywhere, so a primary action looks the same on the
 * upload page as it does in settings. `asChild`-style duplication is avoided by
 * exporting the class helper for the places that need a <Link>.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap " +
  "transition-colors disabled:pointer-events-none disabled:opacity-55 select-none";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900",
  secondary:
    "border border-ink-200 bg-surface text-ink-800 hover:bg-ink-50 hover:border-ink-300 active:bg-ink-100",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200",
  danger: "bg-danger text-white hover:bg-danger/90 active:bg-danger/80",
  subtle: "bg-brand-50 text-accent hover:bg-brand-100 active:bg-brand-200",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(BASE, VARIANTS[variant], SIZES[size], extra);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

type LinkButtonProps = {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
};

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  prefetch,
}: LinkButtonProps) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} prefetch={prefetch}>
      {icon}
      {children}
    </Link>
  );
}

/** Square icon-only button; the label is required for screen readers. */
export function IconButton({
  label,
  className,
  children,
  variant = "ghost",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: Variant }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg transition-colors disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
