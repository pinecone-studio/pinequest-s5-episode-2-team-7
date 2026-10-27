/**
 * Who is practising — the same roles as the Otech AI iOS app (ios/OtochAI/Role.swift).
 * Chosen on «Та юунд бэлдэж байна вэ?» and stored in the `userRole` cookie; the raw
 * values are the API contract of /api/quiz (`role`), so do not rename them.
 * Safe to import from client components.
 */
export const ROLE_COOKIE = "userRole";

export const PICKABLE_ROLES = ["service", "manager", "teacher", "dispatcher", "health", "learner"] as const;
export type UserRole = (typeof PICKABLE_ROLES)[number];

export interface RoleInfo {
  title: string;
  detail: string;
  /** The line under the greeting on «Нүүр». */
  greeting: string;
}

export const ROLES: Record<UserRole, RoleInfo> = {
  service: {
    title: "Үйлчилгээний ажилтан",
    detail: "Call center, ресепшн, борлуулалт: үйлчлүүлэгчтэй харьцах",
    greeting: "Уурласан үйлчлүүлэгчтэй анх удаа энд тааралд. AI тань дүгнээд өгнө.",
  },
  manager: {
    title: "Ажил олгогч / менежер",
    detail: "Компанийнхаа мэдээллийг оруулаад шинэ ажилтнаа AI-аар сургаж, үр дүнг нь харна",
    greeting: "Компанийнхаа мэдээллийг оруулаад шинэ ажилтнаа AI дасгалжуулагчаар сургаарай.",
  },
  teacher: {
    title: "Багш",
    detail: "Багш: сурагч, эцэг эхтэй хэцүү яриа, анги удирдах",
    greeting: "Анхны хэцүү яриагаа жинхэнэ сурагч дээр биш, энд дадлагажуул.",
  },
  dispatcher: {
    title: "Яаралтай дуудлага",
    detail: "103, 102, 105: сандарсан дуудлага өгөгчтэй ажиллах",
    greeting: "Анхны сандарсан дуудлагаа жинхэнэ хүн дээр биш, энд ав.",
  },
  health: {
    title: "Эрүүл мэндийн ажилтан",
    detail: "Эмч, сувилагч: өвчтөн, ар гэртэйгээ харилцах",
    greeting: "Өвчтөнтэй хийх хэцүү яриагаа эхлээд AI дээр давт.",
  },
  learner: {
    title: "Өөрийгөө хөгжүүлэх",
    detail: "Оюутан, ажилд орох гэж буй хүн: ярилцлага, анхны ажлын өдөрт бэлдэх",
    greeting: "Ярилцлага, анхны ажлын өдөр, хэцүү яриа: эхлээд AI дээр дадлагажуул.",
  },
};

export function parseRole(value: string | undefined | null): UserRole | null {
  return PICKABLE_ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

/** The role from `document.cookie` (client only); the server reads it with `getRole`. */
export function clientRole(): UserRole | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ROLE_COOKIE}=([^;]*)`));
  return parseRole(match ? decodeURIComponent(match[1]) : null);
}
