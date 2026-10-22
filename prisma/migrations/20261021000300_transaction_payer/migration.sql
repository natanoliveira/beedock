ALTER TABLE "Transaction" ADD COLUMN "payerName" TEXT,
ADD COLUMN "payerDocument" TEXT;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amountCents_positive" CHECK ("amountCents" > 0);
