-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TeacherStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "rooms" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "equipments" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "location" TEXT,
  "status" "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "time_slots" (
  "id" TEXT NOT NULL,
  "day_of_week" TEXT NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "room_id" TEXT NOT NULL,
  "recurring" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "teachers" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "civility" "Civility" NOT NULL DEFAULT 'M',
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "TeacherStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_name_key" ON "rooms"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "teachers_user_id_key" ON "teachers"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "teachers_email_key" ON "teachers"("email");
CREATE INDEX IF NOT EXISTS "time_slots_day_of_week_start_time_end_time_idx" ON "time_slots"("day_of_week", "start_time", "end_time");
CREATE INDEX IF NOT EXISTS "time_slots_room_id_day_of_week_idx" ON "time_slots"("room_id", "day_of_week");

-- Alter classes table
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "pole_id" TEXT;
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "time_slot_id" TEXT;
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "room_id" TEXT;
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "teacher_id" TEXT;

-- Backfill pole_id from level
UPDATE "classes" c
SET "pole_id" = l."pole_id"
FROM "levels" l
WHERE c."level_id" = l."id" AND c."pole_id" IS NULL;

-- Backfill rooms from legacy room names
INSERT INTO "rooms" ("id", "name", "capacity", "equipments", "location", "status", "created_at", "updated_at")
SELECT md5(random()::text || clock_timestamp()::text), c."room", GREATEST(COALESCE(MAX(c."capacity"), 20), 1), ARRAY[]::TEXT[], NULL, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "classes" c
LEFT JOIN "rooms" r ON r."name" = c."room"
WHERE c."room" IS NOT NULL AND trim(c."room") <> '' AND r."id" IS NULL
GROUP BY c."room";

UPDATE "classes" c
SET "room_id" = r."id"
FROM "rooms" r
WHERE c."room" = r."name" AND c."room_id" IS NULL;

-- Backfill teacher profiles from users
INSERT INTO "teachers" ("id", "user_id", "civility", "first_name", "last_name", "email", "phone", "specialties", "status", "created_at", "updated_at")
SELECT md5(random()::text || clock_timestamp()::text), u."id", 'M', u."first_name", u."last_name", u."email", u."phone", ARRAY[]::TEXT[], 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" u
LEFT JOIN "teachers" t ON t."user_id" = u."id"
WHERE u."role" = 'PROFESSEUR' AND t."id" IS NULL;

UPDATE "classes" c
SET "teacher_id" = t."id"
FROM "teachers" t
WHERE c."teacher_user_id" = t."user_id" AND c."teacher_id" IS NULL;

-- Create generated timeslots from class schedules
INSERT INTO "time_slots" ("id", "day_of_week", "start_time", "end_time", "room_id", "recurring", "created_at", "updated_at")
SELECT md5(random()::text || clock_timestamp()::text), c."day_of_week", c."start_time", c."end_time", c."room_id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "classes" c
WHERE c."room_id" IS NOT NULL
  AND c."time_slot_id" IS NULL
  AND c."day_of_week" IS NOT NULL
  AND c."start_time" IS NOT NULL
  AND c."end_time" IS NOT NULL;

UPDATE "classes" c
SET "time_slot_id" = ts."id"
FROM "time_slots" ts
WHERE c."room_id" = ts."room_id"
  AND c."day_of_week" = ts."day_of_week"
  AND c."start_time" = ts."start_time"
  AND c."end_time" = ts."end_time"
  AND c."time_slot_id" IS NULL;

-- Indexes classes
CREATE INDEX IF NOT EXISTS "classes_school_year_id_pole_id_level_id_idx" ON "classes"("school_year_id", "pole_id", "level_id");
CREATE INDEX IF NOT EXISTS "classes_time_slot_id_idx" ON "classes"("time_slot_id");
CREATE INDEX IF NOT EXISTS "classes_room_id_idx" ON "classes"("room_id");
CREATE INDEX IF NOT EXISTS "classes_teacher_id_idx" ON "classes"("teacher_id");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "classes" ADD CONSTRAINT "classes_pole_id_fkey" FOREIGN KEY ("pole_id") REFERENCES "poles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "classes" ADD CONSTRAINT "classes_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "time_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "classes" ADD CONSTRAINT "classes_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;