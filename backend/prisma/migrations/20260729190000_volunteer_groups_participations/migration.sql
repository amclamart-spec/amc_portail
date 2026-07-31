-- CreateEnum
CREATE TYPE "VolunteerAttendanceStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');

-- CreateTable
CREATE TABLE "volunteer_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "volunteer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volunteer_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_event_groups" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,

    CONSTRAINT "volunteer_event_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_event_participations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "volunteer_id" TEXT NOT NULL,
    "attendance_status" "VolunteerAttendanceStatus" NOT NULL DEFAULT 'PENDING',
    "hours_spent" DECIMAL(5,2),
    "hours_note" TEXT,
    "hours_validated" BOOLEAN NOT NULL DEFAULT false,
    "validated_by" TEXT,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_event_participations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_group_members_group_id_volunteer_id_key" ON "volunteer_group_members"("group_id", "volunteer_id");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_event_groups_event_id_group_id_key" ON "volunteer_event_groups"("event_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_event_participations_event_id_volunteer_id_key" ON "volunteer_event_participations"("event_id", "volunteer_id");

-- AddForeignKey
ALTER TABLE "volunteer_groups" ADD CONSTRAINT "volunteer_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_group_members" ADD CONSTRAINT "volunteer_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "volunteer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_group_members" ADD CONSTRAINT "volunteer_group_members_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_event_groups" ADD CONSTRAINT "volunteer_event_groups_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "volunteer_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_event_groups" ADD CONSTRAINT "volunteer_event_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "volunteer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_event_participations" ADD CONSTRAINT "volunteer_event_participations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "volunteer_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_event_participations" ADD CONSTRAINT "volunteer_event_participations_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_event_participations" ADD CONSTRAINT "volunteer_event_participations_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
