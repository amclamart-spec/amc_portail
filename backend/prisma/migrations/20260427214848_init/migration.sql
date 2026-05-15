/*
  Warnings:

  - The values [ESPECES] on the enum `PaymentPlanType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `class_messages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `email_templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `student_attendance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `student_remarks` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentPlanType_new" AS ENUM ('STRIPE_CARD', 'GO_CARDLESS_SEPA', 'CHEQUE', 'ESPECES');
ALTER TABLE "payment_plans" ALTER COLUMN "type" TYPE "PaymentPlanType_new" USING ("type"::text::"PaymentPlanType_new");
ALTER TYPE "PaymentPlanType" RENAME TO "PaymentPlanType_old";
ALTER TYPE "PaymentPlanType_new" RENAME TO "PaymentPlanType";
DROP TYPE "PaymentPlanType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "class_messages" DROP CONSTRAINT "class_messages_class_id_fkey";

-- DropForeignKey
ALTER TABLE "class_messages" DROP CONSTRAINT "class_messages_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "student_attendance" DROP CONSTRAINT "student_attendance_class_id_fkey";

-- DropForeignKey
ALTER TABLE "student_attendance" DROP CONSTRAINT "student_attendance_student_id_fkey";

-- DropForeignKey
ALTER TABLE "student_attendance" DROP CONSTRAINT "student_attendance_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "student_remarks" DROP CONSTRAINT "student_remarks_class_id_fkey";

-- DropForeignKey
ALTER TABLE "student_remarks" DROP CONSTRAINT "student_remarks_student_id_fkey";

-- DropForeignKey
ALTER TABLE "student_remarks" DROP CONSTRAINT "student_remarks_teacher_id_fkey";

-- DropTable
DROP TABLE "class_messages";

-- DropTable
DROP TABLE "email_templates";

-- DropTable
DROP TABLE "student_attendance";

-- DropTable
DROP TABLE "student_remarks";

-- DropEnum
DROP TYPE "AttendanceStatus";
