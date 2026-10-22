import { describe, expect, it } from "vitest";
import { requestMeta } from "./request";

describe("requestMeta", () => {
  it("prefere x-real-ip ao x-forwarded-for (forjável pelo cliente)", () => {
    const h = new Headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4, 203.0.113.9" });
    expect(requestMeta(h).ip).toBe("203.0.113.9");
  });

  it("sem x-real-ip usa o primeiro hop do x-forwarded-for", () => {
    expect(requestMeta(new Headers({ "x-forwarded-for": " 1.2.3.4 , 5.6.7.8" })).ip).toBe("1.2.3.4");
  });

  it("sem cabeçalhos o ip é null", () => {
    expect(requestMeta(new Headers()).ip).toBeNull();
  });
});
