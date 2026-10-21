/**
 * Two scripted cases for the offline demo (/demo). They run entirely in the
 * browser — no server, database or model — so a stage demo survives a dead
 * network. They are separate from the real cases, whose answers never reach
 * the browser.
 */
import type { RubricCategory } from "@/lib/cases/schema";
import type { PublicCase } from "@/lib/views";

export interface OfflineIntent {
  id: string;
  patterns: RegExp[];
  reply: string;
  /** Examination findings are shown as a narrator note. */
  narrator?: boolean;
}

export interface OfflineRubricItem {
  id: string;
  label: string;
  category: RubricCategory;
  critical: boolean;
  weight: number;
  intents: string[];
  rationale: string;
  suggestedQuestion: string;
}

export interface OfflineCase {
  public: PublicCase;
  opening: string;
  intents: OfflineIntent[];
  fallback: string;
  diagnosis: { label: string; en: string; aliases: string[]; explanation: string };
  differentials: { label: string; aliases: string[]; rationale: string }[];
  rubric: OfflineRubricItem[];
  findings: { intent: string; text: string; significance: string }[];
  learningPoints: string[];
  summary: string;
  emergencyNote?: string;
}

const chestPain: OfflineCase = {
  public: {
    id: "offline-chest-pain",
    version: 1,
    displayTitle: { mn: "Цээжний хүчтэй өвдөлт", en: "Severe chest pain" },
    specialty: "Зүрх судас",
    difficulty: "intermediate",
    tags: ["яаралтай"],
    setting: { mn: "Яаралтай тусламжийн тасаг, өглөө 9 цаг" },
    patient: { name: "Батбаяр", age: 58, sex: "male", occupation: { mn: "Такси жолооч" } },
    chiefComplaint: { mn: "Цээжээр хүчтэй өвдөх" },
    initialVitals: { bloodPressure: "158/94", heartRate: 108, respiratoryRate: 22, temperatureC: 36.8, spo2: 94 },
    estimatedMinutes: 10,
    timeCritical: true,
    synthetic: true,
  },
  opening: "Эмч ээ, цээж маш их өвдөөд байна…",
  fallback: "Уучлаарай, эмч ээ, сайн ойлгосонгүй. Өөрөөр асууж болох уу?",
  intents: [
    { id: "exam", narrator: true, patterns: [/үзлэг|чагна|үзье|үзэж болох|шинжил|экг|ekg/], reply: "Үзлэг: арьс цайвар, хүйтэн чийглэг хөлстэй. Зүрхний авиа бүдэг, хэм жигд, түргэссэн. Уушгинд хэржигнүүр сонсогдохгүй. Хөл хавангүй." },
    { id: "radiation", patterns: [/дамж|тарх|өөр газар|гар руу|эрүү|нуруу руу/], reply: "Тийм ээ, зүүн гар, эрүү рүү дамжаад байх шиг байна." },
    { id: "onset", patterns: [/хэзээ|хэдийн|эхэлс|хэдэн цаг|гэнэт/], reply: "Өнөө өглөө 7 цагийн орчим машинаа халааж байхад гэнэт эхэлсэн. Хоёр цаг гаруй болж байна." },
    { id: "location", patterns: [/хаана|аль хэсэг|байрла|хаагуур/], reply: "Цээжний яг голд, өвчүүний ард өвдөж байна." },
    { id: "character", patterns: [/ямар өвд|яаж өвд|ямар мэдрэмж|шинж|хатгу|базал|дар/], reply: "Хүнд юм дарчихсан юм шиг, базалж өвдөж байна." },
    { id: "severity", patterns: [/хэр хүчтэй|хүч|оноо|10|арав/], reply: "Араваас ес гэж хэлнэ. Ийм их өвдөж байгаагүй." },
    { id: "relief", patterns: [/амра|намд|багас|дорд|хөдөл/], reply: "Амраад ч багасахгүй байна. Юу ч уугаагүй." },
    { id: "sweating", patterns: [/хөлр|хөлс|дотор муу|бөөлж|амьсгаа|толгой эргэ/], reply: "Хүйтэн хөлс их гараад, дотор муухайрч байна. Бага зэрэг амьсгаадаж байна." },
    { id: "prior", patterns: [/өмнө нь ийм|урьд нь ийм|шат|алхах|ачаал/], reply: "Сүүлийн сард шатаар өгсөхөд цээж давчдаад, амраад өнгөрдөг байсан." },
    { id: "fever", patterns: [/ханиа|халуу|чичр/], reply: "Үгүй, ханиад, халуун байхгүй." },
    { id: "history", patterns: [/өвчтэй|даралт|чихрийн|холестер|архаг|оношлогд/], reply: "Даралт ихсэлттэй гэж хэлсэн, гэхдээ эмээ тогтмол уудаггүй. Чихрийн шижин байхгүй." },
    { id: "meds", patterns: [/(^|\s)эм(\s|$|[?.,])|эмүүд|харшил|уудаг эм/], reply: "Даралтын эм заримдаа уудаг, нэрийг нь санахгүй байна. Харшилгүй." },
    { id: "smoking", patterns: [/тамхи/], reply: "Тийм ээ, гучаад жил, өдөрт нэг хайрцаг татаж байна." },
    { id: "alcohol", patterns: [/архи|согтуу/], reply: "Баяр ёслолоор л бага зэрэг уудаг." },
    { id: "family", patterns: [/аав|ээж|гэр бүл|удам|төрөл/], reply: "Аав маань 60 гараад зүрхний өвчнөөр гэнэт нас барсан." },
    { id: "job", patterns: [/ажил|мэргэж/], reply: "Такси жолооч хийдэг. Өдөржин машин дотор суудаг." },
    { id: "greeting", patterns: [/сайн байна|сайн уу|юу болсон|юугаар зов|яасан|ямар зовиур/], reply: "Сайн байна уу, эмч ээ. Цээжний голоор хүчтэй өвдөөд, дарагдаад байна." },
  ],
  diagnosis: {
    label: "Зүрхний шигдээс (миокардын хурц шигдээс)",
    en: "Acute myocardial infarction",
    aliases: ["шигдээс", "миокард", "mi", "stemi", "nstemi", "myocardial infarction", "heart attack", "титэм судасны хурц", "acute coronary", "ачх", "ачс"],
    explanation:
      "Ачааллын бус үед гэнэт эхэлсэн, 20 минутаас урт үргэлжилж буй, дарж базалсан цээжний өвдөлт зүүн гар, эрүү рүү дамжиж, хүйтэн хөлс, дотор муухайралттай хавсарч байна. Тамхи, хяналтгүй даралт ихсэлт, удамшлын эрсдэл бүгд титэм судасны хурц хам шинжийг дэмжинэ.",
  },
  differentials: [
    { label: "Гол судасны ханын ховхролт", aliases: ["ховхрол", "aortic dissection", "диссекц"], rationale: "Урагдаж буй мэт, нуруу руу дамжсан өвдөлт, гарын даралтын зөрүү байвал сэжиглэнэ." },
    { label: "Уушгины артерийн тромбоэмболи", aliases: ["тромбоэмболи", "pulmonary embol", "тэла"], rationale: "Гэнэтийн амьсгаадалт, амьсгалахад хатгах өвдөлт, хөлийн венийн тромбоз зэрэг шинжтэй." },
    { label: "Тогтворгүй бах", aliases: ["бах", "angina"], rationale: "Өвдөлт богино, тайван үед намддаг бол; энд 2 цагаас урт үргэлжилж байна." },
  ],
  rubric: [
    { id: "onset", label: "Өвдөлтийн эхлэл, хугацаа", category: "hpi", critical: true, weight: 2, intents: ["onset"], rationale: "20 минутаас урт өвдөлт шигдээсийг сэжиглэх гол шалгуур.", suggestedQuestion: "Өвдөлт хэзээ, юу хийж байхад эхэлсэн бэ?" },
    { id: "character", label: "Өвдөлтийн шинж", category: "hpi", critical: false, weight: 1, intents: ["character", "location"], rationale: "Дарж, базалсан өвдөлт ишемийн шинжтэй.", suggestedQuestion: "Өвдөлт ямар мэдрэмжтэй байна — дарж, хатгаж уу?" },
    { id: "radiation", label: "Дамжилт", category: "hpi", critical: true, weight: 2, intents: ["radiation"], rationale: "Зүүн гар, эрүү рүү дамжих нь зүрхний гаралтай өвдөлтийг заана.", suggestedQuestion: "Өвдөлт өөр газар руу дамжиж байна уу?" },
    { id: "severity", label: "Хүч ба намдах эсэх", category: "hpi", critical: false, weight: 1, intents: ["severity", "relief"], rationale: "Амрахад намдахгүй өвдөлт бахаас ялгагдана.", suggestedQuestion: "Амрахад өвдөлт багасаж байна уу?" },
    { id: "sweating", label: "Хүйтэн хөлс, дотор муухайрах", category: "red_flags", critical: true, weight: 2, intents: ["sweating"], rationale: "Вегетатив шинж — хүнд ишемийн аюулын дохио.", suggestedQuestion: "Хөлрөх, дотор муухайрах, амьсгаадах зүйл байна уу?" },
    { id: "prior", label: "Өмнөх ачааллын бах", category: "past_history", critical: false, weight: 1, intents: ["prior"], rationale: "Сүүлийн үеийн ачааллын өвдөлт тогтворгүй бахаас шигдээс рүү шилжсэнийг харуулна.", suggestedQuestion: "Өмнө нь ачаалал өгөхөд ийм өвдөлт гарч байсан уу?" },
    { id: "history", label: "Даралт ихсэлт, чихрийн шижин", category: "risk_factors", critical: true, weight: 2, intents: ["history", "meds"], rationale: "Титэм судасны гол эрсдэлт хүчин зүйлс.", suggestedQuestion: "Даралт ихсэх, чихрийн шижин зэрэг өвчин бий юу?" },
    { id: "smoking", label: "Тамхидалт", category: "risk_factors", critical: true, weight: 2, intents: ["smoking"], rationale: "Тамхи нь шигдээсийн эрсдэлийг 2–3 дахин нэмэгдүүлнэ.", suggestedQuestion: "Тамхи татдаг уу?" },
    { id: "family", label: "Удамшил", category: "family_history", critical: false, weight: 1, intents: ["family"], rationale: "Эрт үеийн зүрхний өвчин гэр бүлд байх нь эрсдэл.", suggestedQuestion: "Гэр бүлд зүрхний өвчтэй хүн бий юу?" },
    { id: "negatives", label: "Халууралт, ханиад (сөрөг)", category: "pertinent_negatives", critical: false, weight: 1, intents: ["fever"], rationale: "Уушгины үрэвсэл, перикардитийг ялгахад тусална.", suggestedQuestion: "Халуурах, ханиах зүйл байна уу?" },
  ],
  findings: [
    { intent: "radiation", text: "Зүүн гар, эрүү рүү дамжаад байх шиг байна.", significance: "Зүрхний гаралтай өвдөлтийн сонгодог дамжилт." },
    { intent: "sweating", text: "Хүйтэн хөлс их гараад, дотор муухайрч байна.", significance: "Хүнд ишемийн вегетатив шинж." },
    { intent: "smoking", text: "Гучаад жил, өдөрт нэг хайрцаг.", significance: "Хүчтэй эрсдэлт хүчин зүйл (30 хайрцаг-жил)." },
    { intent: "history", text: "Даралт ихсэлттэй, эмээ тогтмол уудаггүй.", significance: "Хяналтгүй гипертензи." },
    { intent: "prior", text: "Шатаар өгсөхөд цээж давчдаж байсан.", significance: "Өмнөх тогтворгүй бах." },
    { intent: "family", text: "Аав нь зүрхний өвчнөөр нас барсан.", significance: "Удамшлын эрсдэл." },
  ],
  learningPoints: [
    "Цээжний өвдөлттэй өвчтөнд эхлэл, байршил, шинж, дамжилт, хүч, хугацааг (OPQRST) системтэй асуу.",
    "Хүйтэн хөлс, дотор муухайрал, амьсгаадалт бол аюулын шинж.",
    "Эрсдэлт хүчин зүйлс: тамхи, даралт, чихрийн шижин, холестерин, удамшил.",
    "Шигдээс сэжиглэвэл 10 минутад ЭКГ хийж, цаг алдалгүй эмчилгээ эхлүүл.",
  ],
  summary: "58 настай, тамхи татдаг, хяналтгүй даралттай эрэгтэйд 2 цаг үргэлжилсэн, зүүн гар руу дамжсан дарж өвдөх цээжний өвдөлт — миокардын хурц шигдээсийн сонгодог дүр зураг.",
  emergencyNote: "Бодит нөхцөлд: 103 дуудах, ЭКГ 10 минутад, аспирин (эсрэг заалтгүй бол), хүчилтөрөгч SpO₂ <90% үед, зүрхний эмчид яаралтай шилжүүлэх.",
};

const abdominalPain: OfflineCase = {
  public: {
    id: "offline-abdominal-pain",
    version: 1,
    displayTitle: { mn: "Хэвлийн баруун доод хэсгийн өвдөлт", en: "Right lower abdominal pain" },
    specialty: "Мэс засал",
    difficulty: "beginner",
    tags: [],
    setting: { mn: "Өрхийн эрүүл мэндийн төв, үдээс хойш" },
    patient: { name: "Сараа", age: 22, sex: "female", occupation: { mn: "Оюутан" } },
    chiefComplaint: { mn: "Хэвлийгээр өвдөх" },
    initialVitals: { bloodPressure: "118/76", heartRate: 98, respiratoryRate: 18, temperatureC: 38.1, spo2: 98 },
    estimatedMinutes: 8,
    timeCritical: false,
    synthetic: true,
  },
  opening: "Сайн байна уу… Гэдэс өвдөөд тэвчихээ байлаа.",
  fallback: "Уучлаарай, сайн ойлгосонгүй. Дахиад асууж болох уу?",
  intents: [
    { id: "exam", narrator: true, patterns: [/үзлэг|тэмтр|үзье|үзэж болох|шинжил/], reply: "Үзлэг: хэвлийн баруун доод хэсэгт (МакБерни цэгт) эмзэглэлтэй, булчингийн хамгаалалттай. Щеткин-Блюмбергийн шинж эерэг. Ровзингийн шинж эерэг." },
    { id: "migration", patterns: [/шилж|хаанаас эхэл|эхлээд хаана|байрлал өөрчл/], reply: "Эхлээд хүйсний орчмоор бүдэг өвдөж байгаад, өглөөнөөс баруун доошоо шилжсэн." },
    { id: "onset", patterns: [/хэзээ|хэдийн|эхэлс|хэдэн цаг/], reply: "Өчигдөр орой хүйсний орчмоор бүдэг өвдөж эхлээд, өнөө өглөөнөөс баруун доошоо шилжсэн." },
    { id: "location", patterns: [/хаана|аль хэсэг|аль тал|байрла|хаагуур/], reply: "Одоо баруун доод хэсэгт, яг энд өвдөж байна." },
    { id: "character", patterns: [/ямар өвд|яаж өвд|шинж|хатгу|базал|тасралт|алхах|ханиа/], reply: "Тасралтгүй өвдөж байна. Алхахад, ханиахад улам их өвддөг." },
    { id: "radiation", patterns: [/дамж|тарх|өөр газар/], reply: "Өөр газар руу дамжихгүй байна." },
    { id: "severity", patterns: [/хэр хүчтэй|хүч|оноо|10|арав/], reply: "Араваас долоо орчим." },
    { id: "nausea", patterns: [/хоол|дотор муу|бөөлж|дур/], reply: "Хоолонд дургүй болсон. Өглөө нэг удаа бөөлжсөн." },
    { id: "fever", patterns: [/халуу|чичр|жинд/], reply: "Шөнө бага зэрэг халуурч, жиндэж байсан." },
    { id: "bowel", patterns: [/өтгөн|суулга|бие зас|шээ|хорсо/], reply: "Өтгөн хэвийн, суулгаагүй. Шээхэд хорсохгүй." },
    { id: "menses", patterns: [/сарын|жирэмс|биеийн юм|тэмдэг/], reply: "Сарын тэмдэг 2 долоо хоногийн өмнө ердийнхөөрөө ирсэн. Жирэмсэн байх магадлалгүй гэж бодож байна." },
    { id: "discharge", patterns: [/ялгадас|үтрээ/], reply: "Үгүй, ийм зүйл байхгүй." },
    { id: "history", patterns: [/өмнө нь|өвчтэй|мэс засал|хагалгаа|архаг/], reply: "Өмнө нь хагалгаа хийлгэж, хэвтэж байгаагүй." },
    { id: "meds", patterns: [/(^|\s)эм(\s|$|[?.,])|эмүүд|харшил/], reply: "Өвдөлт намдаах эм уугаагүй. Пенициллинд харшилтай." },
    { id: "social", patterns: [/тамхи|архи/], reply: "Тамхи татдаггүй, архи уудаггүй." },
    { id: "family", patterns: [/аав|ээж|гэр бүл|удам/], reply: "Гэр бүлд онцгой өвчин байхгүй." },
    { id: "job", patterns: [/ажил|сурдаг|сургууль/], reply: "Их сургуулийн оюутан." },
    { id: "greeting", patterns: [/сайн байна|сайн уу|юу болсон|юугаар зов|яасан|ямар зовиур/], reply: "Сайн байна уу. Гэдэсний баруун доод хэсгээр өвдөөд байна." },
  ],
  diagnosis: {
    label: "Мухар олгойн хурц үрэвсэл",
    en: "Acute appendicitis",
    aliases: ["мухар олгой", "аппендицит", "appendicitis", "аппендикс"],
    explanation:
      "Хүйсний орчмоос эхэлж баруун доод хэсэгт шилжсэн өвдөлт, хоолонд дургүйцэл, бөөлжилт, бага зэргийн халууралт нь мухар олгойн хурц үрэвслийн сонгодог дараалал. Сарын тэмдэг хэвийн, шээсний зовиургүй нь ялган оношийг нарийсгана.",
  },
  differentials: [
    { label: "Умайн гадуурх жирэмслэлт", aliases: ["умайн гадуурх", "ectopic"], rationale: "Нөхөн үржихүйн насны эмэгтэйд заавал үгүйсгэнэ — сарын тэмдэг, жирэмсний тест." },
    { label: "Бөөрний чулуу", aliases: ["бөөрний чулуу", "renal colic", "чулуу"], rationale: "Нуруу, цавь руу дамжсан хатгах өвдөлт, шээсэнд цус." },
    { label: "Өндгөвчийн уйланхайн мушгиралт", aliases: ["өндгөвч", "мушгиралт", "ovarian"], rationale: "Гэнэт эхэлсэн, нэг талын хүчтэй өвдөлт." },
  ],
  rubric: [
    { id: "onset", label: "Эхлэл ба шилжилт", category: "hpi", critical: true, weight: 2, intents: ["onset", "migration"], rationale: "Хүйснээс баруун доош шилжих нь мухар олгойн үрэвслийн хамгийн чухал шинж.", suggestedQuestion: "Өвдөлт хаанаас эхэлсэн, одоо хаашаа шилжсэн бэ?" },
    { id: "location", label: "Байршил", category: "hpi", critical: false, weight: 1, intents: ["location"], rationale: "МакБерни цэг дэх өвдөлт.", suggestedQuestion: "Яг хаана өвдөж байна?" },
    { id: "character", label: "Шинж, хөдөлгөөнд нэмэгдэх", category: "hpi", critical: false, weight: 1, intents: ["character", "severity"], rationale: "Хөдлөхөд нэмэгдэх нь гэдэсний гялтангийн цочролыг заана.", suggestedQuestion: "Алхах, ханиахад өвдөлт нэмэгдэж байна уу?" },
    { id: "nausea", label: "Хоолонд дургүйцэл, бөөлжилт", category: "associated_symptoms", critical: true, weight: 2, intents: ["nausea"], rationale: "Анорекси бараг бүх тохиолдолд илэрдэг.", suggestedQuestion: "Хоолонд дуртай байна уу, бөөлжсөн үү?" },
    { id: "fever", label: "Халууралт", category: "associated_symptoms", critical: false, weight: 1, intents: ["fever"], rationale: "Үрэвслийн шинж.", suggestedQuestion: "Халуурч, жиндэж байна уу?" },
    { id: "menses", label: "Сарын тэмдэг, жирэмслэлт", category: "red_flags", critical: true, weight: 2, intents: ["menses"], rationale: "Умайн гадуурх жирэмслэлтийг заавал үгүйсгэнэ.", suggestedQuestion: "Сүүлийн сарын тэмдэг хэзээ ирсэн бэ? Жирэмсэн байх магадлал бий юу?" },
    { id: "bowel", label: "Өтгөн, шээс (сөрөг)", category: "pertinent_negatives", critical: false, weight: 1, intents: ["bowel"], rationale: "Гастроэнтерит, шээсний замын халдварыг ялгана.", suggestedQuestion: "Суулгах, шээхэд хорсох зүйл байна уу?" },
    { id: "meds", label: "Эм ба харшил", category: "medications_allergies", critical: true, weight: 1, intents: ["meds"], rationale: "Пенициллины харшил антибиотик сонголтод нөлөөлнө.", suggestedQuestion: "Ямар нэг эмэнд харшилтай юу?" },
  ],
  findings: [
    { intent: "migration", text: "Хүйсний орчмоос баруун доош шилжсэн.", significance: "Мухар олгойн үрэвслийн сонгодог шилжилт." },
    { intent: "onset", text: "Өчигдөр орой хүйсний орчмоор эхэлсэн.", significance: "Хугацаа ~18 цаг — цоорохоос өмнөх үе." },
    { intent: "nausea", text: "Хоолонд дургүй, нэг удаа бөөлжсөн.", significance: "Анорекси ба бөөлжилт." },
    { intent: "fever", text: "Шөнө халуурч жиндсэн.", significance: "Үрэвслийн хариу урвал." },
    { intent: "menses", text: "Сарын тэмдэг 2 долоо хоногийн өмнө хэвийн ирсэн.", significance: "Умайн гадуурх жирэмслэлтийн магадлал бага." },
    { intent: "meds", text: "Пенициллинд харшилтай.", significance: "Эмчилгээнд анхаарах." },
  ],
  learningPoints: [
    "Хэвлийн өвдөлтийн байршил цаг хугацааны явцад хэрхэн өөрчлөгдсөнийг асуу.",
    "Нөхөн үржихүйн насны эмэгтэйд сарын тэмдэг, жирэмслэлтийг заавал тодруул.",
    "Анорекси, бөөлжилт, халууралт нь мухар олгойн үрэвслийг дэмжинэ (Alvarado оноо).",
    "Харшлын асуумж эмчилгээг аюулгүй болгоно.",
  ],
  summary: "22 настай эмэгтэйд хүйснээс баруун доош шилжсэн өвдөлт, анорекси, бөөлжилт, халууралт — мухар олгойн хурц үрэвслийн сонгодог дүр зураг.",
};

export const OFFLINE_CASES: OfflineCase[] = [chestPain, abdominalPain];

export function findOfflineCase(id: string): OfflineCase | undefined {
  return OFFLINE_CASES.find((c) => c.public.id === id);
}
