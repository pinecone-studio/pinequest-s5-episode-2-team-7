import { describe, expect, it } from "vitest";
import { repeatedPhrase } from "./validator";

describe("repetition check", () => {
  it("flags the loops a small model gets stuck in", () => {
    // Real fine-tuned output to "Танд ямар өвчин байна гэж бодож байна?"
    expect(repeatedPhrase("Уучлаарай, эмч ээ, сайн мэдэхгүй нь, сайн мэдэхгүй нь. Та л сайн мэдэхгүй гэдгийг сайн мэдэхгүй нь, сайн мэдэхгүй нь.")).not.toBeNull();
    expect(repeatedPhrase("Уучлаарай, таны юу хэлээд байгааг ойлгосонгүй. Уучлаарай, таны юу хэлээд байгааг ойлгосонгүй.")).not.toBeNull();
  });

  it("allows normal patient speech", () => {
    expect(repeatedPhrase("Сайн, сайн байна уу, эмч ээ.")).toBeNull();
    expect(repeatedPhrase("Түрүүн хэлсэнчлэн, яг цээжний голд, өвчүүний ард өвдөөд байна.")).toBeNull();
    expect(repeatedPhrase("Өнөө өглөө сэрэнгүүт л эхэлсэн. Толгой бүхэлдээ лугшиж, хагарах гэж байгаа юм шиг өвдөж байна.")).toBeNull();
  });
});
