import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("permissões", () => {
  it("Funcionário opera, edita, mas não exclui nem vê lucro/relatório/auditoria", () => {
    expect(can("FUNCIONARIO", "transaction.create")).toBe(true);
    expect(can("FUNCIONARIO", "order.update")).toBe(true);
    for (const action of ["transaction.delete", "profit.view", "report.view", "audit.view", "member.manage", "company.export"] as const) {
      expect(can("FUNCIONARIO", action)).toBe(false);
    }
  });

  it("Admin pode tudo", () => {
    expect(can("ADMIN", "transaction.delete")).toBe(true);
    expect(can("ADMIN", "customer.anonymize")).toBe(true);
    expect(can("ADMIN", "company.export")).toBe(true);
  });
});
