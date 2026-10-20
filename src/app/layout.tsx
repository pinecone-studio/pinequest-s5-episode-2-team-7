import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "PineQuest AI Patient — Эмнэлзүйн асуумжийн дадлага", template: "%s · PineQuest AI Patient" },
  description: "Анагаахын оюутнууд AI өвчтөнтэй монгол хэлээр ярилцаж, асуумж авах, онош тавих чадвараа хөгжүүлэх сургалтын симулятор.",
};

export const viewport: Viewport = {
  themeColor: "#1f7a72",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="mn" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-5 text-xs leading-relaxed text-slate-500">
            <strong className="font-semibold text-slate-600">Анхааруулга:</strong> Энэ нь зөвхөн боловсролын зориулалттай симуляц бөгөөд бодит
            өвчтөнийг оношлох, эмчлэхэд ашиглахгүй. Кейсүүд нь зохиомол бөгөөд эмнэлзүйн удирдамж биш. Бодит яаралтай тохиолдолд 103-т
            залгана уу.
          </div>
        </footer>
      </body>
    </html>
  );
}
