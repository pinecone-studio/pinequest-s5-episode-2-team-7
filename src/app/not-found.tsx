import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-sm font-medium text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Хуудас олдсонгүй</h1>
      <p className="mt-2 text-sm text-slate-500">Таны хайсан хуудас байхгүй эсвэл танд харах эрх алга.</p>
      <Link href="/" className={buttonClass("primary", "md", "mt-6")}>
        Нүүр хуудас руу
      </Link>
    </main>
  );
}
