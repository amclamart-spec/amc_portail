-- CreateTable
CREATE TABLE "bulletins" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'ANNUEL',
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "published_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulletins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bulletins_student_id_created_at_idx" ON "bulletins"("student_id", "created_at");

-- AddForeignKey
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

