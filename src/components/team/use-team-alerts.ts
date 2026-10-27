"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/providers";

interface TeamsBody {
  teams: {
    role: string;
    name: string;
    challenges: { id: string; title: string; createdAt: string }[];
    feed: { id: string; name: string; packTitle: string; score: number; createdAt: string }[];
  }[];
}

const SEEN_KEY = "otech-team-seen";

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeen(iso: string) {
  try {
    localStorage.setItem(SEEN_KEY, iso);
  } catch {
    // Blocked storage: the badge just comes back next time.
  }
}

/** What is new since «Баг» was last opened: challenges for staff, results for managers. */
function news(body: TeamsBody, since: string) {
  return body.teams.flatMap((t) =>
    t.role === "owner"
      ? t.feed.filter((f) => f.createdAt > since).map((f) => ({ id: f.id, text: `${f.name}: ${f.packTitle} · ${f.score} оноо` }))
      : t.challenges.filter((c) => c.createdAt > since).map((c) => ({ id: c.id, text: `«${t.name}»: шинэ сорилт — ${c.title}` })),
  );
}

/**
 * Team notifications (the app's local notifications): polls /api/teams while the
 * tab is visible, shows a toast and, when allowed, a system notification for
 * each new item, and returns the badge count for «Баг». Opening /team clears it.
 */
export function useTeamAlerts(enabled: boolean) {
  const pathname = usePathname();
  const toast = useToast();
  const [unseen, setUnseen] = useState(0);
  const announced = useRef(new Set<string>());
  const onTeam = pathname === "/team";

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;

    async function check() {
      if (document.visibilityState !== "visible") return;
      const body = (await fetch("/api/teams")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as TeamsBody | null;
      if (!body || stopped) return;
      const now = new Date().toISOString();
      const since = readSeen();
      // First visit: start counting from now instead of flagging the whole history.
      if (!since || onTeam) {
        writeSeen(now);
        setUnseen(0);
        return;
      }
      const fresh = news(body, since);
      setUnseen(fresh.length);
      for (const item of fresh) {
        if (announced.current.has(item.id)) continue;
        announced.current.add(item.id);
        toast({ message: item.text, tone: "info", action: { label: "Баг", href: "/team" } });
        if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("OTech AI · Баг", { body: item.text });
      }
    }

    void check();
    const timer = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [enabled, onTeam, toast]);

  return onTeam ? 0 : unseen;
}
