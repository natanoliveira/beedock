import { describe, expect, it } from "vitest";
import {
  acceptInviteSchema,
  adminInviteSchema,
  formDataToObject,
  organizationSchema,
} from "@/features/platform/schemas";

const base = { name: "Prime", slug: "prime-studio", primaryColor: "#F5A400" };
const parse = (extra: Record<string, unknown> = {}) =>
  organizationSchema.safeParse({ ...base, ...extra });

describe("organizationSchema", () => {
  it("valida slug", () => {
    expect(parse({ slug: "ab" }).success).toBe(false);
    expect(parse({ slug: "Prime" }).success).toBe(false);
    expect(parse({ slug: "prime-studio" }).success).toBe(true);
  });
  it("valida fuso horário IANA", () => {
    expect(parse({ settings: { timezone: "America/Fortaleza" } }).success).toBe(true);
    const bad = parse({ settings: { timezone: "Marte/Base" } });
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad.error?.issues)).toContain("Fuso horário inválido.");
  });
  it("valida cor", () => {
    expect(parse().success).toBe(true);
    expect(parse({ primaryColor: "amarelo" }).success).toBe(false);
  });
  it("valida documento e devolve só dígitos", () => {
    const bad = parse({ document: "111.111.111-11" });
    expect(bad.success).toBe(false);
    expect(!bad.success && bad.error.issues[0].message).toBe("CPF ou CNPJ inválido.");
    const ok = parse({ document: "123.456.789-09" });
    expect(ok.success && ok.data.document).toBe("12345678909");
  });
  it("normaliza telefone e CEP", () => {
    const ok = parse({ phone: "(86) 99999-0000", zipCode: "64000-000" });
    expect(ok.success && ok.data.phone).toBe("86999990000");
    expect(ok.success && ok.data.zipCode).toBe("64000000");
    expect(parse({ phone: "123" }).success).toBe(false);
  });
  it("strings vazias viram undefined e settings têm defaults", () => {
    const r = parse({ legalName: "", phone: "" });
    expect(r.success && r.data.legalName).toBeUndefined();
    expect(r.success && r.data.settings).toMatchObject({
      monthStartDay: 1,
      timezone: "America/Fortaleza",
      sessionIdleMinutes: 60,
      customerRetentionMonths: 24,
    });
  });
  it("valida monthStartDay", () => {
    for (const [d, ok] of [[0, false], [29, false], [28, true]] as const) {
      expect(parse({ settings: { monthStartDay: d } }).success).toBe(ok);
    }
  });
});

describe("organizationSchema via FormData", () => {
  const fd = (extra: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ ...base, ...extra })) f.set(k, v);
    return organizationSchema.safeParse(formDataToObject(f));
  };
  it("campo numérico vazio usa o default", () => {
    const r = fd({ "settings.monthStartDay": "" });
    expect(r.success && r.data.settings.monthStartDay).toBe(1);
  });
  it("converte string numérica", () => {
    const r = fd({ "settings.monthStartDay": "15" });
    expect(r.success && r.data.settings.monthStartDay).toBe(15);
  });
  it("mensagem pt-BR", () => {
    const r = fd({ "settings.monthStartDay": "0" });
    expect(!r.success && r.error.issues[0].message).toBe("Escolha um dia entre 1 e 28.");
    const long = fd({ name: "x".repeat(121) });
    expect(!long.success && long.error.issues[0].message).toBe("Máximo de 120 caracteres.");
  });
});

describe("adminInviteSchema", () => {
  it("normaliza e-mail", () => {
    const r = adminInviteSchema.safeParse({ name: "Ana", email: " Ana@X.com " });
    expect(r.success && r.data.email).toBe("ana@x.com");
  });
});

describe("acceptInviteSchema", () => {
  it("valida senha e confirmação", () => {
    const ok = { token: "t", password: "1234567890", confirm: "1234567890" };
    expect(acceptInviteSchema.safeParse(ok).success).toBe(true);
    expect(acceptInviteSchema.safeParse({ ...ok, password: "123456789", confirm: "123456789" }).success).toBe(false);
    const r = acceptInviteSchema.safeParse({ ...ok, confirm: "outra-senha-x" });
    expect(!r.success && r.error.issues[0].path).toEqual(["confirm"]);
    expect(!r.success && r.error.issues[0].message).toBe("As senhas não conferem.");
  });
});

describe("formDataToObject", () => {
  it("aninha chaves settings.x", () => {
    const fd = new FormData();
    fd.set("name", "A");
    fd.set("settings.monthStartDay", "5");
    expect(formDataToObject(fd)).toEqual({ name: "A", settings: { monthStartDay: "5" } });
  });
});
