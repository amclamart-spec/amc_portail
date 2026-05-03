-- CreateEnum
CREATE TYPE "SchoolYearStatus" AS ENUM ('UPCOMING', 'CURRENT', 'ARCHIVED');

-- AlterTable
ALTER TABLE "school_years"
ADD COLUMN "status" "SchoolYearStatus" NOT NULL DEFAULT 'UPCOMING',
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill status based on current flag and end date
UPDATE "school_years"
SET "status" = CASE
  WHEN "is_current" = true THEN 'CURRENT'::"SchoolYearStatus"
  WHEN "end_date" < CURRENT_DATE THEN 'ARCHIVED'::"SchoolYearStatus"
  ELSE 'UPCOMING'::"SchoolYearStatus"
END;

-- CreateTable
CREATE TABLE "activity_logs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "details" JSONB,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_timestamp_idx" ON "activity_logs"("timestamp");

-- CreateIndex
CREATE INDEX "activity_logs_entity_type_entity_id_idx" ON "activity_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
