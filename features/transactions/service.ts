import { randomUUID } from "node:crypto";
import type { TransactionType } from "@/generated/prisma/enums";
import { FieldError, NotFoundError } from "@/features/platform/errors";
import { authorize, diff, withAudit, type TenantContext } from "@/lib/audit";
import { withScope, type Tx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { can } from "@/lib/permissions";
import { deleteReceipt, uploadReceipt } from "./storage";
import { currentFinancialMonth, financialMonthRange, todayIn, type YearMonth } from "./period";
import type { ListFilters, TransactionInput } from "./schemas";

const PAGE_SIZE = 50;

export type TransactionRow = {
  id: string;
  type: TransactionType;
  amountCents: number;
  occurredOn: string;
  description: string;
  category: { id: string; name: string; active: boolean };
  paymentMethod: { id: string; name: string; active: boolean } | null;
  payerName: string | null;
  payerDocumentMasked: string | null;
  hasReceipt: boolean;
};

const rowInclude = {
  category: { select: { id: true, name: true, active: true } },
  paymentMethod: { select: { id: true, name: true, active: true } },
} as const;

const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

type DbRow = {
  id: string;
  type: TransactionType;
  amountCents: number;
  occurredOn: Date;
  description: string;
  receiptUrl: string | null;
  payerName: string | null;
  payerDocument: string | null;
  category: { id: string; name: string; active: boolean };
  paymentMethod: { id: string; name: string; active: boolean } | null;
};

const toRow = (r: DbRow): TransactionRow => ({
  id: r.id,
  type: r.type,
  amountCents: r.amountCents,
  occurredOn: toIso(r.occurredOn),
  description: r.description,
  category: r.category,
  paymentMethod: r.paymentMethod,
  payerName: r.payerName,
  payerDocumentMasked: maskDocument(r.payerDocument),
  hasReceipt: r.receiptUrl !== null,
});

const maskDocument = (d: string | null) =>
  d && d.length > 5 ? `${d.slice(0, 3)}${"*".repeat(d.length - 5)}${d.slice(-2)}` : d ? "*".repeat(d.length) : null;

type Snapshot = {
  type: TransactionType;
  amountCents: number;
  occurredOn: Date;
  categoryId: string;
  paymentMethodId: string | null;
  description: string;
  payerName: string | null;
  payerDocument: string | null;
  receiptUrl: string | null;
};

const snapshot = (r: Snapshot) => ({
  type: r.type,
  amountCents: r.amountCents,
  occurredOn: toIso(r.occurredOn),
  categoryId: r.categoryId,
  paymentMethodId: r.paymentMethodId,
  description: r.description,
  payerName: r.payerName,
  payerDocument: maskDocument(r.payerDocument),
  hasReceipt: r.receiptUrl !== null,
  receipt: r.receiptUrl ? r.receiptUrl.split("/").pop()! : null,
});

export async function getFinancialSettings(ctx: TenantContext): Promise<{ startDay: number; timezone: string }> {
  const s = await withScope({ organizationId: ctx.organizationId }, (tx) =>
    tx.organizationSettings.findUnique({ where: { organizationId: ctx.organizationId } }),
  );
  return { startDay: s?.monthStartDay ?? 1, timezone: s?.timezone ?? "America/Fortaleza" };
}

type Totals = { incomeCents: number; expenseCents: number; profitCents?: number };

async function sumByType(tx: Tx, where: object): Promise<{ incomeCents: number; expenseCents: number }> {
  const groups = await tx.transaction.groupBy({ by: ["type"], where, _sum: { amountCents: true } });
  const sum = (t: TransactionType) => groups.find((g) => g.type === t)?._sum.amountCents ?? 0;
  return { incomeCents: sum("INCOME"), expenseCents: sum("EXPENSE") };
}

const withProfit = (ctx: TenantContext, t: { incomeCents: number; expenseCents: number }): Totals =>
  can(ctx.role, "profit.view") ? { ...t, profitCents: t.incomeCents - t.expenseCents } : t;

export async function listTransactions(
  ctx: TenantContext,
  filters: ListFilters,
): Promise<{
  rows: TransactionRow[];
  page: number;
  pageCount: number;
  totals: Totals;
  month: YearMonth;
  range: { from: string; to: string };
  usedCategoryIds: string[];
  usedCategories: { id: string; name: string; type: TransactionType; active: boolean }[];
}> {
  await authorize(ctx, "transaction.view");
  const { startDay, timezone } = await getFinancialSettings(ctx);
  const month = filters.month ?? currentFinancialMonth(startDay, timezone);
  const range = financialMonthRange(month, startDay);
  const where = {
    deletedAt: null,
    occurredOn: { gte: toDate(range.from), lte: toDate(range.to) },
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
  };
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const count = await tx.transaction.count({ where });
    const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
    const page = Math.min(filters.page, pageCount);
    const rows = await tx.transaction.findMany({
      where,
      include: rowInclude,
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    const totals = withProfit(ctx, await sumByType(tx, where));
    const used = await tx.transaction.groupBy({
      by: ["categoryId"],
      where: { deletedAt: null, occurredOn: { gte: toDate(range.from), lte: toDate(range.to) } },
    });
    const usedCategories = await tx.category.findMany({
      where: { id: { in: used.map((g) => g.categoryId) } },
      select: { id: true, name: true, type: true, active: true },
      orderBy: { name: "asc" },
    });
    return {
      rows: rows.map(toRow),
      page,
      pageCount,
      totals,
      month,
      range,
      usedCategoryIds: used.map((g) => g.categoryId),
      usedCategories,
    };
  });
}

export async function monthSummary(
  ctx: TenantContext,
): Promise<{ month: YearMonth; incomeCents: number; expenseCents: number; profitCents?: number }> {
  await authorize(ctx, "transaction.view");
  const { startDay, timezone } = await getFinancialSettings(ctx);
  const month = currentFinancialMonth(startDay, timezone);
  const range = financialMonthRange(month, startDay);
  const where = { deletedAt: null, occurredOn: { gte: toDate(range.from), lte: toDate(range.to) } };
  const totals = await withScope({ organizationId: ctx.organizationId }, (tx) => sumByType(tx, where));
  return { month, ...withProfit(ctx, totals) };
}

export async function getTransaction(ctx: TenantContext, id: string): Promise<TransactionRow | null> {
  await authorize(ctx, "transaction.view");
  const r = await withScope({ organizationId: ctx.organizationId }, (tx) =>
    tx.transaction.findFirst({ where: { id, deletedAt: null }, include: rowInclude }),
  );
  return r ? toRow(r) : null;
}

export async function formOptions(
  ctx: TenantContext,
  current?: { categoryId?: string; paymentMethodId?: string },
): Promise<{
  categories: { id: string; name: string; type: TransactionType; active: boolean }[];
  paymentMethods: { id: string; name: string; active: boolean }[];
}> {
  await authorize(ctx, "transaction.view");
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const keep = (id?: string) => (id ? [{ id }] : []);
    const [categories, paymentMethods] = await Promise.all([
      tx.category.findMany({
        where: { deletedAt: null, OR: [{ active: true }, ...keep(current?.categoryId)] },
        select: { id: true, name: true, type: true, active: true },
        orderBy: { name: "asc" },
      }),
      tx.paymentMethod.findMany({
        where: { deletedAt: null, OR: [{ active: true }, ...keep(current?.paymentMethodId)] },
        select: { id: true, name: true, active: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return { categories, paymentMethods };
  });
}

function checkInput(input: TransactionInput, timezone: string) {
  if (input.type === "EXPENSE" && (input.payerName || input.payerDocument)) {
    throw new FieldError(input.payerName ? "payerName" : "payerDocument", "Saída não tem pagador.");
  }
  if (input.occurredOn > todayIn(timezone)) throw new FieldError("occurredOn", "A data não pode ser futura.");
}

async function checkRefs(
  tx: Tx,
  input: TransactionInput,
  current?: { categoryId: string; paymentMethodId: string | null },
) {
  const cat = await tx.category.findFirst({
    where: { id: input.categoryId, deletedAt: null },
    select: { type: true, active: true },
  });
  if (!cat || cat.type !== input.type) throw new FieldError("categoryId", "Categoria inválida.");
  if (!cat.active && input.categoryId !== current?.categoryId) {
    throw new FieldError("categoryId", "Esta categoria está desativada.");
  }
  if (input.paymentMethodId) {
    const pm = await tx.paymentMethod.findFirst({
      where: { id: input.paymentMethodId, deletedAt: null },
      select: { active: true },
    });
    if (!pm) throw new FieldError("paymentMethodId", "Forma de pagamento inválida.");
    if (!pm.active && input.paymentMethodId !== current?.paymentMethodId) {
      throw new FieldError("paymentMethodId", "Esta forma de pagamento está desativada.");
    }
  }
}

const fields = (input: TransactionInput) => ({
  type: input.type,
  amountCents: input.amountCents,
  occurredOn: toDate(input.occurredOn),
  categoryId: input.categoryId,
  paymentMethodId: input.paymentMethodId ?? null,
  description: input.description,
  payerName: input.type === "INCOME" ? (input.payerName ?? null) : null,
  payerDocument: input.type === "INCOME" ? (input.payerDocument ?? null) : null,
});

export async function createTransaction(
  ctx: TenantContext,
  input: TransactionInput,
  file?: File,
): Promise<{ id: string }> {
  await authorize(ctx, "transaction.create");
  const { timezone } = await getFinancialSettings(ctx);
  checkInput(input, timezone);
  const id = randomUUID();
  const receiptUrl = file ? await uploadReceipt(ctx.organizationId, id, file) : null;
  try {
    return await withAudit(
      ctx,
      (r: { id: string; after: Record<string, unknown> }) => ({
        action: "transaction.create",
        entityType: "Transaction",
        entityId: r.id,
        after: r.after,
      }),
      async (tx) => {
        await checkRefs(tx, input, undefined);
        const row = await tx.transaction.create({
          data: { id, ...fields(input), receiptUrl, createdById: ctx.userId, updatedById: ctx.userId },
        });
        return { id: row.id, after: snapshot(row) };
      },
    ).then((r) => ({ id: r.id }));
  } catch (e) {
    if (receiptUrl) await deleteReceipt(ctx.organizationId, receiptUrl);
    throw e;
  }
}

export async function updateTransaction(
  ctx: TenantContext,
  id: string,
  input: TransactionInput,
  file?: File,
): Promise<void> {
  await authorize(ctx, "transaction.update");
  const { timezone } = await getFinancialSettings(ctx);
  checkInput(input, timezone);
  const newReceipt = file ? await uploadReceipt(ctx.organizationId, id, file) : null;
  let replaced: string | null = null;
  try {
    const result = await withAudit(
      ctx,
      (r: { before: Record<string, unknown>; after: Record<string, unknown> }) => ({
        action: "transaction.update",
        entityType: "Transaction",
        entityId: id,
        ...diff(r.before, r.after),
      }),
      async (tx) => {
        const existing = await tx.transaction.findFirst({ where: { id, deletedAt: null } });
        if (!existing) throw new NotFoundError("Lançamento não encontrado.");
        await checkRefs(tx, input, existing);
        const receiptUrl = newReceipt ?? (input.removeReceipt ? null : existing.receiptUrl);
        const data = fields(input);
        if (input.keepPayerDocument && input.type === "INCOME" && input.payerName && !input.payerDocument) {
          data.payerDocument = existing.payerDocument;
        }
        const row = await tx.transaction.update({
          where: { id },
          data: { ...data, receiptUrl, updatedById: ctx.userId },
        });
        return {
          before: snapshot(existing),
          after: snapshot(row),
          replaced: existing.receiptUrl !== null && existing.receiptUrl !== receiptUrl ? existing.receiptUrl : null,
        };
      },
    );
    replaced = result.replaced;
  } catch (e) {
    if (newReceipt) await deleteReceipt(ctx.organizationId, newReceipt);
    throw e;
  }
  if (replaced) {
    try {
      await deleteReceipt(ctx.organizationId, replaced);
    } catch (e) {
      logger.error("receipt.cleanup_failed", e);
    }
  }
}

export async function deleteTransaction(ctx: TenantContext, id: string): Promise<void> {
  await authorize(ctx, "transaction.delete");
  await withAudit(
    ctx,
    (before: Record<string, unknown>) => ({
      action: "transaction.delete",
      entityType: "Transaction",
      entityId: id,
      before,
    }),
    async (tx) => {
      const existing = await tx.transaction.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError("Lançamento não encontrado.");
      await tx.transaction.update({ where: { id }, data: { deletedAt: new Date(), updatedById: ctx.userId } });
      return snapshot(existing);
    },
  );
}
