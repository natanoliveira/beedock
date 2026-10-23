import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  platformRole: "USER" as "USER" | "MASTER",
  pending: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ sid: "s1" }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/features/legal/service", () => ({ hasPendingLegalDocuments: h.pending }));
vi.mock("@/lib/db", () => ({
  db: {
    session: {
      findUnique: async () => ({
        id: "s1",
        userId: "u1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        lastSeenAt: new Date(),
        idleMinutes: 60,
        user: { id: "u1", name: "U", email: "u@x.local", platformRole: h.platformRole, anonymizedAt: null },
        organization: { id: "o1", name: "Org", logoUrl: null, primaryColor: "#000", status: "ACTIVE" },
      }),
      update: async () => ({}),
    },
  },
  withScope: async () => ({ active: true, role: "FUNCIONARIO" }),
}));

import { getCurrentSession, loadSession, requireTenant } from "@/lib/session";
import { platformActor } from "@/features/platform/actor";

// redirect() do Next lança erro com digest "NEXT_REDIRECT;...;/rota;..."
const redirectsTo = (path: string) => expect.objectContaining({ digest: expect.stringContaining(path) });

describe("guard de termos pendentes", () => {
  beforeEach(() => {
    h.platformRole = "USER";
    h.pending.mockReset();
  });

  it("pendente → requireTenant redireciona para /aceite", async () => {
    h.pending.mockResolvedValue(true);
    await expect(requireTenant()).rejects.toEqual(redirectsTo("/aceite"));
  });

  it("sem pendência → requireTenant devolve o contexto", async () => {
    h.pending.mockResolvedValue(false);
    expect((await requireTenant()).role).toBe("FUNCIONARIO");
  });

  it("MASTER não consulta termos e nunca fica pendente", async () => {
    h.platformRole = "MASTER";
    h.pending.mockResolvedValue(true);
    expect((await loadSession("s1"))?.pendingTerms).toBe(false);
    expect(h.pending).not.toHaveBeenCalled();
  });

  it("platformActor com pendência → /aceite", async () => {
    h.pending.mockResolvedValue(true);
    await expect(platformActor()).rejects.toEqual(redirectsTo("/aceite"));
  });

  it("getCurrentSession não aplica o guard", async () => {
    h.pending.mockResolvedValue(true);
    expect((await getCurrentSession())?.pendingTerms).toBe(true);
  });
});
