"use client";

import { BarChart3, ClipboardList, House, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ComponentType } from "react";
import { LogoutButton } from "./logout-button";
import { Orb } from "./orb";
import { useTeamAlerts } from "./team/use-team-alerts";
import { buttonClass, cn } from "./ui";

interface Item {
  href: string;
  title: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }> | null;
}

/** The app's five sections; the AI дасгалжуулагч is the orb in the middle. */
const ITEMS: Item[] = [
  { href: "/", title: "Нүүр", icon: House },
  { href: "/soril", title: "Сорил", icon: ClipboardList },
  { href: "/coach", title: "Дасгалжуулагч", icon: null },
  { href: "/team", title: "Баг", icon: Users },
  { href: "/feedback", title: "Дүгнэлт", icon: BarChart3 },
];

/** Sections reached from a tab count as that tab (the app opens cases from the coach, articles from «Нүүр»). */
const PARENT: Record<string, string> = { "/cases": "/coach", "/knowledge": "/", "/news": "/" };

function isActive(pathname: string, href: string) {
  const section = PARENT[`/${pathname.split("/")[1]}`] ?? pathname;
  return href === "/" ? section === "/" : section === href || section.startsWith(`${href}/`);
}

/** Practice kept in this browser (Сорил, cases, team badge) belongs to one account. */
const LOCAL_KEYS = ["otech-quiz-history", "otech-scenario-history", "otech-team-seen"];
const OWNER_KEY = "otech-history-owner";

/** Another account signed in on this browser: forget the previous one's local history. */
function useLocalHistoryOwner(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    try {
      const owner = localStorage.getItem(OWNER_KEY);
      if (owner === userId) return;
      localStorage.setItem(OWNER_KEY, userId);
      if (owner === null) return; // first account on this browser keeps what it did before signing in
      LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
      window.location.reload(); // the stores cache what they read
    } catch {
      // Storage blocked: nothing is kept anyway.
    }
  }, [userId]);
}

/**
 * Navigation like the Otech AI iOS app: a floating pill tab bar at the bottom on
 * phones, a slim top bar on wider screens. Hidden on the full-screen practice
 * pages (/coach?pack=…, /exam) and during onboarding.
 */
export function AppNav({ user }: { user: { id: string; name: string; admin: boolean } | null }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const teamBadge = useTeamAlerts(Boolean(user));
  useLocalHistoryOwner(user?.id ?? null);
  if (pathname === "/exam" || pathname === "/role" || pathname.startsWith("/cases/") || (pathname === "/coach" && params.get("pack"))) return null;
  const badge = (href: string) =>
    href === "/team" && teamBadge > 0 ? (
      <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-alert px-1 text-[10px] font-bold text-white">
        {Math.min(teamBadge, 9)}
      </span>
    ) : null;

  return (
    <>
      <header className="sticky top-0 z-40 hidden border-b border-line bg-canvas/60 backdrop-blur-xl md:block">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold text-ink">
            <Orb size={28} still />
            OTech AI
          </Link>
          {user && (
            <nav aria-label="Үндсэн цэс" className="flex items-center gap-1 text-sm font-medium">
              {ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative rounded-full px-4 py-2 transition-colors",
                      active ? "bg-accent-gradient text-white shadow-[0_4px_12px_rgb(139_92_246/0.4)]" : "text-muted hover:bg-field hover:text-ink",
                    )}
                  >
                    {item.icon ? item.title : "AI дасгалжуулагч"}
                    {badge(item.href)}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="flex items-center gap-2 text-sm">
            {user ? (
              <>
                {user.admin && (
                  <Link href="/admin" className={buttonClass("ghost", "sm")} title="Админ">
                    <Settings size={16} aria-hidden /> <span className="sr-only lg:not-sr-only">Админ</span>
                  </Link>
                )}
                <span className="hidden max-w-32 truncate text-subtle lg:inline" title={user.name}>
                  {user.name}
                </span>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/login" className={buttonClass("ghost", "sm")}>
                  Нэвтрэх
                </Link>
                <Link href="/register" className={buttonClass("primary", "sm")}>
                  Бүртгүүлэх
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {user && (
        <nav
          aria-label="Үндсэн цэс"
          className="fixed inset-x-0 bottom-2 z-40 mx-auto flex w-fit items-end gap-0.5 rounded-full border border-line bg-black/40 px-1.5 py-2 shadow-[0_8px_36px_rgb(0_0_0/0.45)] backdrop-blur-xl md:hidden"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.href === "/team" && teamBadge > 0 ? `${item.title}, ${teamBadge} шинэ` : undefined}
                className={cn("flex flex-col items-center gap-1", Icon ? "w-[62px]" : "w-[74px]")}
              >
                {Icon ? (
                  <span
                    className={cn(
                      "relative flex h-[46px] w-[46px] items-center justify-center rounded-full",
                      active ? "bg-accent-gradient text-white shadow-[0_4px_8px_rgb(139_92_246/0.4)]" : "bg-field text-ink",
                    )}
                  >
                    <Icon size={18} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                    {badge(item.href)}
                  </span>
                ) : (
                  <span className={cn("rounded-full ring-2", active ? "ring-gold" : "ring-white/25")}>
                    <Orb size={46} still />
                  </span>
                )}
                <span className={cn("truncate text-[11px]", active ? "font-semibold text-accent-deep" : "font-medium text-muted")}>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
