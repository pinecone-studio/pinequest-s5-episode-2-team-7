import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as adminCases, POST as adminCreateCase } from "@/app/api/admin/cases/route";
import { POST as adminImport } from "@/app/api/admin/cases/import/route";
import { GET as adminTrainingExport } from "@/app/api/admin/training/export/route";
import { POST as approveTraining } from "@/app/api/admin/sessions/[id]/training/route";
import { GET as listCases } from "@/app/api/cases/route";
import { GET as listSessions, POST as startSession } from "@/app/api/sessions/route";
import { GET as getSession } from "@/app/api/sessions/[id]/route";
import { POST as sendMessage } from "@/app/api/sessions/[id]/messages/route";
import { POST as submitDiagnosis } from "@/app/api/sessions/[id]/diagnosis/route";
import { GET as getEvaluation } from "@/app/api/sessions/[id]/evaluation/route";
import { POST as startAvatarRoute } from "@/app/api/sessions/[id]/avatar/route";
import { GET as fillerRoute } from "@/app/api/sessions/[id]/filler/route";
import { GET as replyAudio } from "@/app/api/sessions/[id]/messages/[messageId]/audio/route";
import { POST as transcribeRoute } from "@/app/api/speech/transcribe/route";
import { resetConfigForTests } from "@/lib/config";
import { wavFromPcm } from "@/lib/speech/chimege";
import { hashPassword } from "@/lib/auth/session";
import { DEMO_CASE_SOURCES, loadDemoCase } from "@/lib/cases/demo";
import { eq } from "drizzle-orm";
import { createPgliteDb, getDb, setDbForTests } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { setPatientProviderForTests } from "@/lib/patient/providers";
import { MockPatientProvider } from "@/lib/patient/providers/mock";
import type { PatientProvider } from "@/lib/patient/providers/types";
import { resetRateLimits } from "@/lib/rate-limit";
import { seedDemoCases } from "@/lib/services/cases";

const BASE = "http://localhost:3000";

function req(path: string, init: { method?: string; body?: unknown; cookie?: string; raw?: string } = {}) {
  return new Request(`${BASE}${path}`, {
    method: init.method ?? (init.body !== undefined || init.raw !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) },
    body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const noCtx = undefined as unknown;

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(/pq_session=([^;]+)/);
  if (!match) throw new Error("no session cookie");
  return `pq_session=${match[1]}`;
}

async function signUp(email: string): Promise<string> {
  const response = await register(req("/api/auth/register", { body: { name: "Оюутан", email, password: "password123" } }), noCtx);
  expect(response.status).toBe(201);
  return cookieFrom(response);
}

let studentCookie: string;
let otherStudentCookie: string;
let adminCookie: string;

beforeAll(async () => {
  const db = await createPgliteDb("memory");
  setDbForTests(db);
  setPatientProviderForTests(new MockPatientProvider());
  await seedDemoCases();
  await db.insert(users).values({ email: "admin@test.mn", name: "Админ", role: "admin", passwordHash: await hashPassword("adminpass123") });
  studentCookie = await signUp("student@test.mn");
  otherStudentCookie = await signUp("other@test.mn");
  const adminLogin = await login(req("/api/auth/login", { body: { email: "admin@test.mn", password: "adminpass123" } }), noCtx);
  expect(adminLogin.status).toBe(200);
  adminCookie = cookieFrom(adminLogin);
});

beforeEach(() => resetRateLimits());

async function newSession(caseId = "chest-pain-01", cookie = studentCookie): Promise<string> {
  const response = await startSession(req("/api/sessions", { body: { caseId }, cookie }), noCtx);
  expect(response.status).toBe(201);
  return (await response.json()).sessionId;
}

async function ask(sessionId: string, content: string, cookie = studentCookie) {
  const response = await sendMessage(req(`/api/sessions/${sessionId}/messages`, { body: { content }, cookie }), ctx(sessionId));
  return { status: response.status, body: await response.json() };
}

describe("authentication", () => {
  it("limits login attempts per client across many accounts", async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) {
      last = (await login(req("/api/auth/login", { body: { email: `spray${i}@test.mn`, password: "wrongpass" } }), noCtx)).status;
    }
    expect(last).toBe(429);
  });

  it("rejects wrong passwords with a generic message", async () => {
    const response = await login(req("/api/auth/login", { body: { email: "student@test.mn", password: "wrong-password" } }), noCtx);
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("буруу");
  });

  it("requires login for case listing", async () => {
    expect((await listCases(req("/api/cases"), noCtx)).status).toBe(401);
  });

  it("rejects a tampered session cookie", async () => {
    const response = await listCases(req("/api/cases", { cookie: "pq_session=Fe26.2**forged" }), noCtx);
    expect(response.status).toBe(401);
  });
});

describe("13. students never receive the private case", () => {
  it("case list exposes only public fields", async () => {
    const response = await listCases(req("/api/cases", { cookie: studentCookie }), noCtx);
    const text = await response.text();
    expect(response.status).toBe(200);
    for (const forbidden of ['"hidden"', '"rubric"', '"facts"', '"diagnosis"', '"acceptedAliases"', "шигдээс", "мухар олгой", "хатгалгаа"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(JSON.parse(text).cases).toHaveLength(3);
  });

  it("an active session view contains no hidden data", async () => {
    const id = await newSession();
    await ask(id, "Хэзээнээс өвдсөн бэ?");
    const response = await getSession(req(`/api/sessions/${id}`, { cookie: studentCookie }), ctx(id));
    const text = await response.text();
    const chest = loadDemoCase("chest-pain-01");
    expect(text).not.toContain('"hidden"');
    expect(text).not.toContain(chest.hidden.diagnosis.label.mn);
    expect(text).not.toContain('"topics"');
    expect(text).not.toContain("disclosedFactIds");
    for (const fact of chest.hidden.facts.filter((f) => f.id !== "onset")) expect(text).not.toContain(fact.answer.mn);
    const view = JSON.parse(text).session;
    expect(view.evaluation).toBeNull();
    expect(view.provider.isDemo).toBe(true);
  });

  it("other students cannot read or write someone else's session", async () => {
    const id = await newSession();
    expect((await getSession(req(`/api/sessions/${id}`, { cookie: otherStudentCookie }), ctx(id))).status).toBe(404);
    expect((await ask(id, "Тамхи татдаг уу?", otherStudentCookie)).status).toBe(404);
  });
});

describe("14. administrative endpoints", () => {
  it("reject anonymous and student users", async () => {
    expect((await adminCases(req("/api/admin/cases"), noCtx)).status).toBe(401);
    expect((await adminCases(req("/api/admin/cases", { cookie: studentCookie }), noCtx)).status).toBe(403);
    const create = await adminCreateCase(req("/api/admin/cases", { body: { case: DEMO_CASE_SOURCES[0] }, cookie: studentCookie }), noCtx);
    expect(create.status).toBe(403);
    expect((await adminTrainingExport(req("/api/admin/training/export", { cookie: studentCookie }), noCtx)).status).toBe(403);
  });

  it("allow administrators", async () => {
    const response = await adminCases(req("/api/admin/cases", { cookie: adminCookie }), noCtx);
    expect(response.status).toBe(200);
    expect((await response.json()).cases.length).toBeGreaterThanOrEqual(3);
  });

  it("a demoted admin's old cookie can no longer read other users' sessions", async () => {
    const db = await getDb();
    await db.insert(users).values({ email: "former@test.mn", name: "Хуучин админ", role: "admin", passwordHash: await hashPassword("formerpass123") });
    const formerCookie = cookieFrom(await login(req("/api/auth/login", { body: { email: "former@test.mn", password: "formerpass123" } }), noCtx));
    const id = await newSession();
    expect((await getSession(req(`/api/sessions/${id}`, { cookie: formerCookie }), ctx(id))).status).toBe(200);

    await db.update(users).set({ role: "student" }).where(eq(users.email, "former@test.mn"));
    expect((await getSession(req(`/api/sessions/${id}`, { cookie: formerCookie }), ctx(id))).status).toBe(404);
  });
});

describe("15. case import validation", () => {
  it("returns per-item validation errors with field paths", async () => {
    const broken = JSON.parse(JSON.stringify(DEMO_CASE_SOURCES[0]));
    broken.id = "imported-broken-01";
    delete broken.rubric;
    const response = await adminImport(req("/api/admin/cases/import", { raw: JSON.stringify([broken]), cookie: adminCookie }), noCtx);
    expect(response.status).toBe(400);
    const { report } = await response.json();
    expect(report.failed[0].id).toBe("imported-broken-01");
    expect(report.failed[0].issues.some((i: { path: string }) => i.path === "rubric")).toBe(true);
  });

  it("reports malformed JSON clearly", async () => {
    const response = await adminImport(req("/api/admin/cases/import", { raw: "{ not json", cookie: adminCookie }), noCtx);
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("JSON");
  });

  it("imports valid cases as drafts", async () => {
    const copy = JSON.parse(JSON.stringify(DEMO_CASE_SOURCES[1]));
    copy.id = "abdominal-pain-02";
    const response = await adminImport(req("/api/admin/cases/import", { raw: JSON.stringify({ cases: [copy] }), cookie: adminCookie }), noCtx);
    expect(response.status).toBe(200);
    expect((await response.json()).report.created).toEqual(["abdominal-pain-02"]);
    const list = await (await listCases(req("/api/cases", { cookie: studentCookie }), noCtx)).json();
    expect(list.cases.map((c: { id: string }) => c.id)).not.toContain("abdominal-pain-02");
  });
});

describe("16. a full interview in mock mode, without external services", () => {
  it("runs from case selection to feedback", async () => {
    const id = await newSession("abdominal-pain-01");
    const initial = await (await getSession(req(`/api/sessions/${id}`, { cookie: studentCookie }), ctx(id))).json();
    expect(initial.session.messages).toHaveLength(1);
    expect(initial.session.messages[0].content).toBe("Сайн байна уу, эмч ээ. Гэдэс өвдөөд байна.");

    for (const q of ["Хэзээнээс өвдөж эхэлсэн бэ?", "Яг хаана өвдөж байна?", "Хоолны дуршил ямар байна? Дотор муухайрсан уу?", "Халуурсан уу?", "Сарын тэмдэг хэзээ ирсэн бэ?", "Үзлэг хийе"]) {
      const { status, body } = await ask(id, q);
      expect(status).toBe(201);
      expect(body.messages[0].role).toBe("student");
      expect(body.messages[1].role).toBe("patient");
    }

    const diagnosis = await submitDiagnosis(
      req(`/api/sessions/${id}/diagnosis`, { body: { diagnosis: "Мухар олгойн цочмог үрэвсэл", reasoning: "Өвдөлт шилжсэн, халуурсан" }, cookie: studentCookie }),
      ctx(id),
    );
    expect(diagnosis.status).toBe(201);
    const { evaluation } = await diagnosis.json();
    expect(evaluation.result.diagnosis.verdict).toBe("correct");
    expect(evaluation.result.totalScore).toBeGreaterThan(50);
    expect(evaluation.result.totalScore).toBeLessThan(100);
    expect(evaluation.result.items.find((i: { id: string }) => i.id === "lmp-pregnancy").covered).toBe(true);
    expect(evaluation.result.items.find((i: { id: string }) => i.id === "urinary").covered).toBe(false);

    // The interview is closed after submission.
    expect((await ask(id, "Тамхи татдаг уу?")).status).toBe(409);
    const again = await submitDiagnosis(req(`/api/sessions/${id}/diagnosis`, { body: { diagnosis: "x y" }, cookie: studentCookie }), ctx(id));
    expect(again.status).toBe(409);

    // Feedback and history are available afterwards.
    const feedback = await getEvaluation(req(`/api/sessions/${id}/evaluation`, { cookie: studentCookie }), ctx(id));
    expect(feedback.status).toBe(200);
    const history = await (await listSessions(req("/api/sessions", { cookie: studentCookie }), noCtx)).json();
    const summary = history.sessions.find((s: { id: string }) => s.id === id);
    expect(summary.status).toBe("completed");
    expect(summary.totalScore).toBe(evaluation.result.totalScore);

    // Admin approves the transcript as training data and exports it.
    const approve = await approveTraining(req(`/api/admin/sessions/${id}/training`, { body: { status: "approved" }, cookie: adminCookie }), ctx(id));
    expect(approve.status).toBe(200);
    const exported = await (await adminTrainingExport(req("/api/admin/training/export", { cookie: adminCookie }), noCtx)).text();
    const record = JSON.parse(exported.trim().split("\n")[0]);
    expect(record.caseId).toBe("abdominal-pain-01");
    expect(record.turns.length).toBe(6);
  });

  it("validates questions and diagnosis input", async () => {
    const id = await newSession();
    expect((await ask(id, "   ")).status).toBe(400);
    expect((await ask(id, "а".repeat(501))).status).toBe(400);
    const bad = await submitDiagnosis(req(`/api/sessions/${id}/diagnosis`, { body: { diagnosis: "" }, cookie: studentCookie }), ctx(id));
    expect(bad.status).toBe(400);
  });

  it("rate limits rapid questions", async () => {
    const id = await newSession();
    let limited = false;
    for (let i = 0; i < 25 && !limited; i++) limited = (await ask(id, "Тамхи татдаг уу?")).status === 429;
    expect(limited).toBe(true);
  });
});

describe("17. model-provider failures", () => {
  it("fall back to templates and keep the interview working", async () => {
    const failing: PatientProvider = {
      id: "gemini",
      model: "broken",
      label: "broken",
      async generate() {
        throw new Error("network down");
      },
      async health() {
        return { ok: false, provider: "gemini", model: "broken", detail: "down" };
      },
    };
    setPatientProviderForTests(failing);
    try {
      const id = await newSession();
      const { status, body } = await ask(id, "Тамхи татдаг уу?");
      expect(status).toBe(201);
      expect(body.messages[1].content).toContain("татаж");
      // The badge must not claim the configured model answered.
      expect(body.provider.isDemo).toBe(true);
      expect(body.provider.label).toContain("хариулсангүй");
      const view = await (await getSession(req(`/api/sessions/${id}`, { cookie: studentCookie }), ctx(id))).json();
      expect(view.session.provider.isDemo).toBe(true);
    } finally {
      setPatientProviderForTests(new MockPatientProvider());
    }
  });
});

describe("voice features (Chimege speech, Simli avatar)", () => {
  const VOICE_ENV = { CHIMEGE_STT_TOKEN: "stt-test", CHIMEGE_TTS_TOKEN: "tts-test", SIMLI_API_KEY: "simli-test", SIMLI_FACE_ID_MALE: "face-m", SIMLI_FACE_ID_FEMALE: "face-f" };
  const wav = () => wavFromPcm(new Uint8Array(3200)); // 0.1 s of silence, 16 kHz
  const audioCtx = (id: string, messageId: string) => ({ params: Promise.resolve({ id, messageId }) });
  let calls: { url: string; init?: RequestInit }[];

  function useVoiceEnv() {
    Object.assign(process.env, VOICE_ENV);
    resetConfigForTests();
    calls = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/transcribe")) return new Response("Хэзээнээс өвдсөн бэ?");
      if (url.includes("/synthesize")) return new Response(wav());
      if (url.includes("simli")) return Response.json({ session_token: "simli-session" });
      return new Response("unexpected", { status: 500 });
    });
  }

  afterEach(() => {
    for (const key of Object.keys(VOICE_ENV)) delete process.env[key];
    resetConfigForTests();
    vi.unstubAllGlobals();
  });

  async function patientReplyId(id: string): Promise<string> {
    const { body } = await ask(id, "Тамхи татдаг уу?");
    return body.messages.find((m: { role: string }) => m.role === "patient").id;
  }

  it("is off without keys: speech endpoints answer 503, text interview unaffected", async () => {
    const id = await newSession();
    const transcribe = await transcribeRoute(new Request(`${BASE}/api/speech/transcribe`, { method: "POST", body: wav(), headers: { cookie: studentCookie } }), noCtx);
    expect(transcribe.status).toBe(503);
    expect((await ask(id, "Тамхи татдаг уу?")).status).toBe(201);
  });

  it("transcribes a 16 kHz WAV and rejects other uploads", async () => {
    useVoiceEnv();
    const ok = await transcribeRoute(new Request(`${BASE}/api/speech/transcribe`, { method: "POST", body: wav(), headers: { cookie: studentCookie } }), noCtx);
    expect(ok.status).toBe(200);
    expect((await ok.json()).text).toBe("Хэзээнээс өвдсөн бэ?");
    const bad = await transcribeRoute(new Request(`${BASE}/api/speech/transcribe`, { method: "POST", body: "not audio", headers: { cookie: studentCookie } }), noCtx);
    expect(bad.status).toBe(400);
    const anonymous = await transcribeRoute(new Request(`${BASE}/api/speech/transcribe`, { method: "POST", body: wav() }), noCtx);
    expect(anonymous.status).toBe(401);
  });

  it("voices only the owner's patient replies, once per reply", async () => {
    useVoiceEnv();
    const id = await newSession();
    const replyId = await patientReplyId(id);

    const first = await replyAudio(req(`/api/sessions/${id}/messages/${replyId}/audio`, { cookie: studentCookie }), audioCtx(id, replyId));
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("audio/wav");
    await replyAudio(req(`/api/sessions/${id}/messages/${replyId}/audio`, { cookie: studentCookie }), audioCtx(id, replyId));
    expect(calls.filter((c) => c.url.includes("/synthesize"))).toHaveLength(1);
    // Male patient → male voice.
    expect((calls[0].init?.headers as Record<string, string>)["voice-id"]).toBe("MALE1v2");

    // Another student cannot get it, not even through their own session id.
    const otherId = await newSession("chest-pain-01", otherStudentCookie);
    expect((await replyAudio(req(`/api/sessions/${id}/messages/${replyId}/audio`, { cookie: otherStudentCookie }), audioCtx(id, replyId))).status).toBe(404);
    expect((await replyAudio(req(`/api/sessions/${otherId}/messages/${replyId}/audio`, { cookie: otherStudentCookie }), audioCtx(otherId, replyId))).status).toBe(404);

    // Student messages are never synthesized.
    const view = await (await getSession(req(`/api/sessions/${id}`, { cookie: studentCookie }), ctx(id))).json();
    const studentMsg = view.session.messages.find((m: { role: string }) => m.role === "student");
    expect((await replyAudio(req(`/api/sessions/${id}/messages/${studentMsg.id}/audio`, { cookie: studentCookie }), audioCtx(id, studentMsg.id))).status).toBe(404);
  });

  it("voices a reply sentence by sentence and caches hesitation sounds", async () => {
    useVoiceEnv();
    const id = await newSession("abdominal-pain-01");
    const { body } = await ask(id, "Хэзээнээс өвдөж эхэлсэн бэ?");
    const reply = body.messages.find((m: { role: string }) => m.role === "patient");

    const first = await replyAudio(req(`/api/sessions/${id}/messages/${reply.id}/audio?part=0`, { cookie: studentCookie }), audioCtx(id, reply.id));
    expect(first.status).toBe(200);
    const parts = Number(first.headers.get("x-speech-parts"));
    expect(parts).toBeGreaterThanOrEqual(1);
    const outOfRange = await replyAudio(req(`/api/sessions/${id}/messages/${reply.id}/audio?part=${parts}`, { cookie: studentCookie }), audioCtx(id, reply.id));
    expect(outOfRange.status).toBe(404);
    // Each part is synthesized from its own sentence, not the whole reply.
    const sent = calls.filter((c) => c.url.includes("/synthesize")).map((c) => String(c.init?.body));
    expect(sent[0].length).toBeLessThanOrEqual(reply.content.length);

    const before = calls.length;
    for (let i = 0; i < 2; i++) {
      const filler = await fillerRoute(req(`/api/sessions/${id}/filler?i=1`, { cookie: studentCookie }), ctx(id));
      expect(filler.status).toBe(200);
    }
    expect(calls.length - before).toBe(1); // synthesized once, then cached
    expect((calls.at(-1)?.init?.headers as Record<string, string>)["voice-id"]).toBe("FEMALE3v2");
    expect((await fillerRoute(req(`/api/sessions/${id}/filler?i=9`, { cookie: studentCookie }), ctx(id))).status).toBe(400);
    expect((await fillerRoute(req(`/api/sessions/${id}/filler?i=0`, { cookie: otherStudentCookie }), ctx(id))).status).toBe(404);
  });

  it("issues avatar tokens only for the owner's active session", async () => {
    useVoiceEnv();
    const id = await newSession();
    const ok = await startAvatarRoute(req(`/api/sessions/${id}/avatar`, { body: {}, cookie: studentCookie }), ctx(id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).sessionToken).toBe("simli-session");
    const simli = calls.find((c) => c.url.includes("simli"));
    expect(JSON.parse(String(simli?.init?.body)).faceId).toBe("face-m");
    expect((await startAvatarRoute(req(`/api/sessions/${id}/avatar`, { body: {}, cookie: otherStudentCookie }), ctx(id))).status).toBe(404);
  });
});
