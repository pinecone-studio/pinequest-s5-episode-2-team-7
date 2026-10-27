"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Not signed in: inside the iOS app, ask the app to show its own sign-in screen
 * (it replaces this page at once); in a browser, link to /login.
 */
export function NeedSignIn({ next }: { next: string }) {
  useEffect(() => {
    window.webkit?.messageHandlers?.otoch?.postMessage({ type: "needSignIn" });
  }, []);
  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#09080f] p-6 text-center text-[#ffffff]">
      <p className="text-sm text-[#c9c4e0]">Дадлага хийхийн тулд нэвтэрнэ үү.</p>
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="rounded-full bg-[#8b5cf6] px-6 py-3 text-sm font-semibold text-[#ffffff]">
        Нэвтрэх
      </Link>
    </main>
  );
}
