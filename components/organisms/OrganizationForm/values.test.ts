import { describe, expect, it } from "vitest";
import { toFormValues } from "./values";

describe("toFormValues", () => {
  it("achata settings aninhado e preserva chaves planas", () => {
    expect(
      toFormValues({
        name: "A",
        "admin.email": "a@b.c",
        settings: { timezone: "America/Sao_Paulo", monthStartDay: "5" },
      }),
    ).toEqual({
      name: "A",
      "admin.email": "a@b.c",
      "settings.timezone": "America/Sao_Paulo",
      "settings.monthStartDay": "5",
    });
  });
  it("sem settings", () => {
    expect(toFormValues({ name: "A" })).toEqual({ name: "A" });
  });
});
