import { PageTransition } from "@/components/motion/page-transition";

/** Remounts on every navigation, so each screen gets an enter transition. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
