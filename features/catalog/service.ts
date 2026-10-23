import { Prisma } from "@/generated/prisma/client";
import type { TransactionType } from "@/generated/prisma/enums";
import { FieldError, NotFoundError } from "@/features/platform/errors";
import { authorize, diff, withAudit, type TenantContext } from "@/lib/audit";
import { withScope } from "@/lib/db";
import type { CategoryInput, PaymentMethodInput, ProductTypeInput } from "./schemas";

export type CategoryRow = { id: string; name: string; type: TransactionType; active: boolean; usage: number };
export type PaymentMethodRow = { id: string; name: string; active: boolean; usage: number };
export type ProductTypeRow = PaymentMethodRow;

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const duplicate = (name: string, active?: boolean) =>
  new FieldError(
    "name",
    active === false
      ? `Já existe '${name}' (desativada). Reative em vez de criar outra.`
      : `Já existe '${name}'.`,
  );

const ci = (name: string) => ({ equals: name, mode: "insensitive" as const });

export async function listCategories(ctx: TenantContext): Promise<CategoryRow[]> {
  await authorize(ctx, "settings.manage");
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const rows = await tx.category.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        active: true,
        _count: { select: { transactions: { where: { deletedAt: null } } } },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    return rows.map(({ _count, ...r }) => ({ ...r, usage: _count.transactions }));
  });
}

export async function listPaymentMethods(ctx: TenantContext): Promise<PaymentMethodRow[]> {
  await authorize(ctx, "settings.manage");
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const rows = await tx.paymentMethod.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        active: true,
        _count: { select: { transactions: { where: { deletedAt: null } } } },
      },
      orderBy: { name: "asc" },
    });
    return rows.map(({ _count, ...r }) => ({ ...r, usage: _count.transactions }));
  });
}

export async function createCategory(ctx: TenantContext, input: CategoryInput): Promise<{ id: string }> {
  await authorize(ctx, "settings.manage");
  try {
    return await withAudit(
      ctx,
      (r: { id: string; after: Record<string, unknown> }) => ({
        action: "category.create",
        entityType: "Category",
        entityId: r.id,
        after: r.after,
      }),
      async (tx) => {
        const dup = await tx.category.findFirst({
          where: { type: input.type, name: ci(input.name) },
          select: { active: true },
        });
        if (dup) throw duplicate(input.name, dup.active);
        const row = await tx.category.create({
          data: { type: input.type, name: input.name } as Prisma.CategoryUncheckedCreateInput,
        });
        return { id: row.id, after: { name: row.name, type: row.type, active: row.active } };
      },
    ).then((r) => ({ id: r.id }));
  } catch (e) {
    if (isUnique(e)) throw duplicate(input.name);
    throw e;
  }
}

export async function updateCategory(
  ctx: TenantContext,
  id: string,
  patch: { name?: string; active?: boolean },
): Promise<void> {
  await authorize(ctx, "settings.manage");
  try {
    await withAudit(
      ctx,
      (r: { before: Record<string, unknown>; after: Record<string, unknown> }) => ({
        action: "category.update",
        entityType: "Category",
        entityId: id,
        ...diff(r.before, r.after),
      }),
      async (tx) => {
        const existing = await tx.category.findFirst({ where: { id, deletedAt: null } });
        if (!existing) throw new NotFoundError("Categoria não encontrada.");
        if (patch.active === false && existing.systemKey) {
          throw new FieldError("name", "Esta categoria é usada pelo sistema e não pode ser desativada.");
        }
        if (patch.name !== undefined) {
          const dup = await tx.category.findFirst({
            where: { type: existing.type, name: ci(patch.name), NOT: { id } },
            select: { active: true },
          });
          if (dup) throw duplicate(patch.name, dup.active);
        }
        const row = await tx.category.update({
          where: { id },
          data: { name: patch.name ?? existing.name, active: patch.active ?? existing.active },
        });
        return {
          before: { name: existing.name, type: existing.type, active: existing.active },
          after: { name: row.name, type: row.type, active: row.active },
        };
      },
    );
  } catch (e) {
    if (isUnique(e)) throw duplicate(patch.name ?? "");
    throw e;
  }
}

export async function createPaymentMethod(ctx: TenantContext, input: PaymentMethodInput): Promise<{ id: string }> {
  await authorize(ctx, "settings.manage");
  try {
    return await withAudit(
      ctx,
      (r: { id: string; after: Record<string, unknown> }) => ({
        action: "payment_method.create",
        entityType: "PaymentMethod",
        entityId: r.id,
        after: r.after,
      }),
      async (tx) => {
        const dup = await tx.paymentMethod.findFirst({ where: { name: ci(input.name) }, select: { active: true } });
        if (dup) throw duplicate(input.name, dup.active);
        const row = await tx.paymentMethod.create({
          data: { name: input.name } as Prisma.PaymentMethodUncheckedCreateInput,
        });
        return { id: row.id, after: { name: row.name, active: row.active } };
      },
    ).then((r) => ({ id: r.id }));
  } catch (e) {
    if (isUnique(e)) throw duplicate(input.name);
    throw e;
  }
}

export async function updatePaymentMethod(
  ctx: TenantContext,
  id: string,
  patch: { name?: string; active?: boolean },
): Promise<void> {
  await authorize(ctx, "settings.manage");
  try {
    await withAudit(
      ctx,
      (r: { before: Record<string, unknown>; after: Record<string, unknown> }) => ({
        action: "payment_method.update",
        entityType: "PaymentMethod",
        entityId: id,
        ...diff(r.before, r.after),
      }),
      async (tx) => {
        const existing = await tx.paymentMethod.findFirst({ where: { id, deletedAt: null } });
        if (!existing) throw new NotFoundError("Forma de pagamento não encontrada.");
        if (patch.name !== undefined) {
          const dup = await tx.paymentMethod.findFirst({
            where: { name: ci(patch.name), NOT: { id } },
            select: { active: true },
          });
          if (dup) throw duplicate(patch.name, dup.active);
        }
        const row = await tx.paymentMethod.update({
          where: { id },
          data: { name: patch.name ?? existing.name, active: patch.active ?? existing.active },
        });
        return {
          before: { name: existing.name, active: existing.active },
          after: { name: row.name, active: row.active },
        };
      },
    );
  } catch (e) {
    if (isUnique(e)) throw duplicate(patch.name ?? "");
    throw e;
  }
}

export async function listProductTypes(ctx: TenantContext): Promise<ProductTypeRow[]> {
  await authorize(ctx, "settings.manage");
  return withScope({ organizationId: ctx.organizationId }, async (tx) => {
    const rows = await tx.productType.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        active: true,
        _count: { select: { orders: { where: { deletedAt: null } } } },
      },
      orderBy: { name: "asc" },
    });
    return rows.map(({ _count, ...r }) => ({ ...r, usage: _count.orders }));
  });
}

export async function createProductType(ctx: TenantContext, input: ProductTypeInput): Promise<{ id: string }> {
  await authorize(ctx, "settings.manage");
  try {
    return await withAudit(
      ctx,
      (r: { id: string; after: Record<string, unknown> }) => ({
        action: "product_type.create",
        entityType: "ProductType",
        entityId: r.id,
        after: r.after,
      }),
      async (tx) => {
        const dup = await tx.productType.findFirst({ where: { name: ci(input.name) }, select: { active: true } });
        if (dup) throw duplicate(input.name, dup.active);
        const row = await tx.productType.create({
          data: { name: input.name } as Prisma.ProductTypeUncheckedCreateInput,
        });
        return { id: row.id, after: { name: row.name, active: row.active } };
      },
    ).then((r) => ({ id: r.id }));
  } catch (e) {
    if (isUnique(e)) throw duplicate(input.name);
    throw e;
  }
}

export async function updateProductType(
  ctx: TenantContext,
  id: string,
  patch: { name?: string; active?: boolean },
): Promise<void> {
  await authorize(ctx, "settings.manage");
  try {
    await withAudit(
      ctx,
      (r: { before: Record<string, unknown>; after: Record<string, unknown> }) => ({
        action: "product_type.update",
        entityType: "ProductType",
        entityId: id,
        ...diff(r.before, r.after),
      }),
      async (tx) => {
        const existing = await tx.productType.findFirst({ where: { id, deletedAt: null } });
        if (!existing) throw new NotFoundError("Tipo de produto não encontrado.");
        if (patch.name !== undefined) {
          const dup = await tx.productType.findFirst({
            where: { name: ci(patch.name), NOT: { id } },
            select: { active: true },
          });
          if (dup) throw duplicate(patch.name, dup.active);
        }
        const row = await tx.productType.update({
          where: { id },
          data: { name: patch.name ?? existing.name, active: patch.active ?? existing.active },
        });
        return {
          before: { name: existing.name, active: existing.active },
          after: { name: row.name, active: row.active },
        };
      },
    );
  } catch (e) {
    if (isUnique(e)) throw duplicate(patch.name ?? "");
    throw e;
  }
}
