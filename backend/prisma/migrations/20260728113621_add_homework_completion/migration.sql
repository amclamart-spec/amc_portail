-- CreateTable
CREATE TABLE "homework_completions" (
    "id" TEXT NOT NULL,
    "homework_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "homework_completions_homework_id_student_id_key" ON "homework_completions"("homework_id", "student_id");

-- AddForeignKey
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_homework_id_fkey" FOREIGN KEY ("homework_id") REFERENCES "homework_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_completions" ADD CONSTRAINT "homework_completions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

