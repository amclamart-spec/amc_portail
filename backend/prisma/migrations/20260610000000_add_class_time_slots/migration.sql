-- CreateTable
CREATE TABLE "class_time_slots" (
    "class_id" TEXT NOT NULL,
    "time_slot_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "class_time_slots_pkey" PRIMARY KEY ("class_id","time_slot_id")
);

-- AddForeignKey
ALTER TABLE "class_time_slots" ADD CONSTRAINT "class_time_slots_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_time_slots" ADD CONSTRAINT "class_time_slots_time_slot_id_fkey"
    FOREIGN KEY ("time_slot_id") REFERENCES "time_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MigrateExistingData: copy current single timeSlotId into junction table
INSERT INTO "class_time_slots" ("class_id", "time_slot_id", "sort_order")
SELECT "id", "time_slot_id", 0
FROM "classes"
WHERE "time_slot_id" IS NOT NULL
ON CONFLICT DO NOTHING;
