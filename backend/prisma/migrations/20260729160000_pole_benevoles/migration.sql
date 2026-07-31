-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'RESPONSABLE_POLE_BENEVOLES';
ALTER TYPE "Role" ADD VALUE 'BENEVOLE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "photo_url" TEXT;

-- CreateTable
CREATE TABLE "volunteer_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "volunteer_events_start_date_idx" ON "volunteer_events"("start_date");

-- AddForeignKey
ALTER TABLE "volunteer_events" ADD CONSTRAINT "volunteer_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
