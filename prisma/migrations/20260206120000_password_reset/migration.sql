-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "resetPasswordTokenHash" VARCHAR(64),
ADD COLUMN     "resetPasswordTokenExpires" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Customer_resetPasswordTokenHash_idx" ON "Customer"("resetPasswordTokenHash");
