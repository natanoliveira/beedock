import { describe, expect, it } from "vitest";
import { ACTION_GROUPS, describeEvent, groupWhere, type DescribableEvent } from "./describe";

const ev = (over: Partial<DescribableEvent>): DescribableEvent => ({
  action: "x.y",
  userName: "Maria",
  userRole: "ADMIN",
  result: "SUCCESS",
  entityType: null,
  before: null,
  after: null,
  ...over,
});

describe("describeEvent", () => {
  it("edição de valor mostra de/para em BRL", () => {
    const { text } = describeEvent(
      ev({
        action: "transaction.update",
        before: { amountCents: 8000, description: "Tinta branca" },
        after: { amountCents: 9500, description: "Tinta branca" },
      }),
    );
    expect(text).toContain("Maria editou o lançamento 'Tinta branca'");
    expect(text).toContain("R$ 80,00");
    expect(text).toContain("R$ 95,00");
  });

  it("negado é alerta", () => {
    const r = describeEvent(ev({ action: "report.view", result: "DENIED" }));
    expect(r.tone).toBe("alert");
    expect(r.text.startsWith("Acesso negado")).toBe(true);
  });

  it("MASTER ganha sufixo", () => {
    expect(describeEvent(ev({ action: "auth.login", userRole: "MASTER" })).text).toBe("Maria (MASTER) entrou no sistema");
  });

  it("ação desconhecida é genérica", () => {
    expect(describeEvent(ev({ action: "foo.bar" })).text).toBe("Maria executou foo.bar");
  });

  it("before/after nulos e campos ausentes não lançam", () => {
    for (const action of ["transaction.update", "order.status_change", "order_payment.create", "customer.create"]) {
      expect(() => describeEvent(ev({ action }))).not.toThrow();
    }
  });

  it("sem usuário vira Sistema", () => {
    expect(describeEvent(ev({ action: "auth.login", userName: null })).text).toBe("Sistema entrou no sistema");
  });

  it("falha é alerta", () => {
    expect(describeEvent(ev({ action: "auth.login", result: "FAILED" })).tone).toBe("alert");
  });

  it("recebimento e pedido citam valor e número", () => {
    expect(describeEvent(ev({ action: "order_payment.create", after: { amountCents: 20000 } })).text).toBe(
      "Maria registrou recebimento de R$ 200,00",
    );
    expect(describeEvent(ev({ action: "order.cancel", after: { number: 12 } })).text).toBe("Maria cancelou o pedido #12");
  });

  it("toda action conhecida tem frase própria", () => {
    const known = [
      "auth.login", "auth.logout", "auth.login_failed", "auth.login_blocked", "auth.login_inactive", "auth.locked",
      "auth.terms_accept", "category.create", "category.update", "customer.anonymize", "customer.create",
      "customer.delete", "customer.update", "invitation.accept", "invitation.create", "invitation.invalid",
      "invitation.revoke", "member.create", "member.reactivate", "member.role_change", "order_payment.create",
      "order_payment.delete", "order_payment.update", "order.cancel", "order.create", "order.delete",
      "order.receipt_issue", "order.status_change", "order.update", "organization.update", "payment_method.create",
      "payment_method.update", "platform.legal_publish", "platform.master_seed", "platform.master_upsert",
      "platform.org_leave", "platform.organization_create", "platform.organization_update", "product_type.create",
      "product_type.update", "transaction.create", "transaction.delete", "transaction.receipt_issue",
      "transaction.receipt_view", "transaction.update", "report.export", "audit.export", "customer.export",
      "member.export", "organization.export", "platform.audit_export", "platform.organization_export",
    ];
    for (const action of known) expect(describeEvent(ev({ action })).text).not.toContain("executou");
  });
});

describe("groupWhere", () => {
  it("prefixos e negados", () => {
    expect(groupWhere("negados")).toEqual({ result: "DENIED" });
    expect(groupWhere("lancamentos")).toEqual({ OR: [{ action: { startsWith: "transaction." } }] });
    expect(Object.keys(ACTION_GROUPS)).toHaveLength(8);
  });
});
