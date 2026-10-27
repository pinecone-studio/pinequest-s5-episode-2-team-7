/**
 * Browser side of «Шүүлэг» (the web page /shuulleg; the iOS app has its own
 * screens). Response shapes mirror src/lib/services/quiz.ts.
 */
import { apiFetch } from "./fetcher";

export interface QuizQuestion {
  id: string;
  kind: "open" | "choice" | "case";
  prompt: string;
  options: string[];
  keyPoints: string[];
  modelAnswer: string;
}

export interface Quiz {
  title: string;
  summary: string;
  questions: QuizQuestion[];
}

export interface GradeItem {
  score: number;
  status: "correct" | "partial" | "wrong" | "blank";
  feedback: string;
  missing: string[];
  mistakes: string[];
}

export interface Grade {
  score: number;
  verdict: string;
  items: GradeItem[];
  strengths: string[];
  weaknesses: string[];
  studyNext: { topic: string; why: string }[];
}

export interface Lesson {
  title: string;
  lesson: string;
  keyFacts: string[];
  selfCheck: { question: string; answer: string }[];
}

export interface QuizFile {
  name: string;
  mediaType: "image/jpeg" | "application/pdf" | "text/plain";
  data: string; // base64
  preview?: string; // object URL for images (not sent)
}

export const quizApi = {
  generate: (files: QuizFile[], notes: string, count: number, focus: string[] = []) =>
    apiFetch<{ quiz: Quiz }>("/api/quiz/generate", {
      method: "POST",
      json: { files: files.map(({ name, mediaType, data }) => ({ name, mediaType, data })), notes, count, focus },
    }).then((r) => r.quiz),
  grade: (quiz: Quiz, answers: string[]) =>
    apiFetch<{ grade: Grade }>("/api/quiz/grade", { method: "POST", json: { title: quiz.title, summary: quiz.summary, questions: quiz.questions, answers } }).then((r) => r.grade),
  explain: (topic: { topic: string; why: string }, quiz: Quiz) =>
    apiFetch<{ lesson: Lesson }>("/api/quiz/explain", { method: "POST", json: { topic: topic.topic, why: topic.why, title: quiz.title, summary: quiz.summary } }).then((r) => r.lesson),
};

function base64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Photos → JPEG with the longest side ≤ 1600 px (text stays readable, uploads stay small). */
async function imageFile(file: File): Promise<QuizFile> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/jpeg", 0.75));
  return { name: file.name, mediaType: "image/jpeg", data: base64(await blob.arrayBuffer()), preview: URL.createObjectURL(blob) };
}

export async function readQuizFile(file: File): Promise<QuizFile | null> {
  if (file.type.startsWith("image/")) return imageFile(file);
  if (file.type === "application/pdf") return { name: file.name, mediaType: "application/pdf", data: base64(await file.arrayBuffer()) };
  if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
    return { name: file.name, mediaType: "text/plain", data: base64(await file.arrayBuffer()) };
  }
  return null;
}

/* ---------- History (this browser only) ---------- */

export interface QuizAttempt {
  id: string;
  date: string;
  quiz: Quiz;
  answers: string[];
  grade: Grade;
}

const HISTORY_KEY = "otech-quiz-history";
const EMPTY: QuizAttempt[] = [];
let cached: QuizAttempt[] | null = null;
const listeners = new Set<() => void>();

function read(): QuizAttempt[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as QuizAttempt[];
  } catch {
    return EMPTY;
  }
}

function write(next: QuizAttempt[]) {
  cached = next;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the result is still shown, just not kept.
  }
  listeners.forEach((l) => l());
}

/** useSyncExternalStore source for the history list. */
export const quizHistory = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot: (): QuizAttempt[] => (cached ??= read()),
  serverSnapshot: (): QuizAttempt[] => EMPTY,
};

export function saveAttempt(attempt: QuizAttempt) {
  write([attempt, ...quizHistory.snapshot()].slice(0, 30));
}

export function removeAttempt(id: string) {
  write(quizHistory.snapshot().filter((a) => a.id !== id));
}

/* ---------- Oral exam hand-off (/shuulleg → /exam → /shuulleg) ---------- */

/** The question sheet for /exam (no answer keys) — the same shape the iOS app injects. */
export const EXAM_QUIZ_KEY = "otoch-quiz";
/** The full quiz kept while the examiner asks, so /shuulleg can grade afterwards. */
export const PENDING_QUIZ_KEY = "otech-pending-quiz";
/** Answers /exam leaves behind when it was opened from the web, not the app. */
export const EXAM_ANSWERS_KEY = "otech-exam-answers";

export function startOralExam(quiz: Quiz) {
  sessionStorage.setItem(PENDING_QUIZ_KEY, JSON.stringify(quiz));
  sessionStorage.setItem(EXAM_QUIZ_KEY, JSON.stringify({ title: quiz.title, questions: quiz.questions.map(({ id, kind, prompt, options }) => ({ id, kind, prompt, options })) }));
  sessionStorage.removeItem(EXAM_ANSWERS_KEY);
}

/** After /exam: the quiz and (if finished) the spoken answers; clears the hand-off. */
export function takeOralResult(): { quiz: Quiz; answers: string[] | null } | null {
  try {
    const quiz = sessionStorage.getItem(PENDING_QUIZ_KEY);
    if (!quiz) return null;
    const answers = sessionStorage.getItem(EXAM_ANSWERS_KEY);
    sessionStorage.removeItem(PENDING_QUIZ_KEY);
    sessionStorage.removeItem(EXAM_ANSWERS_KEY);
    sessionStorage.removeItem(EXAM_QUIZ_KEY);
    return { quiz: JSON.parse(quiz) as Quiz, answers: answers ? (JSON.parse(answers) as string[]) : null };
  } catch {
    return null;
  }
}
