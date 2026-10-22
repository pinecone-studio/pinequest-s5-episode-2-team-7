import Link from "next/link";
import { requirePageAdmin } from "@/lib/auth/server";

const NAV = [
  { href: "/admin", label: "Кейсүүд" },
  { href: "/admin/cases/new", label: "Шинэ кейс" },
  { href: "/admin/news", label: "Эрүүл мэндийн мэдээ" },
  { href: "/admin/import", label: "Импорт / Экспорт" },
  { href: "/admin/sessions", label: "Ярилцлага ба сургалтын өгөгдөл" },
  { href: "/admin/quality", label: "Өгөгдлийн чанар" },
  { href: "/admin/diagnostics", label: "AI загварын төлөв" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requirePageAdmin("/admin");
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 lg:flex-row">
      <nav aria-label="Админ цэс" className="lg:w-56 lg:shrink-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Удирдлага</p>
        <ul className="flex gap-1 overflow-x-auto text-sm lg:flex-col">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="block whitespace-nowrap rounded-lg px-3 py-2 text-slate-600 hover:bg-white hover:text-ink">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
