import type { Metadata } from "next";
import { Examiner } from "@/components/exam/examiner";

export const metadata: Metadata = { title: "Шүүлэг" };

/** Oral exam with the examiner avatar; opened by the Otech AI iOS app. */
export default function ExamPage() {
  return <Examiner />;
}
