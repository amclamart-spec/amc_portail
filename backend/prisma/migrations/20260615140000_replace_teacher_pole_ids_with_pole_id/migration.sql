-- Drop the old pole_ids array column
ALTER TABLE "teachers" DROP COLUMN IF EXISTS "pole_ids";

-- Add single pole_id FK
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "pole_id" TEXT;

-- Add FK constraint
ALTER TABLE "teachers"
  ADD CONSTRAINT "teachers_pole_id_fkey"
  FOREIGN KEY ("pole_id") REFERENCES "poles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
