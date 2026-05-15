-- Ajout mode espèces au plan de paiement
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentPlanType' AND e.enumlabel = 'ESPECES'
  ) THEN
    ALTER TYPE "PaymentPlanType" ADD VALUE 'ESPECES';
  END IF;
END$$;

-- Enum présence
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceStatus') THEN
    CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'RETARD', 'JUSTIFIE');
  END IF;
END$$;

-- Historique des présences
CREATE TABLE IF NOT EXISTS "student_attendance" (
  "id" TEXT NOT NULL,
  "class_id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "teacher_id" TEXT NOT NULL,
  "attendance_date" DATE NOT NULL,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "remark" TEXT,
  "email_sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_attendance_class_id_student_id_attendance_date_key"
ON "student_attendance"("class_id", "student_id", "attendance_date");

CREATE INDEX IF NOT EXISTS "student_attendance_teacher_id_attendance_date_idx"
ON "student_attendance"("teacher_id", "attendance_date");

-- Remarques pédagogiques
CREATE TABLE IF NOT EXISTS "student_remarks" (
  "id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "teacher_id" TEXT NOT NULL,
  "class_id" TEXT,
  "remark" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_remarks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_remarks_student_id_created_at_idx"
ON "student_remarks"("student_id", "created_at");

CREATE INDEX IF NOT EXISTS "student_remarks_teacher_id_created_at_idx"
ON "student_remarks"("teacher_id", "created_at");

-- Messages de classe
CREATE TABLE IF NOT EXISTS "class_messages" (
  "id" TEXT NOT NULL,
  "class_id" TEXT NOT NULL,
  "teacher_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "class_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "class_messages_class_id_created_at_idx"
ON "class_messages"("class_id", "created_at");

-- Templates email dynamiques
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_templates') THEN
    CREATE TABLE "email_templates" (
      "id" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "html_body" TEXT NOT NULL,
      "text_body" TEXT,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
    );
  ELSE
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'name') THEN
      ALTER TABLE "email_templates" RENAME COLUMN "name" TO "key";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'body') THEN
      ALTER TABLE "email_templates" RENAME COLUMN "body" TO "html_body";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'variables') THEN
      ALTER TABLE "email_templates" DROP COLUMN "variables";
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'text_body') THEN
      ALTER TABLE "email_templates" ADD COLUMN "text_body" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'is_active') THEN
      ALTER TABLE "email_templates" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'html_body') THEN
      ALTER TABLE "email_templates" ADD COLUMN "html_body" TEXT NOT NULL DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'key') THEN
      ALTER TABLE "email_templates" ADD COLUMN "key" TEXT NOT NULL DEFAULT '';
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'email_templates_name_key' AND relkind = 'i') THEN
    DROP INDEX "email_templates_name_key";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'email_templates' AND indexname = 'email_templates_key_key') THEN
    CREATE UNIQUE INDEX "email_templates_key_key" ON "email_templates"("key");
  END IF;
END$$;

-- Clés étrangères
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_attendance_class_id_fkey'
  ) THEN
    ALTER TABLE "student_attendance"
      ADD CONSTRAINT "student_attendance_class_id_fkey"
      FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_attendance_student_id_fkey'
  ) THEN
    ALTER TABLE "student_attendance"
      ADD CONSTRAINT "student_attendance_student_id_fkey"
      FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_attendance_teacher_id_fkey'
  ) THEN
    ALTER TABLE "student_attendance"
      ADD CONSTRAINT "student_attendance_teacher_id_fkey"
      FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_remarks_student_id_fkey'
  ) THEN
    ALTER TABLE "student_remarks"
      ADD CONSTRAINT "student_remarks_student_id_fkey"
      FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_remarks_teacher_id_fkey'
  ) THEN
    ALTER TABLE "student_remarks"
      ADD CONSTRAINT "student_remarks_teacher_id_fkey"
      FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_remarks_class_id_fkey'
  ) THEN
    ALTER TABLE "student_remarks"
      ADD CONSTRAINT "student_remarks_class_id_fkey"
      FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_messages_class_id_fkey'
  ) THEN
    ALTER TABLE "class_messages"
      ADD CONSTRAINT "class_messages_class_id_fkey"
      FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_messages_teacher_id_fkey'
  ) THEN
    ALTER TABLE "class_messages"
      ADD CONSTRAINT "class_messages_teacher_id_fkey"
      FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
