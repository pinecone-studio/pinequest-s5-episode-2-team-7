import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-gradient text-white ring-1 ring-white/20 shadow-[0_6px_16px_rgb(139_92_246/0.5)] hover:brightness-110 disabled:opacity-40 disabled:shadow-none",
  secondary: "bg-field text-ink ring-1 ring-line hover:bg-white/10 disabled:text-subtle",
  ghost: "text-muted hover:bg-field hover:text-ink disabled:text-subtle",
  danger: "bg-alert text-white hover:brightness-110 disabled:opacity-50",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-[filter,background-color,color,transform] active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-3xl", className)} {...props} />;
}

type Tone = "slate" | "brand" | "amber" | "rose" | "emerald" | "sky";
const TONES: Record<Tone, string> = {
  slate: "bg-sunken text-muted",
  brand: "bg-accent-soft text-accent",
  amber: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  rose: "bg-alert-soft text-alert",
  emerald: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  sky: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
};

export function Badge({ tone = "slate", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>{children}</span>;
}

export const inputClass =
  "w-full rounded-2xl border border-line bg-field px-4 py-2 text-sm text-ink placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:opacity-60";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, "h-11", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "resize-y", props.className)} />;
}

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
      {children}
      {hint && <span className="ml-1 font-normal text-subtle">{hint}</span>}
    </label>
  );
}

export function Alert({ tone = "rose", title, children }: { tone?: "rose" | "amber" | "sky" | "emerald"; title?: string; children: ReactNode }) {
  const tones = {
    rose: "border-alert/25 bg-alert-soft text-alert",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    sky: "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200",
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  };
  return (
    <div role={tone === "rose" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="prose-mn">{children}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
