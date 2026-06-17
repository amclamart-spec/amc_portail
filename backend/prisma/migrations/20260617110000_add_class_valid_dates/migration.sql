-- Add validity date range to classes
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "valid_from" TIMESTAMP(3);
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "valid_to" TIMESTAMP(3);
