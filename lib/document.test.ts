import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidCpf, isValidDocument, slugify } from "@/lib/document";

describe("documentos", () => {
  it("valida CPF", () => {
    expect(isValidCpf("123.456.789-09")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123.456.789-00")).toBe(false);
  });
  it("valida CNPJ", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
  });
  it("rejeita tamanho inválido", () => {
    expect(isValidDocument("1234")).toBe(false);
    expect(isValidDocument("12345678909")).toBe(true);
    expect(isValidDocument("11222333000181")).toBe(true);
  });
});

describe("slugify", () => {
  it("normaliza nomes", () => {
    expect(slugify("Prime Studio - Uniformes")).toBe("prime-studio-uniformes");
    expect(slugify("Café & Cia")).toBe("cafe-cia");
  });
});
