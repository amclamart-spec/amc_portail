/*
  Warnings:

  - You are about to drop the column `processed_at` on the `payment_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `processed_at` on the `refunds` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payment_transactions" DROP COLUMN "processed_at",
ADD COLUMN     "processedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "refunds" DROP COLUMN "processed_at",
ADD COLUMN     "processedAt" TIMESTAMP(3);
