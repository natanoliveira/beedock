import { describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";
import { ForbiddenError } from "@/lib/permissions";
import { FieldError, NotFoundError } from "@/features/platform/errors";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return { ...actual, unstable_rethrow: (e: unknown) => { if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e; } };
});

import { toFormState } from "./form-state";

describe("toFormState", () => {
  const values = { a: "1" };
  it("ZodError -> fieldErrors", () => {
    const r = z.object({ a: z.string().min(3, "curto") }).safeParse({ a: "x" });
    expect(toFormState((r as { error: ZodError }).error, "nf", values)).toEqual({ fieldErrors: { a: "curto" }, values });
  });
  it("FieldError -> fieldErrors", () => {
    expect(toFormState(new FieldError("receipt", "ruim"), "nf", values)).toEqual({ fieldErrors: { receipt: "ruim" }, values });
  });
  it("NotFoundError -> erro com a mensagem informada", () => {
    expect(toFormState(new NotFoundError(), "nf", values)).toEqual({ error: "nf", values });
  });
  it("ForbiddenError -> erro com a mensagem do erro", () => {
    const e = new ForbiddenError();
    expect(toFormState(e, "nf", values)).toEqual({ error: e.message, values });
  });
  it("erro genérico -> estado de erro", () => {
    expect(toFormState(new Error("boom"), "nf", values)).toEqual({
      error: "Não foi possível salvar agora. Tente de novo.",
      values,
    });
  });
  it("redirect é relançado", () => {
    expect(() => toFormState(new Error("NEXT_REDIRECT"), "nf", values)).toThrow("NEXT_REDIRECT");
  });
});
