"use client";

import { useState } from "react";
import { startOfflineSession } from "@/lib/demo/offline";
import { InterviewWorkspace } from "../interview/workspace";

/** Each visit starts a fresh scripted interview held in browser memory. */
export function OfflineInterview({ caseId }: { caseId: string }) {
  const [session] = useState(() => startOfflineSession(caseId));
  return <InterviewWorkspace initial={session} offlineCaseId={caseId} />;
}
