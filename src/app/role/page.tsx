import type { Metadata } from "next";
import { CheckCircle2, Circle } from "lucide-react";
import { chooseRole } from "@/app/actions";
import { RoleIcon } from "@/components/role-icon";
import { buttonClass } from "@/components/ui";
import { PICKABLE_ROLES, ROLES } from "@/lib/role";
import { getRole } from "@/lib/role-server";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Та юунд бэлдэж байна вэ?" };

/** Onboarding step 2 (as in the iOS app), also opened from «Нүүр» to switch roles. */
export default async function RolePage({ searchParams }: PageProps<"/role">) {
  const next = safeNext((await searchParams).next, "/");
  const current = await getRole();

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-10">
      <h1 className="font-display text-3xl font-bold text-ink">Та юунд бэлдэж байна вэ?</h1>
      <p className="mt-2 text-sm text-muted">
        Сонголтоос тань хамаарч AI дасгалжуулагч, сорилын асуулт, нүүр хуудас өөрчлөгдөнө. Дараа нь сольж болно.
      </p>

      <form action={chooseRole} className="mt-6 space-y-3">
        <input type="hidden" name="next" value={next} />
        {PICKABLE_ROLES.map((role) => (
          <label
            key={role}
            className="glass group flex cursor-pointer items-center gap-4 rounded-[20px] p-3.5 has-[:checked]:glow-edge has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          >
            <input type="radio" name="role" value={role} defaultChecked={role === current} required className="peer sr-only" />
            <span className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[15px] bg-accent-soft text-accent-deep group-has-[:checked]:bg-accent-gradient group-has-[:checked]:text-white">
              <RoleIcon role={role} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{ROLES[role].title}</span>
              <span className="block text-xs text-muted">{ROLES[role].detail}</span>
            </span>
            <Circle size={22} className="shrink-0 text-subtle group-has-[:checked]:hidden" aria-hidden />
            <CheckCircle2 size={22} className="hidden shrink-0 text-accent-deep group-has-[:checked]:block" aria-hidden />
          </label>
        ))}
        <button type="submit" className={buttonClass("primary", "lg", "mt-3 w-full")}>
          Үргэлжлүүлэх
        </button>
      </form>
    </main>
  );
}
