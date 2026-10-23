import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const APP_URL = process.env.TEST_DATABASE_URL;
const OWNER_URL = process.env.TEST_DIRECT_URL;
const T = 60_000;

type Client = import("@/generated/prisma/client").PrismaClient;
type Actor = import("@/features/platform/service").PlatformActor;

describe.skipIf(!APP_URL || !OWNER_URL)("termos: versões, aceite e cadeia da plataforma", () => {
  const suffix = Date.now().toString(36);
  const meta = { ip: "127.0.0.1", userAgent: "vitest", requestId: null };
  const ROLLBACK = new Error("rollback");
  let owner: Client;
  let svc: typeof import("@/features/legal/service");
  let audit: typeof import("@/lib/audit");
  let scope: (typeof import("@/lib/db"))["withScope"];
  let perms: typeof import("@/lib/permissions");
  let master: Actor;
  let user: Actor;
  let orgId = ""; // vazio, não undefined: no Prisma `where: { organizationId: undefined }` apaga tudo se o beforeAll falhar
  const userIds: string[] = [];
  const content = (tag: string) => `Termos de teste ${tag} ${suffix} texto completo`;

  // tudo dentro de tx revertida: nunca publicar um documento real no banco dev
  const inTx = async (fn: (tx: import("@/lib/db").Tx) => Promise<void>) =>
    expect(
      scope({ platform: true }, async (tx) => {
        await fn(tx);
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_URL;
    process.env.AUTH_SECRET ??= "x".repeat(32);
    process.env.AUTH_URL ??= "http://localhost:3004";
    process.env.BLOB_READ_WRITE_TOKEN ??= "test";
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const { PrismaClient } = await import("@/generated/prisma/client");
    owner = new PrismaClient({ adapter: new PrismaNeon({ connectionString: OWNER_URL! }) });
    ({ withScope: scope } = await import("@/lib/db"));
    svc = await import("@/features/legal/service");
    audit = await import("@/lib/audit");
    perms = await import("@/lib/permissions");

    const org = await owner.organization.create({ data: { slug: `leg-${suffix}`, name: "Leg" } });
    orgId = org.id;
    const m = await owner.user.create({
      data: { name: "Master L", email: `master-leg-${suffix}@teste.local`, platformRole: "MASTER" },
    });
    const u = await owner.user.create({ data: { name: "User L", email: `user-leg-${suffix}@teste.local` } });
    userIds.push(m.id, u.id);
    await owner.membership.create({ data: { userId: u.id, organizationId: orgId, role: "FUNCIONARIO" } });
    master = { userId: m.id, userName: m.name, role: null, organizationId: null, meta, isMaster: true };
    user = { userId: u.id, userName: u.name, role: null, organizationId: null, meta, isMaster: false };
  }, T);

  afterAll(async () => {
    if (!owner) return;
    expect(await owner.legalDocument.count({ where: { content: { contains: suffix } } })).toBe(0);
    await owner.legalAcceptance.deleteMany({ where: { userId: { in: userIds } } });
    await owner.membership.deleteMany({ where: { organizationId: orgId } });
    await owner.organization.deleteMany({ where: { id: orgId } });
    await owner.user.deleteMany({ where: { id: { in: userIds } } });
    await owner.$disconnect();
  }, T);

  const baseOf = async (tx: import("@/lib/db").Tx) =>
    (await svc.currentLegalDocuments(tx)).find((d) => d.type === "TERMS")?.version ?? 0;

  it(
    "publica, fica pendente e a cadeia da plataforma continua encadeada",
    async () => {
      await inTx(async (tx) => {
        const base = await baseOf(tx);
        const { id, version } = await svc.publishLegalDocumentTx(tx, master, { type: "TERMS", content: content("a") });
        expect(version).toBe(base + 1);
        expect((await svc.pendingLegalDocumentsFor(tx, user.userId)).map((d) => d.id)).toContain(id);
        const ev = await tx.auditLog.findFirstOrThrow({ where: { action: "platform.legal_publish", entityId: id } });
        expect(JSON.stringify(ev.after)).not.toContain('content":"');
        expect(ev.after).toEqual({ type: "TERMS", version, length: content("a").length });
        const [, prev] = await tx.auditLog.findMany({
          where: { organizationId: null },
          orderBy: { seq: "desc" },
          take: 2,
        });
        expect(ev.prevHash).toBe(prev?.hash ?? null);
      });
    },
    T,
  );

  it(
    "aceite: limpa a pendência, grava IP e evento de plataforma; repetir não duplica",
    async () => {
      await inTx(async (tx) => {
        const { id } = await svc.publishLegalDocumentTx(tx, master, { type: "TERMS", content: content("b") });
        await svc.acceptLegalDocumentsTx(tx, user as never, [id]);
        expect((await svc.pendingLegalDocumentsFor(tx, user.userId)).map((d) => d.id)).not.toContain(id);
        const rows = await tx.legalAcceptance.findMany({ where: { userId: user.userId, documentId: id } });
        expect(rows).toHaveLength(1);
        expect(rows[0].ip).toBe("127.0.0.1");
        const evs = () => tx.auditLog.findMany({ where: { action: "auth.terms_accept", userId: user.userId } });
        const first = await evs();
        expect(first.at(-1)?.organizationId).toBeNull();
        await svc.acceptLegalDocumentsTx(tx, user as never, [id]);
        expect(await tx.legalAcceptance.count({ where: { userId: user.userId, documentId: id } })).toBe(1);
        expect(await evs()).toHaveLength(first.length);
      });
    },
    T,
  );

  it(
    "nova versão volta a ficar pendente; aceitar a antiga falha sem gravar",
    async () => {
      await inTx(async (tx) => {
        const v1 = await svc.publishLegalDocumentTx(tx, master, { type: "TERMS", content: content("c1") });
        await svc.acceptLegalDocumentsTx(tx, user as never, [v1.id]);
        const v2 = await svc.publishLegalDocumentTx(tx, master, { type: "TERMS", content: content("c2") });
        expect(v2.version).toBe(v1.version + 1);
        const pend = (await svc.pendingLegalDocumentsFor(tx, user.userId)).find((d) => d.id === v2.id);
        expect(pend?.updated).toBe(true);
        const before = await tx.legalAcceptance.count({ where: { userId: user.userId } });
        await expect(svc.acceptLegalDocumentsTx(tx, user as never, [v1.id])).rejects.toThrow(
          /Os termos foram atualizados/,
        );
        expect(await tx.legalAcceptance.count({ where: { userId: user.userId } })).toBe(before);
      });
    },
    T,
  );

  it(
    "papel do app não altera nem apaga termos e aceites (prova legal)",
    async () => {
      for (const run of [
        (tx: import("@/lib/db").Tx) => tx.legalDocument.updateMany({ where: { id: "nenhum" }, data: { content: "x" } }),
        (tx: import("@/lib/db").Tx) => tx.legalAcceptance.deleteMany({ where: { userId: "nenhum" } }),
      ]) {
        await expect(scope({ platform: true }, run)).rejects.toThrow(/permission denied/i);
      }
    },
    T,
  );

  it(
    "hasPendingLegalDocuments concorda com pendingLegalDocumentsFor (sem loop em /aceite)",
    async () => {
      await inTx(async (tx) => {
        const agree = async () =>
          expect(await svc.hasPendingLegalDocuments(user.userId, tx)).toBe(
            (await svc.pendingLegalDocumentsFor(tx, user.userId)).length > 0,
          );
        await agree();
        const t = await svc.publishLegalDocumentTx(tx, master, { type: "TERMS", content: content("h1") });
        const p = await svc.publishLegalDocumentTx(tx, master, { type: "PRIVACY", content: content("h2") });
        expect(await svc.hasPendingLegalDocuments(user.userId, tx)).toBe(true);
        await agree();
        await svc.acceptLegalDocumentsTx(tx, user as never, [t.id]);
        await agree();
        await svc.acceptLegalDocumentsTx(tx, user as never, [p.id]);
        expect(await svc.hasPendingLegalDocuments(user.userId, tx)).toBe(false);
        await agree();
        await svc.publishLegalDocumentTx(tx, master, { type: "TERMS", content: content("h3") });
        expect(await svc.hasPendingLegalDocuments(user.userId, tx)).toBe(true);
        await agree();
      });
    },
    T,
  );

  it(
    "publica v1: usuário de empresa fica pendente; a isenção do MASTER vive só em loadSession",
    async () => {
      await inTx(async (tx) => {
        const { id } = await svc.publishLegalDocumentTx(tx, master, { type: "PRIVACY", content: content("e") });
        expect((await svc.pendingLegalDocumentsFor(tx, user.userId)).map((d) => d.id)).toContain(id);
        // o service não conhece papel: a isenção (pendingTerms=false p/ MASTER) é coberta em lib/session.test.ts
        expect((await svc.pendingLegalDocumentsFor(tx, master.userId)).map((d) => d.id)).toContain(id);
      });
    },
    T,
  );

  it(
    "USER não publica",
    async () => {
      await inTx(async (tx) => {
        await expect(
          svc.publishLegalDocumentTx(tx, user, { type: "TERMS", content: content("d") }),
        ).rejects.toBeInstanceOf(perms.ForbiddenError);
      });
    },
    T,
  );

  it(
    "appendPlatformAudit em tx de empresa encadeia com a linha anterior da plataforma",
    async () => {
      await expect(
        scope({ organizationId: orgId }, async (tx) => {
          await audit.appendPlatformAudit(tx, master, { action: "test.chain" });
          const [{ on }] = await tx.$queryRaw<{ on: boolean }[]>`SELECT app_is_platform() AS "on"`;
          expect(on).toBe(false); // restaurado: a tx da empresa não ficou com visão de plataforma
          await tx.$executeRaw`SELECT set_config('app.platform', 'on', true)`; // só para ler as linhas de plataforma
          const [row, prev] = await tx.auditLog.findMany({
            where: { organizationId: null },
            orderBy: { seq: "desc" },
            take: 2,
          });
          expect(row.action).toBe("test.chain");
          expect(row.prevHash).not.toBeNull();
          expect(row.prevHash).toBe(prev.hash);
          throw ROLLBACK;
        }),
      ).rejects.toBe(ROLLBACK);
    },
    T,
  );

  it(
    "legalOverview: só MASTER; conta usuários ativos",
    async () => {
      await expect(svc.legalOverview(user)).rejects.toBeInstanceOf(perms.ForbiddenError);
      const o = await svc.legalOverview(master);
      expect(o.activeUsers).toBeGreaterThanOrEqual(0);
      expect(o.TERMS.history).toBeInstanceOf(Array);
    },
    T,
  );
});
