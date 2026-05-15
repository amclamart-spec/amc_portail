/*
  Warnings:

  - A unique constraint covering the columns `[registration_code]` on the table `enrollments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "registration_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_registration_code_key" ON "enrollments"("registration_code");
