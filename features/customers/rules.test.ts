import { describe, expect, it } from "vitest";
import { anonymizedName } from "./rules";

describe("anonymizedName", () => {
  it("é determinístico e termina com 4 hex", () => {
    expect(anonymizedName("abc")).toBe(anonymizedName("abc"));
    expect(anonymizedName("abc")).toMatch(/^Cliente removido #[0-9a-f]{4}$/);
  });
});
