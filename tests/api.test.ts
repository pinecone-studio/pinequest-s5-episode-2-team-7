import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { GET as coachPacks } from "@/app/api/coach/packs/route";
import { GET as coachResults } from "@/app/api/coach/results/route";
import { GET as listTeams, POST as createTeamRoute } from "@/app/api/teams/route";
import { POST as joinTeamRoute } from "@/app/api/teams/join/route";
import { POST as createChallengeRoute } from "@/app/api/teams/[id]/challenges/route";
import { POST as transcribeRoute } from "@/app/api/speech/transcribe/route";
import { POST as coachTurn } from "@/app/api/coach/turn/route";
import { GET as modelRoute } from "@/app/api/coach/model/route";
import { resetModelStatusForTests } from "@/lib/coach/model-patient";
import { renderMockReply } from "@/lib/patient/providers/mock";
import { setPatientProviderForTests } from "@/lib/patient/providers";
import type { PatientProvider } from "@/lib/patient/providers/types";
import { resetConfigForTests } from "@/lib/config";
import { wavFromPcm } from "@/lib/speech/chimege";
import { hashPassword, sealSession } from "@/lib/auth/session";
import { createPgliteDb, setDbForTests } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { resetRateLimits } from "@/lib/rate-limit";

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

async function signUp(email: string, name = "Ажилтан"): Promise<string> {
  const response = await register(req("/api/auth/register", { body: { name, email, password: "password123" } }), noCtx);
  expect(response.status).toBe(201);
  return cookieFrom(response);
}

let managerCookie: string;
let staffCookie: string;

beforeAll(async () => {
  const db = await createPgliteDb("memory");
  setDbForTests(db);
  await db.insert(users).values({ email: "admin@test.mn", name: "Админ", role: "admin", passwordHash: await hashPassword("adminpass123") });
  managerCookie = await signUp("manager@test.mn", "Менежер");
  staffCookie = await signUp("staff@test.mn");
});

beforeEach(() => resetRateLimits());

describe("authentication", () => {
  it("limits login attempts per client across many accounts", async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) {
      last = (await login(req("/api/auth/login", { body: { email: `spray${i}@test.mn`, password: "wrongpass" } }), noCtx)).status;
    }
    expect(last).toBe(429);
  });

  it("rejects wrong passwords with a generic message", async () => {
    const response = await login(req("/api/auth/login", { body: { email: "staff@test.mn", password: "wrong-password" } }), noCtx);
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("буруу");
  });

  it("requires login for the coach", async () => {
    expect((await coachPacks(req("/api/coach/packs"), noCtx)).status).toBe(401);
    expect((await coachResults(req("/api/coach/results"), noCtx)).status).toBe(401);
  });

  it("rejects a tampered session cookie", async () => {
    const response = await coachPacks(req("/api/coach/packs", { cookie: "pq_session=Fe26.2**forged" }), noCtx);
    expect(response.status).toBe(401);
  });

  it("treats a valid cookie for a user that no longer exists as signed out", async () => {
    // e.g. a cookie issued by the local database before switching to Neon
    const cookie = `pq_session=${await sealSession({ userId: "99444504-f1da-4066-95e0-067c7dde09da", role: "student", name: "Оюутан" })}`;
    const response = await coachResults(req("/api/coach/results", { cookie }), noCtx);
    expect(response.status).toBe(401);
  });
});

describe("AI дасгалжуулагч and Баг", () => {
  it("lists the built-in personas", async () => {
    const response = await coachPacks(req("/api/coach/packs", { cookie: staffCookie }), noCtx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.builtin.length).toBeGreaterThan(0);
    // Hidden facts and rules never leave the server.
    expect(body.builtin[0]).not.toHaveProperty("hidden");
    expect(body.builtin[0]).not.toHaveProperty("rules");
  });

  it("a manager creates a team, staff join by code and see the challenge", async () => {
    const created = await createTeamRoute(req("/api/teams", { body: { name: "Нарны эмнэлэг" }, cookie: managerCookie }), noCtx);
    expect(created.status).toBe(200);
    const { team } = await created.json();

    const overview = await (await listTeams(req("/api/teams", { cookie: managerCookie }), noCtx)).json();
    const code = overview.teams[0].code as string;
    expect(code).toMatch(/^[A-Z0-9]{4,12}$/);

    const joined = await joinTeamRoute(req("/api/teams/join", { body: { code: code.toLowerCase() }, cookie: staffCookie }), noCtx);
    expect(joined.status).toBe(200);

    const challenge = await createChallengeRoute(
      req(`/api/teams/${team.id}/challenges`, { body: { packRef: "callcenter", targetScore: 80 }, cookie: managerCookie }),
      ctx(team.id),
    );
    expect(challenge.status).toBe(200);

    // Staff cannot hand out challenges, and see the team without its code.
    const denied = await createChallengeRoute(req(`/api/teams/${team.id}/challenges`, { body: { packRef: "callcenter" }, cookie: staffCookie }), ctx(team.id));
    expect(denied.status).toBeGreaterThanOrEqual(400);
    const staffView = await (await listTeams(req("/api/teams", { cookie: staffCookie }), noCtx)).json();
    expect(staffView.teams[0].code).toBeNull();
    expect(staffView.teams[0].challenges[0]).toMatchObject({ packRef: "callcenter", targetScore: 80, passed: false });
  });
});

describe("speech", () => {
  const wav = () => wavFromPcm(new Uint8Array(3200)); // 0.1 s of silence, 16 kHz

  afterEach(() => {
    delete process.env.CHIMEGE_STT_TOKEN;
    resetConfigForTests();
    vi.unstubAllGlobals();
  });

  it("is off without keys", async () => {
    const response = await transcribeRoute(new Request(`${BASE}/api/speech/transcribe`, { method: "POST", body: wav(), headers: { cookie: staffCookie } }), noCtx);
    expect(response.status).toBe(503);
  });

  it("transcribes a 16 kHz WAV and rejects other uploads", async () => {
    process.env.CHIMEGE_STT_TOKEN = "stt-test";
    resetConfigForTests();
    vi.stubGlobal("fetch", async () => new Response("Сайн байна уу"));
    const ok = await transcribeRoute(new Request(`${BASE}/api/speech/transcribe`, { method: "POST", body: wav(), headers: { cookie: staffCookie } }), noCtx);
    expect(ok.status).toBe(200);
    expect((await ok.json()).text).toBe("Сайн байна уу");
    const bad = await transcribeRoute(new Request(`${BASE}/api/speech/transcribe`, { method: "POST", body: "not audio", headers: { cookie: staffCookie } }), noCtx);
    expect(bad.status).toBe(400);
    const anonymous = await transcribeRoute(new Request(`${BASE}/api/speech/transcribe`, { method: "POST", body: wav() }), noCtx);
    expect(anonymous.status).toBe(401);
  });
});

describe("«Манай AI өвчтөн»: our fine-tuned model in the coach", () => {
  /** Stands in for the Modal service: answers in the trained format with reviewed case wording. */
  function stubModel(up: boolean): PatientProvider & { calls: number } {
    return {
      id: "finetuned",
      model: "pq-qwen3-4b-lora-v2",
      label: "Fine-tuned (test)",
      calls: 0,
      async generate(ctx) {
        this.calls++;
        return renderMockReply(ctx);
      },
      async health() {
        return { ok: up, provider: "finetuned", model: "pq-qwen3-4b-lora-v2", detail: up ? "ok" : "workspace is disabled" };
      },
    };
  }

  async function turn(question: string) {
    const history = [
      { role: "ai", text: "Эмч ээ, өглөө сэрэхэд толгой өвдөөд байна.", t: 0 },
      { role: "me", text: question, t: 4 },
    ];
    const response = await coachTurn(req("/api/coach/turn", { body: { packRef: "case-headache-dizziness-01", mode: "audio", history }, cookie: staffCookie }), noCtx);
    expect(response.status).toBe(200);
    return (await response.text()).trim().split("\n").map((l) => JSON.parse(l) as { t: string; v?: string; text?: string });
  }

  afterEach(() => {
    setPatientProviderForTests(null);
    resetModelStatusForTests();
  });

  it("lists the demo cases as model packs and resolves them", async () => {
    const body = await (await coachPacks(req("/api/coach/packs", { cookie: staffCookie }), noCtx)).json();
    expect(body.model.length).toBeGreaterThanOrEqual(10);
    expect(body.model.map((p: { id: string }) => p.id)).toContain("case-headache-dizziness-01");
    // The diagnosis never reaches the browser.
    expect(JSON.stringify(body.model)).not.toContain("Угаарын хийн");
  });

  it("answers with our model, through the trained prompt pipeline, and says so", async () => {
    const model = stubModel(true);
    setPatientProviderForTests(model);
    expect(await (await modelRoute(req("/api/coach/model", { cookie: staffCookie }), noCtx)).json()).toMatchObject({ ok: true });
    const events = await turn("Хэзээнээс өвдөж эхэлсэн бэ?");
    expect(events[0]).toEqual({ t: "src", v: "model" });
    expect(events.filter((e) => e.t === "say").map((e) => e.text).join(" ")).toContain("өглөө");
    expect(events.at(-1)?.t).toBe("done");
    expect(model.calls).toBe(1);
  });

  it("hands the turn to Claude when our model is down", async () => {
    const model = stubModel(false);
    setPatientProviderForTests(model);
    expect(await (await modelRoute(req("/api/coach/model", { cookie: staffCookie }), noCtx)).json()).toMatchObject({ ok: false });
    const events = await turn("Хэзээнээс өвдөж эхэлсэн бэ?");
    expect(events[0]).toEqual({ t: "src", v: "claude" });
    expect(model.calls).toBe(0);
  });
});

