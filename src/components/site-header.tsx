import Link from "next/link";
import { getPageSession } from "@/lib/auth/server";
import { LogoutButton } from "./logout-button";
import { buttonClass } from "./ui";

export async function SiteHeader() {
  const session = await getPageSession();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href={session ? "/dashboard" : "/"} className="flex shrink-0 items-center gap-2 whitespace-nowrap font-semibold text-ink">
          <Logo />
          <span>
            PineQuest <span className="hidden text-brand-600 min-[400px]:inline">AI Patient</span>
          </span>
        </Link>
        <nav aria-label="Үндсэн цэс" className="flex items-center gap-1 text-sm">
          {session ? (
            <>
              <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-ink">
                Кейсүүд
              </Link>
              <Link href="/sessions" className="hidden rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-ink sm:inline">
                Түүх
              </Link>
              {session.role === "admin" && (
                <Link href="/admin" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-ink">
                  Админ
                </Link>
              )}
              <span className="ml-2 hidden max-w-32 truncate text-slate-500 md:inline" title={session.name}>
                {session.name}
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100">
                Нэвтрэх
              </Link>
              <Link href="/register" className={buttonClass("primary", "sm")}>
                Бүртгүүлэх
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-brand-600" />
      <path d="M16 7.5v17M7.5 16h17" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="23.5" cy="8.5" r="3" className="fill-amber-300" />
    </svg>
  );
}
