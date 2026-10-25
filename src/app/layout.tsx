import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { THEME_COOKIE } from "@/lib/theme";
import { t } from "@/i18n";
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
  title: { default: "PineQuest AI Patient — Эрүүл мэндийн мэргэжилтнүүдийн AI дадлагын орчин", template: "%s · PineQuest AI Patient" },
  description: "Эрүүл мэндийн мэргэжилтнүүдийн AI дадлагын орчин: 360° орчинд монгол хэлээр ярьдаг AI өвчтөнөөс асуумж авч, онош тавин, шууд үнэлгээ авна.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#06101f" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Chosen theme from the toggle's cookie; without it CSS follows the OS setting.
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  const themeClass = theme === "dark" || theme === "light" ? theme : "";
  return (
    <html lang="mn" className={`${inter.variable} ${manrope.variable} ${themeClass} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
          <footer className="border-t border-line">
            <div className="mx-auto max-w-6xl px-4 py-5 text-xs leading-relaxed text-subtle">
              <strong className="font-semibold text-muted">{t.app.disclaimerTitle}</strong> {t.app.disclaimer}
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
