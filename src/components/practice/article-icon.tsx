import { Activity, Bone, Brain, Droplet, Gauge, HeartPulse, Heart, ListOrdered, Phone, ShieldAlert, Utensils, Wind, BookOpen, type LucideIcon } from "lucide-react";
import type { KnowledgeArticle } from "@/lib/practice/knowledge";

/** The app's SF Symbols for articles, as Lucide icons. */
const ICONS: Record<string, LucideIcon> = {
  "heart.fill": Heart,
  "lungs.fill": Wind,
  "brain.head.profile": Brain,
  "fork.knife": Utensils,
  "figure.walk": Bone,
  "drop.fill": Droplet,
  "list.number": ListOrdered,
  "heart.text.square.fill": HeartPulse,
  "waveform.path.ecg.rectangle": Activity,
  allergens: ShieldAlert,
  "phone.fill": Phone,
  "waveform.path.ecg": Activity,
  "gauge.with.dots.needle.33percent": Gauge,
};

/** Dark tinted panels (Theme.tint* in the app). */
export const TINTS: Record<KnowledgeArticle["tint"], string> = {
  tintPink: "#2a1628",
  tintBlue: "#151d36",
  tintLilac: "#1e1734",
  tintPeach: "#271c22",
};

export function ArticleIcon({ article, size = 22 }: { article: KnowledgeArticle; size?: number }) {
  const Icon = ICONS[article.icon] ?? BookOpen;
  return <Icon size={size} aria-hidden />;
}
