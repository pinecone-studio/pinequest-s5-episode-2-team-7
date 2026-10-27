"use client";

import { BadgeCheck, Bell, Briefcase, ChevronRight, Copy, FilePlus2, Flag, UserRound, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { CustomSheet, Sheet } from "@/components/coach/coach-hub";
import { Button, buttonClass, cn, inputClass } from "@/components/ui";
import { apiFetch, ClientApiError } from "@/lib/fetcher";
import { formatDateTime, formatDay } from "@/lib/i18n";
import { coachHref, DIFFICULTY_LABELS, MODE_LABELS, modeLabel, difficultyLabel, scoreColor } from "@/lib/coach/labels";
import type { CoachDifficulty, CoachMode, PublicPack } from "@/lib/coach/types";
import type { teamsOverview } from "@/lib/services/coach";

type Team = Awaited<ReturnType<typeof teamsOverview>>["teams"][number];

const errorText = (e: unknown) => (e instanceof ClientApiError || e instanceof Error ? e.message : "Алдаа гарлаа. Дахин оролдоно уу.");
const dueText = (due: string | null) => (due ? ` · ${formatDay(due)} хүртэл` : "");

/** «Баг»: the employer hands out challenges, staff complete them; every result reaches the manager. */
export function TeamView({ teams, packs }: { teams: Team[]; packs: PublicPack[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [challengeFor, setChallengeFor] = useState<Team | null>(null);
  const [materialFor, setMaterialFor] = useState<Team | null>(null);
  const icon = (ref: string) => packs.find((p) => p.id === ref)?.icon ?? "🏆";

  return (
    <div className="space-y-5">
      {teams.length > 0 && <NotifyButton />}
      {teams.length === 0 && <StartCards onDone={setMessage} />}

      {teams.map((t) =>
        t.role === "owner" ? (
          <OwnerCard key={t.id} team={t} icon={icon} onChallenge={() => setChallengeFor(t)} onMaterial={() => setMaterialFor(t)} />
        ) : (
          <MemberCard key={t.id} team={t} icon={icon} />
        ),
      )}

      {teams.length > 0 && (
        <details className="glass rounded-[20px] p-3.5">
          <summary className="cursor-pointer text-sm font-semibold">Өөр баг үүсгэх эсвэл нэгдэх</summary>
          <div className="mt-3">
            <StartCards onDone={setMessage} />
          </div>
        </details>
      )}

      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}

      {challengeFor && (
        <ChallengeSheet
          team={challengeFor}
          packs={[...packs.filter((p) => p.kind === "custom" && (p.teamId === null || p.teamId === challengeFor.id)), ...packs.filter((p) => p.kind !== "custom")]}
          onClose={() => setChallengeFor(null)}
          onSent={() => {
            setChallengeFor(null);
            setMessage("Сорилт илгээлээ. Ажилтан бүрийн үр дүн энд гарч ирнэ.");
            router.refresh();
          }}
        />
      )}
      {materialFor && (
        <CustomSheet
          teamId={materialFor.id}
          ownedTeams={[]}
          onClose={() => setMaterialFor(null)}
          onCreated={() => {
            setMaterialFor(null);
            setMessage("Компанийн дасгалжуулагч үүслээ. Одоо «Сорилт өгөх»-өөс сонгоод ажилтнууддаа илгээгээрэй.");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const noSubscribe = () => () => {};

/** Browsers only ask for notification permission after a click, so offer it here. */
function NotifyButton() {
  const [, rerender] = useState(0);
  const permission = useSyncExternalStore(
    noSubscribe,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "unsupported",
  );
  if (permission !== "default") return null;
  return (
    <button
      type="button"
      onClick={() => void Notification.requestPermission().then(() => rerender((n) => n + 1))}
      className="glass flex w-full items-center gap-3 rounded-[20px] p-3 text-left text-sm"
    >
      <Bell size={18} className="text-accent" aria-hidden />
      <span className="flex-1">Шинэ сорилт, ажилтны үр дүнг мэдэгдлээр авах</span>
      <span className="font-semibold text-accent-deep">Асаах</span>
    </button>
  );
}

function StartCards({ onDone }: { onDone: (message: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);

  async function run(action: () => Promise<string>) {
    setWorking(true);
    try {
      onDone(await action());
      router.refresh();
    } catch (e) {
      onDone(errorText(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <form
        className="glass space-y-2.5 rounded-[22px] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await apiFetch("/api/teams", { method: "POST", json: { name: name.trim() } });
            setName("");
            return "Баг үүслээ. Кодыг ажилтнууддаа илгээгээрэй.";
          });
        }}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <Briefcase size={18} className="text-accent" aria-hidden /> Би ажил олгогч / менежер
        </h2>
        <p className="text-xs text-muted">Баг үүсгээд кодоо шинэ ажилтандаа өгнө. Компанийн мэдээллээ оруулж, сорилт өгч, үр дүнг харна.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Компани / багийн нэр" aria-label="Компани / багийн нэр" className={cn(inputClass, "h-11")} />
        <Button type="submit" className="w-full" disabled={working || name.trim().length < 2}>
          Баг үүсгэх
        </Button>
      </form>
      <form
        className="glass space-y-2.5 rounded-[22px] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const { team } = await apiFetch<{ team: { name: string } }>("/api/teams/join", { method: "POST", json: { code: code.trim() } });
            setCode("");
            return `«${team.name}» багт нэгдлээ.`;
          });
        }}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <UserRound size={18} className="text-accent" aria-hidden /> Би ажилтан
        </h2>
        <p className="text-xs text-muted">Менежерээсээ авсан 6 оронтой кодоор нэгдээд сорилтуудаа биелүүлнэ.</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Код (жишээ: K7M2QX)"
          aria-label="Багийн код"
          autoCapitalize="characters"
          autoComplete="off"
          className={cn(inputClass, "h-11 font-mono tracking-widest")}
        />
        <Button type="submit" variant="secondary" className="w-full" disabled={working || code.trim().length < 4}>
          Нэгдэх
        </Button>
      </form>
    </div>
  );
}

function OwnerCard({ team, icon, onChallenge, onMaterial }: { team: Team; icon: (ref: string) => string; onChallenge: () => void; onMaterial: () => void }) {
  const [copied, setCopied] = useState(false);
  const staff = team.members.filter((m) => m.role !== "owner");
  const share = `OTech AI-д манай «${team.name}» багт нэгдээрэй. Баг → Нэгдэх, код: ${team.code}`;

  return (
    <section className="glass space-y-4 rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{team.name}</h2>
          <p className="text-xs text-muted">Та менежер · {team.memberCount - 1} ажилтан</p>
        </div>
        {team.code && (
          <button
            type="button"
            onClick={async () => {
              if (navigator.share) await navigator.share({ text: share }).catch(() => null);
              else {
                await navigator.clipboard.writeText(share).catch(() => null);
                setCopied(true);
              }
            }}
            className="rounded-[14px] bg-accent-soft px-3 py-2 text-center"
          >
            <span className="block font-mono font-semibold text-accent-deep">{team.code}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted">
              <Copy size={11} aria-hidden /> {copied ? "Хуулсан" : "Хуваалцах"}
            </span>
          </button>
        )}
      </div>

      <div className="flex gap-2.5">
        <Button className="flex-1" onClick={onChallenge}>
          <Flag size={16} aria-hidden /> Сорилт өгөх
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onMaterial}>
          <FilePlus2 size={16} aria-hidden /> Материал
        </Button>
      </div>

      {team.challenges.length > 0 && (
        <Block title="Сорилтууд">
          {team.challenges.map((c) => (
            <Row key={c.id} icon={icon(c.packRef)} title={c.title} detail={`Зорилт ${c.targetScore} · ${modeLabel(c.mode)} · ${difficultyLabel(c.difficulty)}${dueText(c.dueAt)}`}>
              <span className="font-semibold tabular-nums text-accent-deep" aria-label={`${c.passedCount} ажилтан биелүүлсэн`}>
                {c.passedCount}/{Math.max(0, team.memberCount - 1)}
              </span>
            </Row>
          ))}
        </Block>
      )}

      {staff.length > 0 ? (
        <Block title="Ажилтнууд">
          {staff.map((m) => (
            <div key={m.userId} className="flex items-center gap-3">
              <UserRound size={26} className="text-subtle" aria-hidden />
              <span className="flex-1">
                <span className="block text-sm font-semibold">{m.name}</span>
                <span className="block text-xs text-muted">{m.practices} дадлага</span>
              </span>
              {m.best !== null ? <span className={cn("font-semibold tabular-nums", scoreColor(m.best).split(" ")[0])}>{m.best}</span> : <span className="text-subtle">–</span>}
            </div>
          ))}
        </Block>
      ) : (
        <p className="text-xs text-muted">Ажилтан нэгдээгүй байна. Дээрх кодыг илгээгээрэй.</p>
      )}

      <Feed title="Сүүлийн үр дүн" feed={team.feed} />
    </section>
  );
}

function MemberCard({ team, icon }: { team: Team; icon: (ref: string) => string }) {
  const owner = team.members.find((m) => m.role === "owner");
  return (
    <section className="glass space-y-4 rounded-3xl p-4">
      <div>
        <h2 className="text-xl font-semibold">{team.name}</h2>
        <p className="text-xs text-muted">Менежер: {owner?.name ?? "—"}</p>
      </div>
      {team.challenges.length === 0 && <p className="text-xs text-muted">Одоогоор сорилт алга. Менежер сорилт өгөхөд энд гарч ирнэ.</p>}
      {team.challenges.map((c) => (
        <Row key={c.id} icon={icon(c.packRef)} title={c.title} detail={`Зорилт ${c.targetScore}${c.myBest !== null ? ` · Таны шилдэг ${c.myBest}` : ""}${dueText(c.dueAt)}`}>
          {c.passed ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-ok">
              <BadgeCheck size={16} aria-hidden /> Биелсэн
            </span>
          ) : (
            <Link href={coachHref(c.packRef, c.mode, c.difficulty, c.id)} className={buttonClass("primary", "sm")}>
              {c.myBest === null ? "Эхлэх" : "Дахин"}
            </Link>
          )}
        </Row>
      ))}
      <Feed title="Миний үр дүн" feed={team.feed} />
    </section>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Row({ icon, title, detail, children }: { icon: string; title: string; detail: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-field p-2.5">
      <span className="text-2xl">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
      {children}
    </div>
  );
}

function Feed({ title, feed }: { title: string; feed: Team["feed"] }) {
  if (feed.length === 0) return null;
  return (
    <Block title={title}>
      {feed.slice(0, 10).map((item) => (
        <Link key={item.id} href={`/feedback/${item.id}`} className="flex items-center gap-3 rounded-[14px] p-1.5 hover:bg-field">
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-semibold tabular-nums", scoreColor(item.score))}>{item.score}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {item.name} · {item.packTitle}
            </span>
            <span className="block text-xs text-muted">{formatDateTime(item.createdAt)}</span>
          </span>
          {item.passed !== null &&
            (item.passed ? <BadgeCheck size={18} className="text-ok" aria-label="Биелсэн" /> : <XCircle size={18} className="text-alert" aria-label="Биелээгүй" />)}
          <ChevronRight size={14} className="text-subtle" aria-hidden />
        </Link>
      ))}
    </Block>
  );
}

function ChallengeSheet({ team, packs, onClose, onSent }: { team: Team; packs: PublicPack[]; onClose: () => void; onSent: () => void }) {
  const [packRef, setPackRef] = useState(packs[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<CoachMode>(packs[0]?.defaultMode ?? "audio");
  const [difficulty, setDifficulty] = useState<CoachDifficulty>("medium");
  const [target, setTarget] = useState(70);
  const [dueDays, setDueDays] = useState<number | null>(7);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const select = cn(inputClass, "h-11");

  async function send() {
    setWorking(true);
    setError(null);
    try {
      await apiFetch(`/api/teams/${team.id}/challenges`, { method: "POST", json: { packRef, title: title.trim(), mode, difficulty, targetScore: target, dueDays } });
      onSent();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Sheet title="Сорилт өгөх" onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block font-semibold">Дүр</span>
          <select
            value={packRef}
            onChange={(e) => {
              setPackRef(e.target.value);
              const pack = packs.find((p) => p.id === e.target.value);
              if (pack) setMode(pack.defaultMode);
            }}
            className={select}
          >
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.title}
              </option>
            ))}
          </select>
        </label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Сорилтын нэр (заавал биш)" aria-label="Сорилтын нэр" className={select} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Хэлбэр</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as CoachMode)} className={select}>
              {Object.entries(MODE_LABELS).map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Хүндийн зэрэг</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as CoachDifficulty)} className={select}>
              {Object.entries(DIFFICULTY_LABELS).map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Зорилт: {target} оноо</span>
          <input type="range" min={40} max={100} step={5} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Хугацаа</span>
          <select value={dueDays ?? ""} onChange={(e) => setDueDays(e.target.value ? Number(e.target.value) : null)} className={select}>
            <option value="">Хугацаагүй</option>
            <option value="3">3 хоног</option>
            <option value="7">7 хоног</option>
            <option value="14">14 хоног</option>
          </select>
        </label>
        <p className="text-xs text-muted">Ажилтан бүрийн үр дүн «Баг» хэсэгт ирнэ.</p>
        {error && <p className="text-sm text-alert">{error}</p>}
        <Button size="lg" className="w-full" disabled={!packRef || working} onClick={() => void send()}>
          Илгээх
        </Button>
      </div>
    </Sheet>
  );
}
