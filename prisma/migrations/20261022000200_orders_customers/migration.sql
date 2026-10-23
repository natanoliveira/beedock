-- Categorias de sistema: recebimentos de pedido (Pedidos) e estornos (Estorno)
ALTER TABLE "Category" ADD COLUMN "systemKey" TEXT;
ALTER TABLE "Category" ADD CONSTRAINT "Category_systemKey_check" CHECK ("systemKey" IN ('ORDER_PAYMENT', 'ORDER_REFUND'));
CREATE UNIQUE INDEX "Category_organizationId_systemKey_key" ON "Category"("organizationId", "systemKey");

-- Backfill idempotente: marca as existentes e cria o Estorno onde faltar
UPDATE "Category" c SET "systemKey" = 'ORDER_PAYMENT'
WHERE c."type" = 'INCOME' AND lower(c."name") = 'pedidos' AND c."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Category" k WHERE k."organizationId" = c."organizationId" AND k."systemKey" = 'ORDER_PAYMENT');

UPDATE "Category" c SET "systemKey" = 'ORDER_REFUND'
WHERE c."type" = 'EXPENSE' AND lower(c."name") = 'estorno' AND c."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Category" k WHERE k."organizationId" = c."organizationId" AND k."systemKey" = 'ORDER_REFUND');

INSERT INTO "Category" ("id", "organizationId", "type", "name", "active", "systemKey", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", 'EXPENSE', 'Estorno', true, 'ORDER_REFUND', now(), now()
FROM "Organization" o
WHERE NOT EXISTS (SELECT 1 FROM "Category" k WHERE k."organizationId" = o."id" AND k."systemKey" = 'ORDER_REFUND')
  AND NOT EXISTS (SELECT 1 FROM "Category" k WHERE k."organizationId" = o."id" AND k."type" = 'EXPENSE' AND lower(k."name") = 'estorno');

-- Pedido: número humano por empresa e data de entrega efetiva
ALTER TABLE "Order" ADD COLUMN "number" INTEGER, ADD COLUMN "deliveredOn" DATE;
UPDATE "Order" o SET "number" = r.n
FROM (SELECT "id", row_number() OVER (PARTITION BY "organizationId" ORDER BY "createdAt", "id") AS n FROM "Order") r
WHERE o."id" = r."id";
ALTER TABLE "Order" ALTER COLUMN "number" SET NOT NULL;
CREATE UNIQUE INDEX "Order_organizationId_number_key" ON "Order"("organizationId", "number");
ALTER TABLE "Order" ADD CONSTRAINT "Order_totalCents_check" CHECK ("totalCents" > 0);
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_amountCents_check" CHECK ("amountCents" > 0);

-- Lançamento gerado por pedido (recebimento ou estorno)
ALTER TABLE "Transaction" ADD COLUMN "orderId" TEXT;
CREATE INDEX "Transaction_organizationId_orderId_idx" ON "Transaction"("organizationId", "orderId");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_organizationId_orderId_fkey" FOREIGN KEY ("organizationId", "orderId") REFERENCES "Order"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
