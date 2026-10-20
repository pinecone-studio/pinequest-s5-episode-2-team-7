"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import { Button, Spinner } from "./ui";

export function StartCaseButton({ caseId, label = "Ярилцлага эхлэх" }: { caseId: string; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const { sessionId } = await apiFetch<{ sessionId: string }>("/api/sessions", { method: "POST", json: { caseId } });
            router.push(`/interview/${sessionId}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Алдаа гарлаа.");
            setPending(false);
          }
        }}
      >
        {pending && <Spinner />}
        {label}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
