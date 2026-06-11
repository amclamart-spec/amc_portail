ALTER TABLE "time_slots" ADD COLUMN "pole_id" TEXT;

ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_pole_id_fkey"
    FOREIGN KEY ("pole_id") REFERENCES "poles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "time_slots_pole_id_idx" ON "time_slots"("pole_id");
