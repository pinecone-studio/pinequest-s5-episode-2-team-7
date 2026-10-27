"use client";

import { MessageSquare, Mic, MicOff, PhoneOff } from "lucide-react";
import { cn } from "./ui";

/**
 * The call's control bar (every avatar screen): microphone on/off, the chat
 * (transcript and typing) and hang up.
 */
export function CallControls({
  micOn,
  micBusy = false,
  chatOpen,
  disabled = false,
  onMic,
  onChat,
  onEnd,
}: {
  micOn: boolean;
  micBusy?: boolean;
  chatOpen: boolean;
  disabled?: boolean;
  onMic: () => void;
  onChat: () => void;
  onEnd?: () => void;
}) {
  const round = "flex h-14 w-14 items-center justify-center rounded-full transition disabled:opacity-40";
  return (
    <div className="flex items-start justify-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={onMic}
          disabled={disabled || micBusy}
          aria-pressed={micOn}
          aria-label={micOn ? "Микрофон унтраах" : "Микрофон асаах"}
          className={cn(round, micOn ? "bg-[#ffffff]/12 text-[#ffffff]" : "bg-[#ffffff] text-[#e11d48]")}
        >
          {micOn ? <Mic size={22} /> : <MicOff size={22} />}
        </button>
        <span className="text-[11px] text-[#a7a2c3]">{micOn ? "Микрофон" : "Унтраалттай"}</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <button onClick={onChat} aria-pressed={chatOpen} aria-label={chatOpen ? "Чат хаах" : "Чат нээх"} className={cn(round, chatOpen ? "bg-[#8b5cf6] text-[#ffffff]" : "bg-[#ffffff]/12 text-[#ffffff]")}>
          <MessageSquare size={22} />
        </button>
        <span className="text-[11px] text-[#a7a2c3]">Чат</span>
      </div>
      {onEnd && (
        <div className="flex flex-col items-center gap-1">
          <button onClick={onEnd} disabled={disabled} aria-label="Дуусгах" className={cn(round, "bg-[#e11d48] text-[#ffffff]")}>
            <PhoneOff size={22} />
          </button>
          <span className="text-[11px] text-[#a7a2c3]">Дуусгах</span>
        </div>
      )}
    </div>
  );
}
