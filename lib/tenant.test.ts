import { describe, expect, it } from "vitest";
import { scopeArgs, TenantViolationError } from "@/lib/tenant";

const ORG = "org_a";

describe("scopeArgs", () => {
  it("força organizationId em leituras, mesmo se o chamador pedir outra empresa", () => {
    const out = scopeArgs("Customer", "findMany", { where: { name: "Ana", organizationId: "org_b" } }, ORG);
    expect(out.where).toEqual({ name: "Ana", organizationId: ORG });
  });

  it("restringe update/delete por id à empresa", () => {
    expect(scopeArgs("Customer", "update", { where: { id: "1" }, data: { name: "x" } }, ORG).where).toEqual({
      id: "1",
      organizationId: ORG,
    });
    expect(scopeArgs("Customer", "deleteMany", {}, ORG)).toEqual({ where: { organizationId: ORG } });
  });

  it("recusa gravar em outra empresa", () => {
    expect(() => scopeArgs("Customer", "create", { data: { name: "x", organizationId: "org_b" } }, ORG)).toThrow(
      TenantViolationError,
    );
    expect(() => scopeArgs("Category", "createMany", { data: [{ organizationId: "org_b" }] }, ORG)).toThrow(
      TenantViolationError,
    );
    expect(() =>
      scopeArgs("Customer", "update", { where: { id: "1" }, data: { organizationId: "org_b" } }, ORG),
    ).toThrow(TenantViolationError);
  });

  it("aceita criação sem organizationId (default do banco) ou com o da própria empresa", () => {
    expect(() => scopeArgs("Customer", "create", { data: { name: "x" } }, ORG)).not.toThrow();
    expect(() => scopeArgs("Customer", "create", { data: { organizationId: ORG } }, ORG)).not.toThrow();
  });
});
