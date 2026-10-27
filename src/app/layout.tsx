import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";
import { t } from "@/i18n";
import { getPageSession } from "@/lib/auth/server";
import "./globals.css";

// Both fonts ship Cyrillic Extended, which holds the Mongolian letters ө and ү.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  display: "swap",
});
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "OTech AI — Жинхэнэ хүн дээр алдахаас өмнө AI дээр дадлагажуул", template: "%s · OTech AI" },
  description: "AI дасгалжуулагч үйлчлүүлэгч, өвчтөн, сурагч, дуудлага өгөгч болж ярьж, материалаас тань сорил зохиож, хийсэн бүхэнд тань оноо, санал өгнө.",
};

export const viewport: Viewport = {
  themeColor: "#09080f",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // If the database is unreachable, still render the page (signed-out navigation).
  const session = await getPageSession().catch(() => null);
  return (
    // Dark only, like the iOS app.
    <html lang="mn" className={`${inter.variable} ${manrope.variable} dark h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <Suspense>
            <AppNav user={session ? { id: session.userId, name: session.name, admin: session.role === "admin" } : null} />
          </Suspense>
          <div className="flex flex-1 flex-col">{children}</div>
          {/* Room for the floating tab bar on phones. */}
          <footer className={session ? "pb-28 md:pb-0" : undefined}>
            <div className="mx-auto max-w-6xl px-4 py-5 text-xs leading-relaxed text-subtle">
              <strong className="font-semibold text-muted">{t.app.disclaimerTitle}</strong> {t.app.disclaimer}
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
