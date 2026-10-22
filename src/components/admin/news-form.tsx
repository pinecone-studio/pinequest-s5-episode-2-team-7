"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Input, Label, Spinner, Textarea, inputClass } from "@/components/ui";
import { apiFetch } from "@/lib/fetcher";
import { NEWS_CATEGORY_LABELS } from "@/lib/i18n";

export interface NewsFormValues {
  title: string;
  summary: string;
  body: string;
  category: string;
  sourceName: string;
  sourceUrl: string;
}

const EMPTY: NewsFormValues = { title: "", summary: "", body: "", category: "general", sourceName: "", sourceUrl: "" };

export function NewsForm({ articleId, initial = EMPTY }: { articleId?: string; initial?: NewsFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<NewsFormValues>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof NewsFormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiFetch(articleId ? `/api/admin/news/${articleId}` : "/api/admin/news", { method: articleId ? "PUT" : "POST", json: values });
      router.push("/admin/news");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Алдаа гарлаа.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="space-y-4 p-5">
        <div>
          <Label htmlFor="news-title">Гарчиг</Label>
          <Input id="news-title" required maxLength={200} value={values.title} onChange={set("title")} />
        </div>
        <div>
          <Label htmlFor="news-category">Ангилал</Label>
          <select id="news-category" value={values.category} onChange={set("category")} className={`${inputClass} h-10`}>
            {Object.entries(NEWS_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="news-summary" hint="(жагсаалтад харагдана)">
            Товч агуулга
          </Label>
          <Textarea id="news-summary" required rows={2} maxLength={500} value={values.summary} onChange={set("summary")} />
        </div>
        <div>
          <Label htmlFor="news-body" hint="(догол мөрийг хоосон мөрөөр тусгаарлана)">
            Мэдээний агуулга
          </Label>
          <Textarea id="news-body" required rows={12} maxLength={20000} value={values.body} onChange={set("body")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="news-source" hint="(заавал биш)">
              Эх сурвалжийн нэр
            </Label>
            <Input id="news-source" maxLength={120} value={values.sourceName} onChange={set("sourceName")} />
          </div>
          <div>
            <Label htmlFor="news-url" hint="(заавал биш)">
              Эх сурвалжийн холбоос
            </Label>
            <Input id="news-url" type="url" maxLength={500} placeholder="https://" value={values.sourceUrl} onChange={set("sourceUrl")} />
          </div>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            {articleId ? "Хадгалах" : "Ноорог үүсгэх"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push("/admin/news")}>
            Болих
          </Button>
        </div>
      </Card>
    </form>
  );
}
