import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "../config";
import avatars from "../../../data/avatars.json";
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
    const first = anamAvatarFor("female", "case-not-in-avatars-json");
    expect(anamAvatarFor("female", "case-not-in-avatars-json")).toBe(first);
    expect(["a", "b", "c"]).toContain(first);
  });

  it("uses a case's own avatar from data/avatars.json", () => {
    vi.stubEnv("ANAM_AVATAR_ID_FEMALE", "a,b,c");
    resetConfigForTests();
    expect(anamAvatarFor("female", "abdominal-pain-02")).toBe(avatars["abdominal-pain-02"].anam);
  });

  it("returns undefined when none is configured", () => {
    vi.stubEnv("ANAM_AVATAR_ID_MALE", "");
    resetConfigForTests();
    expect(anamAvatarFor("male", "x")).toBeUndefined();
  });
});
