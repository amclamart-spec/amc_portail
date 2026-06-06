-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "is_waitlist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waitlist_order" INTEGER;
