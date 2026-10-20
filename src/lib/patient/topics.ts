/**
 * Clinical topic taxonomy shared by the question classifier, the disclosure
 * engine, case authoring, the evaluator and the ML pipeline.
 *
 * A *topic* is what a student's question is about ("onset", "smoking", ...).
 * Case facts are tagged with the topics that may disclose them, and rubric
 * items are satisfied when the student asks about one of their topics.
 *
 * Patterns operate on normalised lower-case text (see `normalizeQuestion`).
 * Mongolian is agglutinative, so most patterns are word stems that match any
 * inflected form (e.g. "амьсга" → амьсгаа, амьсгаадах, амьсгалахад).
 */

export type TopicKind =
  | "hpi" // history of presenting illness (onset, location, ...)
  | "symptom" // presence/absence of a symptom; absent ⇒ negative answer
  | "history" // past medical, medication, family, social history
  | "exam" // examination / vital signs — reported by the narrator, not the patient
  | "meta"; // greeting, diagnosis requests, broad questions...

export interface TopicDefinition {
  id: string;
  kind: TopicKind;
  label: { mn: string; en: string };
  /** Any match makes this topic a candidate. */
  patterns: RegExp[];
  /** If any of these match, this topic is dropped (disambiguation). */
  exclude?: RegExp[];
  /** If any of these topics also matched, this topic is dropped. */
  suppressedBy?: string[];
  /** Patient wording when a `symptom` topic is not present in the case. */
  defaultNegative?: string;
}

const t = (def: TopicDefinition) => def;

/** "When/how long" words inside these questions refer to the history item, not the complaint. */
const HISTORY_TIME_TOPICS = ["lmp", "pregnancy", "smoking", "alcohol", "surgeries", "hospitalizations", "vaccination", "pmh", "hypertension", "diabetes", "hyperlipidemia", "medications", "travel", "sick_contacts", "occupation", "previous_episodes"];

export const TOPICS = [
  // ---------------------------------------------------------------- HPI ----
  t({
    id: "onset",
    kind: "hpi",
    label: { mn: "Эхэлсэн хугацаа", en: "Onset" },
    patterns: [/хэзээ/, /хэзээнээс/, /эхэлс/, /эхлэс/, /эхэлсэн/, /хэдэн (цаг|хоног|өдөр|долоо хоног)/, /\bwhen\b/, /\bstart/, /\bonset\b/, /\bbegan\b/],
    suppressedBy: HISTORY_TIME_TOPICS,
  }),
  t({
    id: "duration",
    kind: "hpi",
    label: { mn: "Үргэлжилсэн хугацаа", en: "Duration" },
    patterns: [/хэр удаа?н/, /хэдий (удаа?н|хугацаа)/, /үргэлж(лэ|ил)/, /тасралт/, /хэдэн минут/, /how long/, /duration/, /constant/],
    suppressedBy: HISTORY_TIME_TOPICS,
  }),
  t({
    id: "location",
    kind: "hpi",
    label: { mn: "Байршил", en: "Location" },
    patterns: [/хаана/, /хаагуур/, /аль (хэсэг|тал|газар)/, /яг хаа/, /хаа(на)? өвд/, /\bwhere\b/, /location/, /заагаад/],
    exclude: [/хаана (ажилла|амьдар|суу)/, /хаана (явс|оч)/],
  }),
  t({
    id: "character",
    kind: "hpi",
    label: { mn: "Өвдөлтийн шинж", en: "Character" },
    patterns: [/ямар (өвдөлт|мэдрэмж|байдлаар|маягаар|шинжтэй)/, /яаж өвд/, /хэрхэн өвд/, /өвдөлт(ий)?н шинж/, /хатгуул/, /базал/, /шахаж/, /дарж байгаа юм шиг/, /describe/, /what (does|is) the pain like/, /character/],
  }),
  t({
    id: "severity",
    kind: "hpi",
    label: { mn: "Хүч, зэрэг", en: "Severity" },
    patterns: [/хэр (хүчтэй|их|хүнд)/, /хэчнээн (хүчтэй|их)/, /10[-\s]?(аас|аар|ын|н)/, /арав(аас|аар|тын)/, /оноо/, /\bscale\b/, /severe/, /severity/, /how bad/],
  }),
  t({
    id: "radiation",
    kind: "hpi",
    label: { mn: "Дамжилт", en: "Radiation" },
    patterns: [/дамж/, /тарх/, /(гар|эрүү|мөр|нуруу|хүзүү) руу/, /өөр (газар|хэсэг|тийш) (руу)?/, /radiat/, /spread/, /move anywhere/],
  }),
  t({
    id: "progression",
    kind: "hpi",
    label: { mn: "Явц", en: "Progression" },
    patterns: [/улам/, /ихэс(ч|сэн|ээд)/, /багас(ч|сан|аад)/, /өөрчлөгд/, /явц/, /нэмэгд/, /getting (worse|better)/, /progress/, /changed/],
    suppressedBy: ["aggravating", "relieving"],
  }),
  t({
    id: "aggravating",
    kind: "hpi",
    label: { mn: "Ихэсгэдэг хүчин зүйл", en: "Aggravating factors" },
    patterns: [/юу(наас)? .*(ихэс|дорд|хүндэр)/, /(хэзээ|ямар үед) .*(ихэс|дорд)/, /(хөдлө|алха|амьсгал|ханиал|хоол ид|идэх|ачаа).*(өвд|ихэс|дорд)/, /worse (when|with)/, /aggravat/, /makes it worse/],
  }),
  t({
    id: "relieving",
    kind: "hpi",
    label: { mn: "Намдаадаг хүчин зүйл", en: "Relieving factors" },
    patterns: [/намд/, /багас(гадаг|даг|дог|ах|на)/, /гайгүй болдог/, /хөнгөр/, /юу(наас)? .*(дээрдэ|зүгээр бол)/, /relie/, /better (when|with)/, /makes it better/, /амрахаар/],
  }),
  t({
    id: "previous_episodes",
    kind: "hpi",
    label: { mn: "Өмнөх ижил тохиолдол", en: "Previous episodes" },
    patterns: [/өмнө нь (ийм|ингэж|иймэрхүү|адилхан)/, /анх удаа/, /урьд нь (ийм|ингэж)/, /давтагд/, /before\??$/, /ever had (this|anything like)/, /first time/, /happened before/],
  }),
  t({
    id: "trigger",
    kind: "hpi",
    label: { mn: "Өдөөгч нөхцөл", en: "Trigger / context" },
    patterns: [/юу хийж (байх|байсан) үед/, /юунаас бол/, /шалтгаа/, /өдөөг/, /what were you doing/, /trigger/],
    suppressedBy: ["aggravating", "relieving"],
  }),

  // ------------------------------------------------------------ symptoms ---
  t({
    id: "chest_pain",
    kind: "symptom",
    label: { mn: "Цээжний өвдөлт", en: "Chest pain" },
    patterns: [/цээж/, /chest pain/, /chest/],
    exclude: [/цээж.*(рентген|зураг)/],
    defaultNegative: "Үгүй, цээж өвдөхгүй байна.",
  }),
  t({
    id: "abdominal_pain",
    kind: "symptom",
    label: { mn: "Хэвлийн өвдөлт", en: "Abdominal pain" },
    patterns: [/гэдэс/, /хэвлий/, /ходоод/, /abdom/, /stomach/, /belly/],
    exclude: [/гэдэс (сайн )?(хөөх|дүүр)/],
    defaultNegative: "Үгүй, гэдэс өвдөхгүй байна.",
  }),
  t({
    id: "headache",
    kind: "symptom",
    label: { mn: "Толгой өвдөх", en: "Headache" },
    patterns: [/толгой өвд/, /headache/],
    defaultNegative: "Үгүй, толгой өвдөхгүй байна.",
  }),
  t({
    id: "back_pain",
    kind: "symptom",
    label: { mn: "Нуруу өвдөх", en: "Back pain" },
    patterns: [/нуруу(гаар|нд)? өвд/, /back pain/],
    suppressedBy: ["radiation"],
    defaultNegative: "Үгүй, нуруу өвдөхгүй байна.",
  }),
  t({
    id: "dyspnea",
    kind: "symptom",
    label: { mn: "Амьсгаадалт", en: "Shortness of breath" },
    patterns: [/амьсгаа?д/, /амьсгаа (давч|бач|хүрэхгүй|хураа)/, /давчд/, /амьсгал(ах)? хэцүү/, /амьсгаа/, /breath/, /dyspn/, /\bsob\b/],
    exclude: [/амьсгал(ах|ахад|аахад|ж байхад) .*өвд/, /амьсгаа (авах|авахад) .*өвд/],
    suppressedBy: ["aggravating"],
    defaultNegative: "Үгүй, амьсгаа давчдахгүй байна.",
  }),
  t({
    id: "sweating",
    kind: "symptom",
    label: { mn: "Хөлрөх", en: "Sweating" },
    patterns: [/хөлө?р/, /хөлс/, /sweat/, /diaphore/],
    suppressedBy: ["night_sweats"],
    defaultNegative: "Үгүй, хөлрөөгүй.",
  }),
  t({
    id: "nausea",
    kind: "symptom",
    label: { mn: "Дотор муухайрах", en: "Nausea" },
    patterns: [/дотор (муу|оги|эвгүй)/, /огиу/, /огиул/, /nause/],
    defaultNegative: "Үгүй, дотор муухайраагүй.",
  }),
  t({
    id: "vomiting",
    kind: "symptom",
    label: { mn: "Бөөлжих", en: "Vomiting" },
    patterns: [/бөөлж/, /vomit/, /throw(n|ing)? up/],
    defaultNegative: "Үгүй, бөөлжөөгүй.",
  }),
  t({
    id: "dizziness",
    kind: "symptom",
    label: { mn: "Толгой эргэх, ухаан алдах", en: "Dizziness / syncope" },
    patterns: [/толгой эрг/, /ухаан (алд|балар)/, /ухаан(аа)? ал/, /харанхуйл/, /унаж (байсан|уна)/, /dizz/, /faint/, /syncop/, /pass(ed)? out/],
    defaultNegative: "Үгүй, толгой эргээгүй, ухаан алдаагүй.",
  }),
  t({
    id: "palpitations",
    kind: "symptom",
    label: { mn: "Зүрх дэлсэх", en: "Palpitations" },
    patterns: [/зүрх (дэлс|хүчтэй цохил|түргэн цохил|хурдан цохил|пал)/, /зүрх.*(цохил|дэлс)/, /palpit/, /heart racing/],
    defaultNegative: "Үгүй, зүрх дэлсэх юм алга.",
  }),
  t({
    id: "fever",
    kind: "symptom",
    label: { mn: "Халуурах", en: "Fever" },
    patterns: [/халуу?р/, /халуун (бай|гар|хэмж)/, /температур/, /fever/, /temperature/],
    exclude: [/температур(ыг)? (хэмжье|хэмжих|үзье)/],
    defaultNegative: "Үгүй, халуураагүй.",
  }),
  t({
    id: "chills",
    kind: "symptom",
    label: { mn: "Жихүүдэс, чичрэх", en: "Chills" },
    patterns: [/жихүүд/, /чичи?р/, /даарч/, /chill/, /rigor/, /shiver/],
    defaultNegative: "Үгүй, чичрээгүй.",
  }),
  t({
    id: "cough",
    kind: "symptom",
    label: { mn: "Ханиалгах", en: "Cough" },
    patterns: [/ханиа/, /cough/],
    suppressedBy: ["aggravating"],
    defaultNegative: "Үгүй, ханиалгахгүй байна.",
  }),
  t({
    id: "sputum",
    kind: "symptom",
    label: { mn: "Цэр", en: "Sputum" },
    patterns: [/цэр/, /sputum/, /phlegm/],
    suppressedBy: ["hemoptysis"],
    defaultNegative: "Үгүй, цэр гарахгүй байна.",
  }),
  t({
    id: "hemoptysis",
    kind: "symptom",
    label: { mn: "Цус ханиах", en: "Haemoptysis" },
    patterns: [/цус(тай)? (ханиа|цэр|гар)/, /цустай/, /hemopty/, /haemopty/, /cough(ing)? (up )?blood/],
    defaultNegative: "Үгүй, цус гараагүй.",
  }),
  t({
    id: "appetite",
    kind: "symptom",
    label: { mn: "Хоолны дуршил", en: "Appetite" },
    patterns: [/дурш/, /хоол (ид|орж|орох)/, /appetite/, /eat(ing)?\b/],
    exclude: [/ямар хоол/, /хооллолт/],
    defaultNegative: "Хоолны дуршил хэвийн.",
  }),
  t({
    id: "diarrhea",
    kind: "symptom",
    label: { mn: "Суулгах", en: "Diarrhoea" },
    patterns: [/суулга/, /шингэн баас/, /diarr/],
    defaultNegative: "Үгүй, суулгаагүй.",
  }),
  t({
    id: "constipation",
    kind: "symptom",
    label: { mn: "Өтгөн хатах", en: "Constipation" },
    patterns: [/өтгөн/, /баас/, /бие засал/, /constipat/, /bowel/, /stool/],
    suppressedBy: ["diarrhea"],
    defaultNegative: "Үгүй, бие засах хэвийн.",
  }),
  t({
    id: "urinary",
    kind: "symptom",
    label: { mn: "Шээсний зовиур", en: "Urinary symptoms" },
    patterns: [/шээ/, /urin/, /pee\b/, /dysuria/],
    defaultNegative: "Үгүй, шээх хэвийн, шээхэд өвддөггүй.",
  }),
  t({
    id: "vaginal_symptoms",
    kind: "symptom",
    label: { mn: "Үтрээний ялгадас, цус", en: "Vaginal discharge / bleeding" },
    patterns: [/үтрээ/, /ялгадас/, /vagina/, /discharge/],
    defaultNegative: "Үгүй, тийм юм байхгүй.",
  }),
  t({
    id: "fatigue",
    kind: "symptom",
    label: { mn: "Ядрах, сульдах", en: "Fatigue" },
    patterns: [/ядар/, /сульд/, /тамир(гүй)?/, /хүч(гүй| тэнхээ)/, /fatigue/, /tired/, /weak/],
    defaultNegative: "Тийм ч их ядраагүй.",
  }),
  t({
    id: "weight_loss",
    kind: "symptom",
    label: { mn: "Жин буурах", en: "Weight loss" },
    patterns: [/(^|\s)жин/, /тура(лт|сан|ж)/, /(^|\s)тур(сан|аад|ж|ах)/, /weight/],
    defaultNegative: "Үгүй, жин хаяагүй.",
  }),
  t({
    id: "night_sweats",
    kind: "symptom",
    label: { mn: "Шөнө хөлрөх", en: "Night sweats" },
    patterns: [/шөнө.*хөлө?р/, /night sweat/],
    defaultNegative: "Үгүй, шөнө хөлрөөгүй.",
  }),
  t({
    id: "leg_swelling",
    kind: "symptom",
    label: { mn: "Хөл хавагнах", en: "Leg swelling" },
    patterns: [/хаван/, /хавд/, /хөл.*(өвд|хаван|хавд|улай)/, /swell/, /oedema/, /edema/, /calf/],
    defaultNegative: "Үгүй, хөл хавдаагүй.",
  }),
  t({
    id: "rash",
    kind: "symptom",
    label: { mn: "Тууралт", en: "Rash" },
    patterns: [/туур/, /арьс/, /\brash\b/],
    suppressedBy: ["allergies"],
    defaultNegative: "Үгүй, тууралт гараагүй.",
  }),
  t({
    id: "jaundice",
    kind: "symptom",
    label: { mn: "Шарлах", en: "Jaundice" },
    patterns: [/шарл/, /нүд шар/, /jaundice/, /yellow/],
    defaultNegative: "Үгүй, шарлаагүй.",
  }),
  t({
    id: "trauma",
    kind: "symptom",
    label: { mn: "Гэмтэл", en: "Trauma / injury" },
    patterns: [/гэмт/, /бэрт/, /унас/, /цохиулс/, /осол/, /injur/, /trauma/, /fall\b/, /fell\b/],
    defaultNegative: "Үгүй, унаж бэртээгүй, гэмтээгүй.",
  }),

  // ------------------------------------------------------------- history ---
  t({
    id: "pmh",
    kind: "history",
    label: { mn: "Өмнөх өвчин", en: "Past medical history" },
    patterns: [/(өмнө нь|урьд нь) .*(өвч|өвд(ө|ж) байсан|эмнэлэгт)/, /(архаг|байнгын) өвчин/, /ямар нэг(эн)? өвчин/, /эрүүл мэндийн асуудал/, /past medical/, /medical history/, /medical conditions/, /chronic/],
    suppressedBy: ["previous_episodes"],
  }),
  t({
    id: "hypertension",
    kind: "history",
    label: { mn: "Артерийн даралт ихсэх", en: "Hypertension" },
    patterns: [/даралт/, /hypertens/, /blood pressure/],
    suppressedBy: ["vitals", "family_history"],
  }),
  t({
    id: "diabetes",
    kind: "history",
    label: { mn: "Чихрийн шижин", en: "Diabetes" },
    patterns: [/чихрийн шижин/, /шижин/, /сахар/, /цусан дахь чихэр/, /diabet/, /blood sugar/],
    suppressedBy: ["family_history"],
  }),
  t({
    id: "hyperlipidemia",
    kind: "history",
    label: { mn: "Холестерин", en: "Hyperlipidaemia" },
    patterns: [/холестерин/, /өөх тос/, /липид/, /cholesterol/, /lipid/],
    suppressedBy: ["family_history"],
  }),
  t({
    id: "heart_disease",
    kind: "history",
    label: { mn: "Зүрхний өвчин", en: "Known heart disease" },
    patterns: [/зүрх(ний)? (өвчин|өвчтэй|асуудал|муу)/, /heart (disease|problem|condition)/],
    suppressedBy: ["family_history"],
  }),
  t({
    id: "lung_disease",
    kind: "history",
    label: { mn: "Уушгины өвчин", en: "Lung disease / asthma / TB" },
    patterns: [/уушги/, /астма/, /багтраа/, /сүрьеэ/, /asthma/, /copd/, /tubercul/, /\btb\b/],
    suppressedBy: ["family_history"],
  }),
  t({
    id: "surgeries",
    kind: "history",
    label: { mn: "Мэс засал", en: "Previous surgery" },
    patterns: [/хагалгаа/, /мэс засал/, /хагалуулс/, /surger/, /operation/],
  }),
  t({
    id: "hospitalizations",
    kind: "history",
    label: { mn: "Эмнэлэгт хэвтсэн", en: "Hospitalisations" },
    patterns: [/эмнэлэгт хэвт/, /hospitali/],
  }),
  t({
    id: "medications",
    kind: "history",
    label: { mn: "Хэрэглэдэг эм", en: "Medications" },
    patterns: [/(^|\s)эм(\s|$)/, /эм (уу|ууд|хэрэгл|тан)/, /эм(ээ)? уу/, /ямар эм/, /эмүүд/, /эмчилгээ (хийлг|хэрэгл|авдаг)/, /уудаг (эм|юм)/, /medic/, /pills?\b/, /drugs? (do|are) you take/, /taking any/],
    exclude: [/эмнэлэг/, /эмч(\s|$)/],
  }),
  t({
    id: "allergies",
    kind: "history",
    label: { mn: "Харшил", en: "Allergies" },
    patterns: [/харшил/, /allerg/],
  }),
  t({
    id: "family_history",
    kind: "history",
    label: { mn: "Удамшил, гэр бүлийн өвчин", en: "Family history" },
    patterns: [/гэр бүл/, /(^|\s)ээж/, /(^|\s)аав/, /эцэг эх/, /ах дүү/, /эгч/, /удам/, /төрөл садан/, /family/, /father/, /mother/, /parents/, /sibling/],
  }),
  t({
    id: "smoking",
    kind: "history",
    label: { mn: "Тамхи", en: "Smoking" },
    patterns: [/тамхи/, /smok/, /cigar/, /tobacco/],
  }),
  t({
    id: "alcohol",
    kind: "history",
    label: { mn: "Архи, согтууруулах ундаа", en: "Alcohol" },
    patterns: [/архи/, /согтуу/, /пиво/, /(^|\s)дарс/, /alcohol/, /drink/],
  }),
  t({
    id: "substance_use",
    kind: "history",
    label: { mn: "Мансууруулах бодис", en: "Recreational drugs" },
    patterns: [/мансуу/, /хар тамхи/, /recreational/, /cocaine/, /illicit/],
    suppressedBy: [],
  }),
  t({
    id: "occupation",
    kind: "history",
    label: { mn: "Ажил мэргэжил", en: "Occupation" },
    patterns: [/ажил/, /мэргэж/, /юу хийдэг/, /сурдаг/, /оюутан/, /тэтгэвэр/, /occupation/, /\bjob\b/, /work/],
    exclude: [/ажил(лах|лаж) (чадах|байхад өвд)/],
  }),
  t({
    id: "living_situation",
    kind: "history",
    label: { mn: "Амьдрах орчин", en: "Living situation" },
    patterns: [/хэнтэй (амьдар|хамт)/, /хаана амьдар/, /гэр(т)?ээ ганцаар/, /орон сууц/, /(^|\s)гэрт(\s|$)/, /live with/, /live alone/, /where do you live/],
  }),
  t({
    id: "exercise",
    kind: "history",
    label: { mn: "Хөдөлгөөн, дасгал", en: "Physical activity" },
    patterns: [/дасгал/, /спорт/, /хөдөлгөөн (хийдэг|хийх)/, /exercis/, /physical activity/],
  }),
  t({
    id: "diet",
    kind: "history",
    label: { mn: "Хооллолт", en: "Diet" },
    patterns: [/ямар хоол/, /хооллолт/, /хоол.*(иддэг|идэж байсан|идсэн)/, /\bdiet\b/, /what did you eat/],
  }),
  t({
    id: "lmp",
    kind: "history",
    label: { mn: "Сарын тэмдэг", en: "Last menstrual period" },
    patterns: [/сарын тэмдэг/, /сар(ын)? хугацаа/, /биеэ хар/, /менстру/, /\bperiod\b/, /menstru/, /\blmp\b/],
  }),
  t({
    id: "pregnancy",
    kind: "history",
    label: { mn: "Жирэмслэлт", en: "Pregnancy" },
    patterns: [/жирэм/, /pregnan/],
  }),
  t({
    id: "sexual_history",
    kind: "history",
    label: { mn: "Бэлгийн амьдрал", en: "Sexual history" },
    patterns: [/бэлг/, /хамтрагч/, /хамгаалалт/, /жирэмслэлтээс сэргийл/, /sexual/, /contracept/, /condom/, /partner/],
  }),
  t({
    id: "travel",
    kind: "history",
    label: { mn: "Аялал, удаан суусан", en: "Recent travel / immobility" },
    patterns: [/аял/, /гадаад/, /хол (яв|замд)/, /удаан (суу|хэвт)/, /нислэг/, /travel/, /flight/, /immobil/],
  }),
  t({
    id: "sick_contacts",
    kind: "history",
    label: { mn: "Өвчтэй хүнтэй харьцсан", en: "Sick contacts" },
    patterns: [/(ойр|хажуу|хамт|орчин).*(өвчтэй|ханиад|ханиалга|томуу)/, /гэр.*(ханиад|ханиалга|томуу)/, /хэн нэг.*(өвчтэй|ханиад)/, /халдвар/, /хавьтал/, /sick contact/, /anyone (else )?(sick|ill)/, /exposure/],
  }),
  t({
    id: "vaccination",
    kind: "history",
    label: { mn: "Вакцинжуулалт", en: "Vaccination" },
    patterns: [/вакцин/, /дархлаажуулалт/, /тарилга/, /vaccin/, /immuni[sz]/, /flu shot/],
  }),

  // ---------------------------------------------------------------- exam ---
  t({
    id: "vitals",
    kind: "exam",
    label: { mn: "Амин үзүүлэлт", en: "Vital signs" },
    patterns: [/(даралт|пульс|судасны цохилт|температур|сатураци|хүчилтөрөгч).*(хэмж|үз|шалга)/, /(хэмж|үз|шалга).*(даралт|пульс|температур|сатураци)/, /амин үзүүлэлт/, /vital/, /check your (blood pressure|pulse|temperature)/],
  }),
  t({
    id: "physical_exam",
    kind: "exam",
    label: { mn: "Бодит үзлэг", en: "Physical examination" },
    patterns: [/үзлэг/, /үзэж (болох|үзье)/, /сонсож үз/, /чагнуур/, /тэмтрэ/, /дарж үз/, /examin/, /listen to your/, /palpat/],
  }),
  t({
    id: "investigations",
    kind: "exam",
    label: { mn: "Шинжилгээ", en: "Investigations" },
    patterns: [/шинжилгээ/, /экг/, /\becg\b/, /\bekg\b/, /рентген/, /зураг авах/, /\bct\b/, /хэт авиа/, /\blab/, /blood test/, /x-?ray/, /ultrasound/, /troponin/],
  }),

  // ---------------------------------------------------------------- meta ---
  t({
    id: "greeting",
    kind: "meta",
    label: { mn: "Мэндчилгээ", en: "Greeting" },
    patterns: [/^сайн (байна|уу)/, /сайн байцгаа/, /мэнд/, /^hello/, /^hi\b/, /^good (morning|afternoon|evening)/, /намайг .* гэдэг/, /би эмч/],
  }),
  t({
    id: "identity",
    kind: "meta",
    label: { mn: "Нэр, нас", en: "Name / age" },
    patterns: [/нэр(ийг)? (хэн|чинь|тань)/, /таны нэр/, /хэдэн настай/, /нас(аа|ыг|тай)/, /your name/, /how old/],
  }),
  t({
    id: "concerns",
    kind: "meta",
    label: { mn: "Санаа зовнил, хүлээлт", en: "Ideas, concerns, expectations" },
    patterns: [/санаа зов/, /айж байна уу/, /юунаас айж/, /юу гэж (бодож|санаж) (байна|байгаа) вэ\?? *$/, /хүлээлт/, /worr/, /concern/, /afraid/],
    suppressedBy: ["diagnosis_request"],
  }),
  t({
    id: "associated_general",
    kind: "meta",
    label: { mn: "Бусад шинж тэмдэг", en: "Other symptoms (open question)" },
    patterns: [/өөр (ямар )?(шинж|зовиур|юм|зүйл) (байна|байгаа|бий|мэдэр)/, /өөр (юу|ямар) (мэдэр|байна)/, /нэмэлт зовиур/, /бусад зовиур/, /other symptoms/, /anything else/],
  }),
  t({
    id: "broad",
    kind: "meta",
    label: { mn: "Ерөнхий асуулт", en: "Broad question" },
    patterns: [/бүгдийг/, /бүх (зүйл|юм|мэдээлэл)/, /дэлгэрэнгүй (ярь|хэл)/, /(ярьж|хэлж) өгөөч/, /юу болсныг (ярь|хэл)/, /юу болсон (юм )?(бэ|вэ)/, /юугаар (зов|өвд)/, /яагаад ирсэн/, /юу (зовоож|санаа зовоож) байна/, /ямар зовиур(тай|аар)/, /тайлбарлаад/, /tell me (everything|more|about)/, /what (brings|brought) you/, /what happened/,
      // How the patient feels overall: "Бие нь яаж байна?", "Та яаж байна?", "Яасан бэ?"
      /би(е|еийн байдал)( (нь|чинь|тань|таны))? (яаж|ямар|ямархуу) байна/, /^(та )?(яаж|ямар) байна( (даа|вэ|уу))?$/,
      /яасан (бэ|вэ|юм)/, /юу болоо (вэ|бэ)/, /ямар (асуудлаар|зовиураар|шалтгаанаар) ирс/, /юугаар ирс/, /how (are|do) you( feel(ing)?)?\b/],
    suppressedBy: ["associated_general"],
  }),
  t({
    id: "diagnosis_request",
    kind: "meta",
    label: { mn: "Онош асуух", en: "Asking for the diagnosis" },
    patterns: [/онош/, /ямар өвчин (бэ|вэ|байна|тусс|болсон)/, /юу болсон гэж (бодож|бодно|санаж)/, /(та|чи) юу гэж (бодож|бодно)/, /ямар өвчин(тэй)? (юм бол|байх)/, /diagnos/, /what('s| is) wrong/, /what do you (think|have)/, /what disease/],
  }),
  t({
    id: "injection",
    kind: "meta",
    label: { mn: "Системийн заавар руу халдах оролдлого", en: "Prompt-injection attempt" },
    patterns: [
      /ignore (all |the |your |previous |prior )*(instruction|rule|prompt)/,
      /system prompt/,
      /\bprompt\b/,
      /instruction/,
      /developer mode/,
      /jailbreak/,
      /\bjson\b/,
      /case (file|data|record)/,
      /hidden (case|diagnosis|information)/,
      /(reveal|print|show|output) (the |your )?(case|diagnosis|rubric|system|instructions)/,
      /you are (now )?(a|an) (doctor|assistant|ai|language model)/,
      /as an ai/,
      /заав(а)?р/,
      /дүрэм(ээ)? (март|зөрч)/,
      /нууц (мэдээлэл|онош)/,
      /кейс(ийн)? (файл|мэдээлэл)/,
      /рубрик/,
      /систем(ийн)? (мессеж|заав|промпт)/,
      /промпт/,
      /хиймэл оюун/,
      /чи (ai|бот|робот|загвар)/,
      /дүрээсээ гар/,
    ],
  }),
] as const satisfies readonly TopicDefinition[];

export type TopicId = (typeof TOPICS)[number]["id"];

export const TOPIC_IDS = TOPICS.map((topic) => topic.id) as [TopicId, ...TopicId[]];

const TOPIC_MAP = new Map<string, TopicDefinition>(TOPICS.map((topic) => [topic.id, topic]));

export function getTopic(id: string): TopicDefinition | undefined {
  return TOPIC_MAP.get(id);
}

export function isTopicId(id: string): id is TopicId {
  return TOPIC_MAP.has(id);
}

/** Topics whose facts the patient (not the narrator) can answer about. */
export const PATIENT_TOPIC_KINDS: readonly TopicKind[] = ["hpi", "symptom", "history"];
