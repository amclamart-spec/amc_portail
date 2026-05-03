/*
  Warnings:

  - You are about to drop the column `status` on the `school_years` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `school_years` table. All the data in the column will be lost.
  - You are about to drop the `activity_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `messages` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "activity_logs" DROP CONSTRAINT "activity_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_sent_by_fkey";

-- AlterTable
ALTER TABLE "school_years" DROP COLUMN "status",
DROP COLUMN "updated_at";

-- DropTable
DROP TABLE "activity_logs";

-- DropTable
DROP TABLE "messages";

-- DropEnum
DROP TYPE "MessageStatus";

-- DropEnum
DROP TYPE "RecipientType";

-- DropEnum
DROP TYPE "SchoolYearStatus";
