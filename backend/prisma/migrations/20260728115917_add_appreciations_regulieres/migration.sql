-- CreateTable
CREATE TABLE "appreciations_regulieres" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commentaire" TEXT,
    "note_travail" INTEGER NOT NULL,
    "note_comportement" INTEGER NOT NULL,
    "vu" BOOLEAN NOT NULL DEFAULT false,
    "vu_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appreciations_regulieres_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appreciations_regulieres_student_id_date_idx" ON "appreciations_regulieres"("student_id", "date");

-- CreateIndex
CREATE INDEX "appreciations_regulieres_class_id_idx" ON "appreciations_regulieres"("class_id");

-- AddForeignKey
ALTER TABLE "appreciations_regulieres" ADD CONSTRAINT "appreciations_regulieres_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appreciations_regulieres" ADD CONSTRAINT "appreciations_regulieres_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appreciations_regulieres" ADD CONSTRAINT "appreciations_regulieres_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

