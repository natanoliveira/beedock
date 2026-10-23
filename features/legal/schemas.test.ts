import { describe, expect, it } from "vitest";
import { acceptTermsSchema, publishLegalSchema } from "./schemas";
import { LEGAL_TEMPLATES } from "./templates";

describe("publishLegalSchema", () => {
  it("rejeita marcador [PREENCHER", () => {
    const r = publishLegalSchema.safeParse({ type: "TERMS", content: "Texto completo [PREENCHER: x] fim" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Substitua os trechos [PREENCHER …] antes de publicar.");
  });
  it("rejeita só espaços", () => {
    const r = publishLegalSchema.safeParse({ type: "TERMS", content: "   " });
    expect(r.error?.issues[0].message).toBe("Mínimo de 10 caracteres.");
  });
  it("aceita texto válido", () => {
    expect(publishLegalSchema.safeParse({ type: "PRIVACY", content: "Texto válido e completo." }).success).toBe(true);
  });
  it.each(["TERMS", "PRIVACY"] as const)("modelo %s nunca passa sem edição", (type) => {
    expect(publishLegalSchema.safeParse({ type, content: LEGAL_TEMPLATES[type] }).success).toBe(false);
  });
});

describe("acceptTermsSchema", () => {
  it("1 a 2 ids", () => {
    expect(acceptTermsSchema.safeParse([]).success).toBe(false);
    expect(acceptTermsSchema.safeParse(["a", "b", "c"]).success).toBe(false);
    expect(acceptTermsSchema.safeParse(["a"]).success).toBe(true);
  });
});
