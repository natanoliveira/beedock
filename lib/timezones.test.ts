import { describe, expect, it } from "vitest";
import { BR_TIMEZONES, timezoneOptions } from "./timezones";

describe("timezones", () => {
  it("tem 16 fusos válidos", () => {
    expect(BR_TIMEZONES).toHaveLength(16);
    for (const t of BR_TIMEZONES) expect(() => new Intl.DateTimeFormat("pt-BR", { timeZone: t.value })).not.toThrow();
  });
  it("acrescenta fuso legado ao final", () => {
    expect(timezoneOptions("America/New_York").at(-1)).toEqual({
      value: "America/New_York",
      label: "America/New_York",
    });
    expect(timezoneOptions("America/Manaus")).toHaveLength(16);
  });
});
