/**
 * Emergency cases played as a sequence of decisions («Яаралтай тохиолдол»),
 * ported from the iOS app (ios/OtochAI/Scenario.swift) so both play the same
 * cases. Built-in and offline. Clinical content follows standard ABCDE / ATLS /
 * ACS / anaphylaxis guidance and must still be reviewed by a clinician-teacher
 * before real teaching use. Safe to import from client components.
 */
import type { UserRole } from "../role";

export type SceneKind = "roadAccident" | "emergencyRoom" | "clinic";
export type OptionGrade = "best" | "ok" | "wrong" | "harmful";

export interface Vitals {
  hr: number;
  sys: number;
  dia: number;
  spo2: number;
  rr: number;
  gcs: number;
}

export interface ScenarioOption {
  id: string;
  text: string;
  grade: OptionGrade;
  feedback: string;
  effect: Partial<Vitals>;
}

export interface ScenarioStep {
  id: string;
  /** ABCDE letter or phase label shown as a chip. */
  phase: string;
  situation: string;
  question: string;
  /** Things you find when tapping the patient in the scene during this step. */
  findings: string[];
  options: ScenarioOption[];
  /** Seconds before the clock turns red (speed counts in emergencies). */
  timeLimit: number;
}

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  scene: SceneKind;
  /** 1…3 */
  difficulty: number;
  minutes: number;
  /** Who it is written for first (the app's older health roles). */
  roles: string[];
  briefing: string;
  patient: string;
  start: Vitals;
  steps: ScenarioStep[];
  /** Knowledge article ids to read after playing. */
  learnMore: string[];
  /** Topic sent to «Сорил» from the debrief. */
  quizTopic: string;
}

/** Rough severity 0 (stable) … 1 (peri-arrest) for colouring the monitor and scene. */
export function danger(v: Vitals): number {
  let d = 0;
  if (v.hr > 120 || v.hr < 50) d += 0.25;
  if (v.sys < 90) d += 0.3;
  if (v.spo2 < 90) d += 0.3;
  if (v.rr > 28 || v.rr < 8) d += 0.15;
  if (v.gcs < 13) d += 0.2;
  return Math.min(1, d);
}

export function applyEffect(v: Vitals, e: Partial<Vitals>): Vitals {
  return {
    hr: Math.max(0, v.hr + (e.hr ?? 0)),
    sys: Math.max(0, v.sys + (e.sys ?? 0)),
    dia: Math.max(0, v.dia + (e.dia ?? 0)),
    spo2: Math.min(100, Math.max(50, v.spo2 + (e.spo2 ?? 0))),
    rr: Math.max(0, v.rr + (e.rr ?? 0)),
    gcs: Math.min(15, Math.max(3, v.gcs + (e.gcs ?? 0))),
  };
}

export const POINTS: Record<OptionGrade, number> = { best: 10, ok: 5, wrong: 0, harmful: -5 };

/** 0…100: points over the maximum, minus 2 per step answered after its time limit. */
export function scoreOf(scenario: Scenario, choices: Record<string, ScenarioOption>, overtime: number): number {
  const max = scenario.steps.length * 10;
  const points = scenario.steps.reduce((sum, s) => sum + (choices[s.id] ? POINTS[choices[s.id].grade] : 0), 0) - overtime * 2;
  return Math.max(0, Math.min(100, Math.round((points / max) * 100)));
}

const accident: Scenario = {
  id: "accident",
  title: "Зам тээврийн осол",
  subtitle: "Цээжний гэмтэл, цус алдалт",
  scene: "roadAccident",
  difficulty: 3,
  minutes: 6,
  roles: ["ems", "doctor", "student", "nurse"],
  briefing:
    "Шөнийн 22:40. Хотын захын замд хоёр машин мөргөлдсөн. Та түргэн тусламжийн багийн хамт хамгийн түрүүнд ирлээ. Жолооч машинаас гарсан, замын хажууд суугаад амьсгаадаж байна.",
  patient: "Эрэгтэй, 34 настай, жолооч. Цээжээрээ жолоонд цохигдсон.",
  start: { hr: 118, sys: 104, dia: 68, spo2: 91, rr: 26, gcs: 15 },
  steps: [
    {
      id: "a1",
      phase: "Хэргийн газар",
      situation: "Машинаас бензин үнэртэж, хажуугаар машинууд хурдтай өнгөрч байна. Өвчтөн тань руу гараа даллаж байна.",
      question: "Хамгийн түрүүнд юу хийх вэ?",
      findings: ["Замын хөдөлгөөн зогсоогүй", "Бензин үнэртэнэ", "Өвчтөн ухаантай, ярьж байна"],
      options: [
        {
          id: "a1a",
          text: "Хэргийн газрын аюулгүй байдлыг хангаж (хөдөлгөөн зогсоох, тэмдэг тавих, хөдөлгүүр унтраах), хамгаалах хэрэгсэл өмсөөд ойртох",
          grade: "best",
          feedback: "Зөв. Аварч буй хүн өөрөө гэмтвэл хоёр өвчтөн болно. Аюулгүй байдал үргэлж эхэнд.",
          effect: {},
        },
        {
          id: "a1b",
          text: "Шууд гүйж очоод өвчтөнийг үзэх",
          grade: "wrong",
          feedback: "Хөдөлгөөнтэй зам, шатах эрсдэлтэй үед баг өөрөө аюулд орно. Эхлээд хэргийн газрыг аюулгүй болго.",
          effect: {},
        },
        {
          id: "a1c",
          text: "Өвчтөнийг босгоод машин руу дагуулж явах",
          grade: "harmful",
          feedback: "Нуруу, хүзүүний гэмтэл байж болзошгүй өвчтөнийг үзлэггүйгээр хөдөлгөж болохгүй.",
          effect: { hr: 6, sys: -6, spo2: -1 },
        },
      ],
      timeLimit: 25,
    },
    {
      id: "a2",
      phase: "A · Амьсгалын зам",
      situation: "Хэргийн газар аюулгүй боллоо. Өвчтөн хэдэн үгээр ярьж, амьсгаадаж байна. Хүзүүгээ гэмтээсэн байж болзошгүй.",
      question: "Амьсгалын замыг яаж үнэлж, хамгаалах вэ?",
      findings: ["Ярьж байгаа: амьсгалын зам нээлттэй", "Аманд цус, бөөлжис алга", "Хүзүүний ар өвдөж байна"],
      options: [
        {
          id: "a2a",
          text: "Хүзүүг гараар тогтворжуулж (хүзүүвч), ярьж байгаагаас амьсгалын зам нээлттэйг тогтоох, хүчилтөрөгч маскаар өгч эхлэх",
          grade: "best",
          feedback: "Зөв. Ярьж байгаа бол амьсгалын зам нээлттэй. Хүзүүг хамгаалах, өндөр урсгалтай O₂ өгөх нь энэ үеийн гол алхам.",
          effect: { spo2: 2 },
        },
        {
          id: "a2b",
          text: "Даруй интубаци хийх",
          grade: "wrong",
          feedback: "Ухаантай, ярьж буй өвчтөнд одоогоор интубаци шаардлагагүй. Цаг алдаж, эрсдэл нэмнэ.",
          effect: { hr: 4 },
        },
        {
          id: "a2c",
          text: "Толгойг нь ухраан эрүүг өргөх (head tilt) аргаар амьсгалын зам нээх",
          grade: "harmful",
          feedback: "Хүзүүний гэмтэл сэжигтэй үед толгой ухраах аргыг хэрэглэдэггүй. Шаардлагатай бол зөвхөн эрүү түлхэх (jaw thrust).",
          effect: { hr: 4 },
        },
      ],
      timeLimit: 25,
    },
    {
      id: "a3",
      phase: "B · Амьсгал",
      situation: "Амьсгаадалт хурдан дордож байна. Баруун талд амьсгалын чимээ сонсогдохгүй, гуурсан хоолой зүүн тийш хэлбийсэн, хүзүүний венүүд хавдсан.",
      question: "Юу болж байна, яаралтай юу хийх вэ?",
      findings: ["Баруун талд амьсгалын чимээ алга", "Тогшилтоор баруун тал хэнгэрэгэн", "Гуурсан хоолой зүүн тийш хэлбийсэн", "Хүзүүний вен хавдсан"],
      options: [
        {
          id: "a3a",
          text: "Даралт ихэссэн пневмоторакс: баруун талд яаралтай зүүгээр задлах (эрх бүхий бол), өндөр урсгалтай O₂ үргэлжлүүлэх",
          grade: "best",
          feedback:
            "Зөв. Даралт ихэссэн пневмоторакс бол эмнэлзүйн онош. Рентген хүлээхгүйгээр даруй задлах ёстой (ATLS: 4–5-р хавирга хоорондын зай, суганы урд шугам).",
          effect: { hr: -14, sys: 14, dia: 8, spo2: 6, rr: -6 },
        },
        {
          id: "a3b",
          text: "Оношийг батлахаар рентген зураг хүлээх",
          grade: "harmful",
          feedback: "Даралт ихэссэн пневмоторакс минутын дотор зүрх зогсоож болно. Рентген хүлээх нь үхэлд хүргэх саатал.",
          effect: { hr: 16, sys: -18, dia: -10, spo2: -6, rr: 4 },
        },
        {
          id: "a3c",
          text: "Өвдөлт намдаах морфин тарих",
          grade: "wrong",
          feedback: "Морфин амьсгалыг дарангуйлж, даралтыг бууруулна. Шалтгааныг нь засах хэрэгтэй.",
          effect: { hr: 6, sys: -8, spo2: -3, rr: -2 },
        },
        {
          id: "a3d",
          text: "Хүчилтөрөгчийн урсгалыг нэмээд ажиглах",
          grade: "ok",
          feedback: "O₂ хэрэгтэй ч дангаараа хангалтгүй. Механик шалтгааныг (даралтыг) гаргахгүй бол дордсоор байна.",
          effect: { hr: 6, sys: -6, spo2: 1 },
        },
      ],
      timeLimit: 30,
    },
    {
      id: "a4",
      phase: "C · Цусны эргэлт",
      situation: "Амьсгал сайжирлаа. Гэвч арьс цайвар, хүйтэн хөлстэй. Хэвлийн зүүн дээд хэсэг өвдөж, тэмтрэхэд чангарсан.",
      question: "Цусны эргэлтийг тогтворжуулах дараагийн алхам?",
      findings: ["Хялгасан судасны дүүрэлт 4 секунд", "Хэвлийн зүүн дээд хэсэг эмзэглэлтэй", "Гадна цус алдалт алга"],
      options: [
        {
          id: "a4a",
          text: "Том голчтой 2 судас тавьж, цус авах (бүлэг, тохироо), шингэнийг болгоомжтой өгөх, цус сэлбэлт бэлдэж, мэс заслын багийг дуудах",
          grade: "best",
          feedback: "Зөв. Дотор цус алдалтын эцсийн эмчилгээ нь мэс засал. Шингэнийг хэтрүүлэхгүй, цус ба мэс засал руу хурдан шилжүүлэх нь чухал.",
          effect: { hr: -8, sys: 8, dia: 6 },
        },
        {
          id: "a4b",
          text: "Даралт хэвийн болтол 3 литр давсны уусмал хурдан дусаах",
          grade: "wrong",
          feedback: "Их хэмжээний кристаллоид цусыг шингэлж, бүлэгнэлтийг муутгаж, цус алдалтыг ихэсгэдэг.",
          effect: { hr: 4, sys: 6, spo2: -2 },
        },
        {
          id: "a4c",
          text: "Өвдөлтийн учир эхлээд хэвлийн CT хийлгэх",
          grade: "harmful",
          feedback: "Тогтворгүй өвчтөнийг CT руу явуулдаггүй. Тогтворжуулж, орон дээрх FAST шинжилгээ ба мэс засал руу шилжинэ.",
          effect: { hr: 14, sys: -14, dia: -8 },
        },
      ],
      timeLimit: 30,
    },
    {
      id: "a5",
      phase: "D · Мэдрэл",
      situation: "Өвчтөн нүдээ нээж, асуултад хариулж байгаа ч бага зэрэг будилж байна.",
      question: "Мэдрэлийн үнэлгээнд юу хийх вэ?",
      findings: ["Глазго 14 (Н4 Х4 Х6)", "Хүүхэн хараа тэгш, гэрэлд урвалтай", "Мөчдөө хөдөлгөж байна"],
      options: [
        {
          id: "a5a",
          text: "Глазгогийн оноо, хүүхэн хараа шалгаж, цусан дахь сахар хэмжих",
          grade: "best",
          feedback: "Зөв. Будилал нь гипокси, шок, гипогликеми эсвэл тархины гэмтлээс болж болно. Сахарыг үргэлж шалга.",
          effect: {},
        },
        {
          id: "a5b",
          text: "Тайвшруулах эм тарих",
          grade: "harmful",
          feedback: "Шалтгаан тодорхойгүй будилалд тайвшруулах эм өгвөл мэдрэлийн үнэлгээг нууж, амьсгалыг дарна.",
          effect: { sys: -6, spo2: -3, rr: -4, gcs: -2 },
        },
        {
          id: "a5c",
          text: "Будилал нь цочролоос болсон гэж үзээд алгасах",
          grade: "wrong",
          feedback: "Будилалыг тайлбарлахгүйгээр алгасаж болохгүй.",
          effect: {},
        },
      ],
      timeLimit: 20,
    },
    {
      id: "a6",
      phase: "E · Ил гаргах · Шийдвэр",
      situation: "Хувцсыг тайлж бусад гэмтлийг шалгалаа. Өвчтөн чичирч байна. Хамгийн ойрын эмнэлэг 10 минут, гэмтлийн төв 25 минутын зайтай.",
      question: "Эцсийн шийдвэр?",
      findings: ["Нурууны дагуу эмзэглэл алга", "Бие хүйтэн", "Даралт тогтворгүй хэвээр"],
      options: [
        {
          id: "a6a",
          text: "Хөнжлөөр дулаалж, гэмтлийн төв рүү урьдчилан мэдэгдэж (ATMIST), замдаа ABCDE-г давтан хянах",
          grade: "best",
          feedback: "Зөв. Гипотерми бүлэгнэлтийг муутгадаг. Мэс заслын тусламж үзүүлэх төв рүү урьдчилан мэдэгдэж тээвэрлэх нь амь аварна.",
          effect: { hr: -4, sys: 4 },
        },
        {
          id: "a6b",
          text: "Хамгийн ойрын жижиг эмнэлэг рүү мэдэгдэлгүй хүргэх",
          grade: "ok",
          feedback: "Ойр ч мэс засал хийх боломжгүй бол дахин шилжүүлэлтэд цаг алдана. Урьдчилан мэдэгдэх нь заавал.",
          effect: { hr: 4, sys: -4 },
        },
        {
          id: "a6c",
          text: "Хэргийн газар 20 минут үлдэж бүрэн үзлэг хийх",
          grade: "wrong",
          feedback: 'Дотор цус алдаж буй өвчтөнд хэргийн газар удах нь аюултай. "Алтан цаг"-ийг санаарай.',
          effect: { hr: 10, sys: -10, dia: -6 },
        },
      ],
      timeLimit: 25,
    },
  ],
  learnMore: ["abcde", "respiratory", "shock"],
  quizTopic: "Гэмтлийн анхан шатны үнэлгээ (ABCDE), даралт ихэссэн пневмоторакс, цус алдалтын шок",
};

const chestPain: Scenario = {
  id: "chestpain",
  title: "Цээжний хурц өвдөлт",
  subtitle: "Зүрхний шигдээс, зүрх зогсох",
  scene: "emergencyRoom",
  difficulty: 2,
  minutes: 5,
  roles: ["doctor", "student", "nurse", "ems"],
  briefing: "Яаралтай тусламжийн тасаг, өглөөний 07:50. Эрэгтэй хүн цээжээ барьсаар орж ирлээ. Өвдөлт 40 минутын өмнө машинаа халааж байхад эхэлсэн.",
  patient: "Эрэгтэй, 58 настай, тамхи татдаг, даралт ихтэй.",
  start: { hr: 96, sys: 150, dia: 92, spo2: 95, rr: 20, gcs: 15 },
  steps: [
    {
      id: "c1",
      phase: "Эхний 10 минут",
      situation: "Өвдөлт цээжний голд, шахаж базсан мэт, зүүн гар ба эрүү рүү дамжиж, хүйтэн хөлс гарч байна.",
      question: "Ирснээс хойш 10 минутад заавал хийх зүйл?",
      findings: ["Хүйтэн хөлстэй", "Өвдөлт 8/10", "Зүүн гар руу дамжина"],
      options: [
        {
          id: "c1a",
          text: "12 холболттой ЗЦБ (ЭКГ) хийж, монитор залгах, судас тавих",
          grade: "best",
          feedback: "Зөв. Цээжний өвдөлттэй хүнд ирснээс 10 минутад ЗЦБ хийж уншина.",
          effect: {},
        },
        {
          id: "c1b",
          text: "Тропонины хариу гарахыг хүлээх",
          grade: "wrong",
          feedback: "ST өргөгдсөн шигдээсийг тропонин хүлээлгүй ЗЦБ-ээр оношилно. Хүлээх нь булчинг үхүүлнэ.",
          effect: { hr: 6 },
        },
        {
          id: "c1c",
          text: "Ходоодны үрэвсэл гэж үзээд антацид өгөх",
          grade: "harmful",
          feedback: "Ердийн бус шинжтэй цээжний өвдөлтийг эхлээд зүрхнийх биш гэж үзэх нь аюултай алдаа.",
          effect: { hr: 8 },
        },
      ],
      timeLimit: 25,
    },
    {
      id: "c2",
      phase: "Онош",
      situation: "ЗЦБ: II, III, aVF холболтод ST сегмент 3 мм өргөгдсөн, I, aVL-д доошилсон.",
      question: "Энэ юу вэ?",
      findings: ["II, III, aVF: ST ↑ 3 мм", "I, aVL: ST ↓ (толин дүрс)"],
      options: [
        {
          id: "c2a",
          text: "Доод ханын ST өргөгдсөн миокардын шигдээс (STEMI)",
          grade: "best",
          feedback: "Зөв. Зэргэлдээ 2 холболтод ST өргөгдөж, толин дүрстэй байгаа нь доод ханын шигдээс.",
          effect: {},
        },
        {
          id: "c2b",
          text: "Перикардит",
          grade: "wrong",
          feedback: "Перикардитад ST олон холболтод тархмал, хонхор хэлбэртэй өргөгдөж, толин дүрс ихэвчлэн байдаггүй.",
          effect: {},
        },
        {
          id: "c2c",
          text: "Тогтворгүй стенокарди, яаралтай зүйлгүй",
          grade: "harmful",
          feedback: "ST өргөгдөлт бол хамгийн яаралтай онош. Цаг алдвал зүрхний булчин үхнэ.",
          effect: { hr: 6 },
        },
      ],
      timeLimit: 25,
    },
    {
      id: "c3",
      phase: "Эмчилгээ",
      situation: "Даралт 150/92, SpO₂ 95%. Харшилгүй. Сүүлийн хоногт бэлгийн сулралын эм уугаагүй.",
      question: "Эхний эмчилгээ?",
      findings: ["Аспиринд харшилгүй", "SpO₂ 95%"],
      options: [
        {
          id: "c3a",
          text: "Аспирин зажилж уулгах, PCI багийг (катетерийн лаборатори) яаралтай идэвхжүүлэх",
          grade: "best",
          feedback: 'Зөв. Аспирин ба аль болох хурдан судас нээх (PCI) нь гол эмчилгээ. "Цаг = булчин".',
          effect: { hr: -4 },
        },
        {
          id: "c3b",
          text: "SpO₂ 95% ч заавал хүчилтөрөгч өгөх",
          grade: "ok",
          feedback: "SpO₂ 90%-иас дээш үед хүчилтөрөгчийг тогтмол өгөх ашиггүй. Гол эмчилгээ нь судас нээх.",
          effect: {},
        },
        {
          id: "c3c",
          text: "Өвдөлт намдсаны дараа маргааш кардиологич үзүүлэх",
          grade: "harmful",
          feedback: "STEMI-д хүлээх цаг байхгүй. Яаралтай PCI хэрэгтэй.",
          effect: { hr: 8, sys: -8 },
        },
      ],
      timeLimit: 25,
    },
    {
      id: "c4",
      phase: "Зүрх зогсолт",
      situation: "Гэнэт өвчтөн ухаан алдлаа. Монитор дээр эмх замбараагүй долгион, судасны лугшилт алга.",
      question: "Юу хийх вэ?",
      findings: ["Ухаангүй, амьсгал алга", "Монитор: ховдолын фибрилляци", "Каротид лугшилт алга"],
      options: [
        {
          id: "c4a",
          text: "Тусламж дуудаж, цээжийг даруй шахаж, дефибриллятороор шок өгөх, дараа нь шахалтаа шууд үргэлжлүүлэх",
          grade: "best",
          feedback: "Зөв. Ховдолын фибрилляцид эрт шок ба тасралтгүй, чанартай цээж шахалт л амь аварна.",
          effect: { hr: -6, sys: 10, spo2: 3, gcs: 2 },
        },
        {
          id: "c4b",
          text: "Эхлээд судсаар адреналин тарих",
          grade: "wrong",
          feedback: "Шок өгөх хэмнэлд эхний алхам нь шок ба цээж шахалт. Адреналиныг 3 дахь шокийн дараа өгнө.",
          effect: { sys: -10, spo2: -4 },
        },
        {
          id: "c4c",
          text: "Лугшилтыг 1 минут шалгаж батлах",
          grade: "harmful",
          feedback: "Лугшилт шалгахад 10 секундээс илүү зарцуулахгүй. Минут бүр амьд үлдэх магадлалыг бууруулна.",
          effect: { sys: -14, spo2: -6, gcs: -2 },
        },
      ],
      timeLimit: 15,
    },
  ],
  learnMore: ["cardio", "bls", "ecg"],
  quizTopic: "ST өргөгдсөн миокардын шигдээс (STEMI), ЗЦБ унших, зүрхний амилуулалт",
};

const anaphylaxis: Scenario = {
  id: "anaphylaxis",
  title: "Тарилгын дараах харшил",
  subtitle: "Анафилакси",
  scene: "clinic",
  difficulty: 2,
  minutes: 4,
  roles: ["nurse", "student", "ems", "doctor"],
  briefing: "Эмнэлгийн тарилгын өрөө. 22 настай эмэгтэйд антибиотик тарьснаас 5 минутын дараа арьс загатнаж, хоолой нь хүндэрч эхэллээ.",
  patient: "Эмэгтэй, 22 настай. Өмнө нь харшлын түүхгүй гэж хэлсэн.",
  start: { hr: 124, sys: 86, dia: 50, spo2: 92, rr: 26, gcs: 15 },
  steps: [
    {
      id: "n1",
      phase: "Таних",
      situation: "Бүх биеэр улайж тууралт гарсан, уруул хавдаж, исгэрсэн амьсгалтай, толгой эргэж байна.",
      question: "Юу болж байна, хамгийн түрүүнд юу хийх вэ?",
      findings: ["Уруул, нүүр хавдсан", "Исгэрсэн амьсгал", "Арьсанд чонон хөрвөс"],
      options: [
        {
          id: "n1a",
          text: "Анафилакси: тарилгыг зогсоож, тусламж (эмч, яаралтай баг) дуудах",
          grade: "best",
          feedback: "Зөв. Амьсгалын зам/амьсгал/цусны эргэлтийн өөрчлөлт + арьсны шинж = анафилакси. Шалтгааныг зогсоож тусламж дууд.",
          effect: {},
        },
        {
          id: "n1b",
          text: "Энгийн харшил гэж үзээд антигистамин уулгаад ажиглах",
          grade: "harmful",
          feedback: "Даралт буурч, исгэрэх амьсгалтай бол энэ анафилакси. Антигистамин амь аврахгүй.",
          effect: { hr: 8, sys: -10, spo2: -3 },
        },
        {
          id: "n1c",
          text: "Өвчтөнийг гэрт нь харьж амрахыг зөвлөх",
          grade: "harmful",
          feedback: "Анафилакси минутын дотор амь насанд аюул учруулна.",
          effect: { hr: 10, sys: -14, spo2: -4 },
        },
      ],
      timeLimit: 20,
    },
    {
      id: "n2",
      phase: "Эм",
      situation: "Эмч ирэх замдаа. Анафилаксийн багц таны гарт байна.",
      question: "Хамгийн чухал эм ба зам?",
      findings: ["Жин ~60 кг", "Адреналин 1 мг/мл ампул бэлэн"],
      options: [
        {
          id: "n2a",
          text: "Адреналин 0.5 мг (1 мг/мл-ээс 0.5 мл) гуяны гадна талын булчинд",
          grade: "best",
          feedback: "Зөв. Насанд хүрэгчдэд адреналин 0.5 мг булчинд, гуяны урд-гадна тал. 5 минутын дараа сайжрахгүй бол давтана.",
          effect: { hr: -10, sys: 18, dia: 10, spo2: 4, rr: -6 },
        },
        {
          id: "n2b",
          text: "Адреналин 1 мг судсаар хурдан тарих",
          grade: "harmful",
          feedback: "Шингэлээгүй адреналинийг судсаар хурдан тарих нь хэм алдагдал, шигдээс үүсгэж болно. Булчинд тарина.",
          effect: { hr: 30, sys: 30 },
        },
        {
          id: "n2c",
          text: "Дексаметазон судсаар тарих",
          grade: "wrong",
          feedback: "Стероид хурдан нөлөөлдөггүй, эхний эм биш. Адреналин эхэнд.",
          effect: { sys: -6, spo2: -2 },
        },
      ],
      timeLimit: 20,
    },
    {
      id: "n3",
      phase: "Байрлал · Дэмжих",
      situation: "Адреналины дараа бага зэрэг сайжирсан. Өвчтөн босож суух гэж оролдож байна.",
      question: "Дараагийн алхам?",
      findings: ["Даралт бага хэвээр", "Амьсгал арай хөнгөрсөн"],
      options: [
        {
          id: "n3a",
          text: "Хэвтүүлж хөлийг өргөх (амьсгал давчдвал хагас сууж), өндөр урсгалтай O₂, судас тавьж шингэн, монитор",
          grade: "best",
          feedback: "Зөв. Гэнэт босгох нь даралтыг огцом бууруулж зүрх зогсоож болно.",
          effect: { hr: -6, sys: 8, spo2: 2 },
        },
        {
          id: "n3b",
          text: "Босгож алхуулан ариун цэврийн өрөө рүү дагуулах",
          grade: "harmful",
          feedback: "Анафилаксийн үед босгох, алхуулах нь аюултай.",
          effect: { hr: 12, sys: -16 },
        },
      ],
      timeLimit: 20,
    },
    {
      id: "n4",
      phase: "Мэдээлэх (SBAR)",
      situation: "Эмч утсаар холбогдлоо. Товч, ойлгомжтой мэдээлэх хэрэгтэй.",
      question: "Эмчид хэрхэн мэдээлэх вэ?",
      findings: ["Адреналин 0.5 мг булчинд 08:12-т", "Даралт 98/60, SpO₂ 95%"],
      options: [
        {
          id: "n4a",
          text: "SBAR: нөхцөл (анафилакси), түүх (антибиотик тариулсан), үнэлгээ (амин үзүүлэлт, өгсөн эм, цаг), хүсэлт (яаралтай ирэх, дараагийн эмчилгээ)",
          grade: "best",
          feedback: "Зөв. SBAR бүтэц мэдээлэл алдагдахаас сэргийлдэг.",
          effect: {},
        },
        {
          id: "n4b",
          text: '"Өвчтөн муу байна, ирээрэй" гэж хэлэх',
          grade: "ok",
          feedback: "Эмч ирэх ч юу өгсөн, хэдэн цагт гэх мэт чухал мэдээлэл дутна.",
          effect: {},
        },
      ],
      timeLimit: 25,
    },
    {
      id: "n5",
      phase: "Ажиглалт",
      situation: "Өвчтөн сайжирч, тууралт багасав. Тэр гэр лүүгээ явмаар байгаагаа хэллээ.",
      question: "Юу гэж зөвлөх вэ?",
      findings: ["Шинж тэмдэг багассан", "Хоёр дахь давалгаа (biphasic) эрсдэлтэй"],
      options: [
        {
          id: "n5a",
          text: "Хоёр дахь давалгааны эрсдэлээс болж эмнэлэгт ажиглуулах, харшлыг картад тэмдэглэж, адреналин үзэг ба харшлын эмчид үзүүлэхийг зөвлөх",
          grade: "best",
          feedback: "Зөв. Анафилакси хэдэн цагийн дараа дахин сэдэрч болно. Харшлыг бүртгэх нь дараагийн удаа амь аварна.",
          effect: {},
        },
        {
          id: "n5b",
          text: "Сайжирсан тул гэрт нь явуулах",
          grade: "wrong",
          feedback: "Хоёр дахь давалгаа гэртээ эхэлбэл тусламжгүй үлдэнэ.",
          effect: { hr: 6 },
        },
      ],
      timeLimit: 20,
    },
  ],
  learnMore: ["anaphylaxis", "abcde", "sbar"],
  quizTopic: "Анафилакси: таних, адреналин, SBAR мэдээлэл",
};

export const SCENARIOS: Scenario[] = [accident, chestPain, anaphylaxis];

export const findScenario = (id: string) => SCENARIOS.find((s) => s.id === id);

/** Health roles see the emergency cases and medical knowledge on «Нүүр». */
export const isMedical = (role: UserRole | null) => role === "health";

/** The case of the day: changes daily. */
export function dailyScenario(date = new Date()): Scenario {
  const day = Math.floor(date.getTime() / 86_400_000);
  return SCENARIOS[day % SCENARIOS.length];
}
