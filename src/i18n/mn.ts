/**
 * All user-facing text of the student screens, in Mongolian.
 * `en.ts` is the English copy for judges and reviewers; TypeScript keeps the
 * two files in the same shape.
 */
export const mn = {
  app: {
    name: "OTech",
    nameAccent: "AI",
    disclaimerTitle: "Анхааруулга:",
    disclaimer:
      "Энэ нь дадлагын зориулалттай AI симуляц. Яаралтай болон эрүүл мэндийн тохиолдлын агуулга нь мэргэжлийн зааврыг орлохгүй. Бодит яаралтай тохиолдолд 103-т залгана уу.",
  },
  errors: {
    generic: "Алдаа гарлаа. Дахин оролдоно уу.",
    network: "Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгана уу.",
    modelOffline: "Өвчтөн түр хариулж чадсангүй 😔 Загварын сервер унтарсан байж магадгүй. Дахин оролдох эсвэл офлайн демог ашиглаарай.",
    micDenied: "Микрофон ашиглах зөвшөөрөл олгогдсонгүй. Хөтчийн тохиргоогоо шалгана уу.",
    micUnsupported: "Энэ хөтөч дуу бичихийг дэмжихгүй байна.",
    sttUnavailable: "Дуу хөрвүүлэх үйлчилгээ одоогоор идэвхгүй байна. Асуултаа бичээд илгээнэ үү.",
    sttRetryBrowser: "Серверийн дуу хөрвүүлэгч ажиллахгүй байна — хөтчийн яриа танигч руу шилжлээ. Дахин дарж ярина уу.",
    sttEmpty: "Яриа танигдсангүй. Дахин, ойрхон ярина уу.",
    tooLong: "Бичлэг 14 секундээс урт байж болохгүй.",
    rateLimited: "Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.",
    useDemo: "Офлайн демо",
    dismiss: "Хаах",
  },
};

/** Same shape as `mn` with every leaf free to hold any string. */
export type Strings = Widen<typeof mn>;
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : T extends readonly string[]
      ? string[]
      : T extends Record<string, string>
        ? Record<string, string>
        : { [K in keyof T]: Widen<T[K]> };
