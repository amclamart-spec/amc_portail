-- CreateTable
CREATE TABLE "coran_bulletin_uploads" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coran_bulletin_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coran_bulletin_uploads_student_id_created_at_idx" ON "coran_bulletin_uploads"("student_id", "created_at");

-- AddForeignKey
ALTER TABLE "coran_bulletin_uploads" ADD CONSTRAINT "coran_bulletin_uploads_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coran_bulletin_uploads" ADD CONSTRAINT "coran_bulletin_uploads_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

