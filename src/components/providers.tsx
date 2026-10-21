"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import Link from "next/link";
import { t } from "@/i18n";
import { cn } from "./ui";

type ToastTone = "error" | "success" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; href: string };
}

const ToastContext = createContext<(toast: Omit<Toast, "id">) => void>(() => {});

/** Show a toast: `toast({ message, tone: "error", action: { label, href } })`. */
export function useToast() {
  return useContext(ToastContext);
}

/**
 * App-wide client providers: motion honours the OS "reduce motion" setting
 * (transforms are dropped, opacity fades remain) and toasts.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = ++next.current;
      setToasts((list) => [...list.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.action ? 9000 : 6000);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);

  return (
    <MotionConfig reducedMotion="user">
      <ToastContext.Provider value={value}>
        {children}
        <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
          <AnimatePresence initial={false}>
            {toasts.map((toast) => (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                role={toast.tone === "error" ? "alert" : "status"}
                className="glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 text-sm"
              >
                <ToastIcon tone={toast.tone} />
                <div className="min-w-0 flex-1">
                  <p className="prose-mn text-ink">{toast.message}</p>
                  {toast.action && (
                    <Link href={toast.action.href} className="mt-1.5 inline-block font-semibold text-accent hover:underline">
                      {toast.action.label} →
                    </Link>
                  )}
                </div>
                <button type="button" onClick={() => dismiss(toast.id)} className="-m-1 rounded-lg p-1 text-subtle hover:text-ink" aria-label={t.errors.dismiss}>
                  <X size={16} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ToastContext.Provider>
    </MotionConfig>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  const Icon = tone === "error" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return <Icon size={18} className={cn("mt-0.5 shrink-0", tone === "error" ? "text-alert" : tone === "success" ? "text-ok" : "text-accent")} aria-hidden />;
}
