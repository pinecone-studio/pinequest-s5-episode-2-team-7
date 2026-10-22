import type { Metadata } from "next";

export const metadata: Metadata = { title: "3D Анатоми" };

/**
 * «Анатоми»: the Human Atlas viewer (public/anatomy, built from
 * ~/Developer/human-atlas) inside the site, below the header.
 */
export default function AtlasPage() {
  return (
    <main className="flex flex-1 flex-col">
      <iframe src="/anatomy/index.html" title="3D хүний анатоми" className="h-[calc(100dvh-6.25rem)] w-full border-0 bg-[#06101f] lg:h-[calc(100dvh-3.5rem)]" allow="fullscreen" />
    </main>
  );
}
