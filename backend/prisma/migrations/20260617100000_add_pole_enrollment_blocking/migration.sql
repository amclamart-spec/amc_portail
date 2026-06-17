-- Add enrollment blocking flags to poles
ALTER TABLE "poles" ADD COLUMN IF NOT EXISTS "block_reenrollments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "poles" ADD COLUMN IF NOT EXISTS "block_new_enrollments" BOOLEAN NOT NULL DEFAULT false;
