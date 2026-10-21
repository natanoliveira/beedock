import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/audit", () => ({ appendAudit: vi.fn() })); // evita carregar lib/env no unit test
vi.mock("@/features/auth/service", () => ({ hashPassword: vi.fn() }));

import { readMasterSeed } from "./seed-master";

const full = { SEED_MASTER_NAME: "Admin", SEED_MASTER_EMAIL: "a@x.com", SEED_MASTER_PASSWORD: "senha-longa-123" };

describe("readMasterSeed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retorna null com todas vazias", () => {
    expect(readMasterSeed({})).toBeNull();
    expect(readMasterSeed({ SEED_MASTER_NAME: "", SEED_MASTER_EMAIL: "", SEED_MASTER_PASSWORD: "" })).toBeNull();
  });
  it("lança se só parte definida", () => {
    expect(() => readMasterSeed({ SEED_MASTER_EMAIL: "a@x.com" })).toThrow();
  });
  it("produção + senha curta lança", () => {
    expect(() => readMasterSeed({ ...full, SEED_MASTER_PASSWORD: "admin123", NODE_ENV: "production" })).toThrow(
      "SEED_MASTER_PASSWORD precisa ter 10+ caracteres",
    );
  });
  it("dev + senha curta avisa e retorna", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(readMasterSeed({ ...full, SEED_MASTER_PASSWORD: "admin123" })?.password).toBe("admin123");
    expect(warn).toHaveBeenCalled();
  });
  it("e-mail em minúsculas", () => {
    expect(readMasterSeed({ ...full, SEED_MASTER_EMAIL: "Admin@X.com" })?.email).toBe("admin@x.com");
  });
});
