-- AlterTable
ALTER TABLE "bulletin_scolaire_uploads" ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'ANNUEL';

-- AlterTable
ALTER TABLE "notes_scolaires" ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'ANNUEL';

-- CreateIndex
CREATE INDEX "bulletin_scolaire_uploads_student_id_period_idx" ON "bulletin_scolaire_uploads"("student_id", "period");

-- CreateIndex
CREATE INDEX "notes_scolaires_student_id_period_idx" ON "notes_scolaires"("student_id", "period");

