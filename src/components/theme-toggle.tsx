"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { t } from "@/i18n";
import { THEME_COOKIE } from "@/lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const media = matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

function isDark() {
  const html = document.documentElement.classList;
  return html.contains("dark") || (!html.contains("light") && matchMedia(DARK_QUERY).matches);
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const label = dark ? t.app.themeLight : t.app.themeDark;
  return (
    <button
      type="button"
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(next);
        document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      }}
      className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl text-muted transition-colors hover:bg-sunken hover:text-ink"
      aria-label={label}
      title={label}
    >
      <Sun size={18} className="absolute transition-[transform,opacity] duration-300 dark:-translate-y-6 dark:opacity-0" aria-hidden />
      <Moon size={18} className="absolute translate-y-6 opacity-0 transition-[transform,opacity] duration-300 dark:translate-y-0 dark:opacity-100" aria-hidden />
    </button>
  );
}
