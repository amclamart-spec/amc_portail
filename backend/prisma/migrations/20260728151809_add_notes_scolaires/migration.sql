-- CreateTable
CREATE TABLE "notes_scolaires" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "matiere" TEXT NOT NULL,
    "note" DOUBLE PRECISION NOT NULL,
    "bareme" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commentaire" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_scolaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin_scolaire_uploads" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulletin_scolaire_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notes_scolaires_student_id_matiere_idx" ON "notes_scolaires"("student_id", "matiere");

-- CreateIndex
CREATE INDEX "notes_scolaires_class_id_idx" ON "notes_scolaires"("class_id");

-- CreateIndex
CREATE INDEX "bulletin_scolaire_uploads_student_id_created_at_idx" ON "bulletin_scolaire_uploads"("student_id", "created_at");

-- AddForeignKey
ALTER TABLE "notes_scolaires" ADD CONSTRAINT "notes_scolaires_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes_scolaires" ADD CONSTRAINT "notes_scolaires_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_scolaire_uploads" ADD CONSTRAINT "bulletin_scolaire_uploads_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_scolaire_uploads" ADD CONSTRAINT "bulletin_scolaire_uploads_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

