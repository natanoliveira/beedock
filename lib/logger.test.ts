import { describe, expect, it } from "vitest";
import { maskPii } from "@/lib/logger";

describe("maskPii", () => {
  it("mascara CPF, CNPJ, telefone e e-mail", () => {
    const out = maskPii("cpf 123.456.789-09 cnpj 12.345.678/0001-90 tel (86) 99876-1234 email maria@prime.com.br");
    expect(out).not.toMatch(/123\.456|12\.345\.678|99876|maria@/);
    expect(out).toContain("(86) 9****-1234");
    expect(out).toContain("m***@prime.com.br");
  });
});
