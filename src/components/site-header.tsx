import Link from "next/link";
import { getPageSession } from "@/lib/auth/server";
import { t } from "@/i18n";
import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "./theme-toggle";
import { buttonClass } from "./ui";

const navLink = "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-muted transition-colors hover:bg-sunken hover:text-ink";

/** Signed-in sections; on phones they scroll in a row under the header. */
function sectionLinks(admin: boolean) {
  return [
    { href: "/dashboard", label: t.nav.cases },
    { href: "/shuulleg", label: t.nav.shuulleg },
    { href: "/atlas", label: t.nav.anatomy },
    { href: "/vr", label: t.nav.vr },
    { href: "/news", label: t.nav.news },
    { href: "/sessions", label: t.nav.history },
    ...(admin ? [{ href: "/admin", label: t.nav.admin }] : []),
  ];
}

export async function SiteHeader() {
  // If the database is unreachable, still render the header so /demo keeps working on stage.
  const session = await getPageSession().catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href={session ? "/dashboard" : "/"} className="flex shrink-0 items-center gap-2 whitespace-nowrap font-display font-bold text-ink">
          <Logo />
          <span>
            {t.app.name} <span className="hidden text-accent min-[420px]:inline">{t.app.nameAccent}</span>
          </span>
        </Link>
        <nav aria-label={t.nav.mainMenu} className="flex items-center gap-1 text-sm font-medium">
          {session ? (
            <>
              <span className="hidden items-center gap-1 lg:flex">
                {sectionLinks(session.role === "admin").map((l) => (
                  <Link key={l.href} href={l.href} className={navLink}>
                    {l.label}
                  </Link>
                ))}
              </span>
              <span className="ml-1 hidden max-w-32 truncate text-subtle md:inline" title={session.name}>
                {session.name}
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/demo" className={`${navLink} hidden sm:inline`}>
                {t.nav.demo}
              </Link>
              <Link href="/login" className={navLink}>
                {t.nav.login}
              </Link>
              <Link href="/register" className={buttonClass("primary", "sm")}>
                {t.nav.register}
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
      {session && (
        <nav aria-label={t.nav.mainMenu} className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 text-sm font-medium [scrollbar-width:none] lg:hidden">
          {sectionLinks(session.role === "admin").map((l) => (
            <Link key={l.href} href={l.href} className={navLink}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-accent" />
      <path d="M5 17h6l2.5-6 4 11 2.5-5H27" fill="none" className="stroke-accent-ink" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
