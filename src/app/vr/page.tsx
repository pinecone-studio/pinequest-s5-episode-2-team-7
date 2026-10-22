import type { Metadata } from "next";
import { Ear, Eye, Hand, Thermometer } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "VR дадлага" };

const SKILLS = [
  { icon: Eye, title: "Хүүхэн харааны гэрлийн урвал", detail: "Гар чийдэнгээр хүүхэн харааны агшилтыг шалгах" },
  { icon: Thermometer, title: "Биеийн халуун хэмжих", detail: "Халуун хэмжигч ашиглаж, үр дүнг унших" },
  { icon: Ear, title: "Чих харах (отоскоп)", detail: "Отоскопоор чихний сувгийг үзэх" },
  { icon: Hand, title: "Тэмтрэлт, биеийн үзлэг", detail: "Өвчтөнийг бодитоор үзэх дадлага" },
];

/** «VR дадлага»: the VR clinical-skills demo video. */
export default function VrPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <PageHeader title="VR эмнэлзүйн дадлага" subtitle="Виртуал эмнэлэгт өвчтөнийг гараараа үзэж, багажаа хэрэглэж сурах дадлага." />
      <Card className="overflow-hidden p-0">
        <video src="/vr/vr-demo.mp4" controls playsInline preload="metadata" poster="/vr/vr-poster.jpg" className="aspect-video w-full bg-black" />
      </Card>
      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Энэ бичлэгт</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {SKILLS.map(({ icon: Icon, title, detail }) => (
          <Card key={title} className="flex items-start gap-4 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-xs text-muted">{detail}</span>
            </span>
          </Card>
        ))}
      </div>
    </main>
  );
}
