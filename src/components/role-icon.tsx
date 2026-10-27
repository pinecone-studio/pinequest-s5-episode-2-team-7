import { Briefcase, Headphones, PhoneCall, School, Sparkles, Stethoscope } from "lucide-react";
import type { UserRole } from "@/lib/role";

const ICONS = {
  service: Headphones,
  manager: Briefcase,
  teacher: School,
  dispatcher: PhoneCall,
  health: Stethoscope,
  learner: Sparkles,
} satisfies Record<UserRole, unknown>;

export function RoleIcon({ role, size = 22, className }: { role: UserRole; size?: number; className?: string }) {
  const Icon = ICONS[role];
  return <Icon size={size} className={className} aria-hidden />;
}
