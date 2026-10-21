-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_productTypeId_fkey";

-- DropForeignKey
ALTER TABLE "OrderPayment" DROP CONSTRAINT "OrderPayment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderPayment" DROP CONSTRAINT "OrderPayment_paymentMethodId_fkey";

-- DropForeignKey
ALTER TABLE "OrderPayment" DROP CONSTRAINT "OrderPayment_transactionId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_paymentMethodId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_id_key" ON "Customer"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_organizationId_id_key" ON "ProductType"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Category_organizationId_id_key" ON "Category"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_organizationId_id_key" ON "PaymentMethod"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_id_key" ON "Order"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPayment_organizationId_transactionId_key" ON "OrderPayment"("organizationId", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_organizationId_id_key" ON "Transaction"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "Customer"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_productTypeId_fkey" FOREIGN KEY ("organizationId", "productTypeId") REFERENCES "ProductType"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_organizationId_orderId_fkey" FOREIGN KEY ("organizationId", "orderId") REFERENCES "Order"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_organizationId_paymentMethodId_fkey" FOREIGN KEY ("organizationId", "paymentMethodId") REFERENCES "PaymentMethod"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_organizationId_transactionId_fkey" FOREIGN KEY ("organizationId", "transactionId") REFERENCES "Transaction"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_organizationId_categoryId_fkey" FOREIGN KEY ("organizationId", "categoryId") REFERENCES "Category"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_organizationId_paymentMethodId_fkey" FOREIGN KEY ("organizationId", "paymentMethodId") REFERENCES "PaymentMethod"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
