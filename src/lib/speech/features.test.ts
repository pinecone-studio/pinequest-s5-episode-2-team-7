import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "../config";
import { anamAvatarFor, anamAvatars } from "./features";

afterEach(() => {
  vi.unstubAllEnvs();
  resetConfigForTests();
});

describe("Anam avatars", () => {
  it("reads one id or a comma-separated list", () => {
    vi.stubEnv("ANAM_AVATAR_ID_FEMALE", " a , b,,c ");
    vi.stubEnv("ANAM_AVATAR_ID_MALE", "m");
    resetConfigForTests();
    expect(anamAvatars("female")).toEqual(["a", "b", "c"]);
    expect(anamAvatars("male")).toEqual(["m"]);
  });

  it("gives each case a stable face", () => {
    vi.stubEnv("ANAM_AVATAR_ID_FEMALE", "a,b,c");
    resetConfigForTests();
    const first = anamAvatarFor("female", "abdominal-pain-01");
    expect(anamAvatarFor("female", "abdominal-pain-01")).toBe(first);
    expect(["a", "b", "c"]).toContain(first);
  });

  it("returns undefined when none is configured", () => {
    vi.stubEnv("ANAM_AVATAR_ID_MALE", "");
    resetConfigForTests();
    expect(anamAvatarFor("male", "x")).toBeUndefined();
  });
});
